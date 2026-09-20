import { ChannelType, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { AppError } from '../../utils/api-response';
import { AuditService } from '../../services/audit.service';
import { AuthenticatedUser } from '../../types/auth.types';
import { chatEvents, CHAT_EVENTS } from './chat.events';
import { NotificationService } from '../notifications/notifications.service';
import { NotificationCategory } from '@prisma/client';
import {
  SafeChatUserSummary,
  SafeChatMessageResponse,
  SafeConversationListItem,
  SafeChannelResponse,
  SafeChannelMemberResponse,
  SafeReactionSummary,
  SafeMentionSummary,
  SafeAttachmentSummary,
  CreateChannelDTO,
  UpdateChannelDTO,
  SendMessageDTO,
  EditMessageDTO,
  MessageListQuery,
  SearchMessagesQuery,
} from './chat.types';

export class ChatService {
  /**
   * Helper to format User into safe sender / participant preview
   */
  public static formatUser(user: any): SafeChatUserSummary | null {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      employeeId: user.employee?.id ?? user.employeeId ?? null,
      employeeCode: user.employee?.employeeCode,
      firstName: user.employee?.firstName,
      lastName: user.employee?.lastName,
      jobTitle: user.employee?.jobTitle,
      profileImage: user.employee?.profileImage ?? null,
    };
  }

  /**
   * Helper to format a single ChatMessage into safe response structure
   */
  public static async formatMessage(
    message: any,
    currentUserId: string
  ): Promise<SafeChatMessageResponse> {
    const isDeleted = Boolean(message.deletedAt);

    // If soft-deleted, redact content for non-admin viewers
    const content = isDeleted ? 'This message was deleted' : message.content;

    // Group reactions
    const reactionsMap = new Map<string, { count: number; users: { userId: string; name: string }[]; hasReacted: boolean }>();
    if (message.reactions && message.reactions.length > 0) {
      for (const r of message.reactions) {
        const userName = r.user?.employee
          ? `${r.user.employee.firstName} ${r.user.employee.lastName}`
          : r.user?.email || 'User';
        const existing = reactionsMap.get(r.emoji) || { count: 0, users: [], hasReacted: false };
        existing.count++;
        existing.users.push({ userId: r.userId, name: userName });
        if (r.userId === currentUserId) existing.hasReacted = true;
        reactionsMap.set(r.emoji, existing);
      }
    }
    const reactions: SafeReactionSummary[] = Array.from(reactionsMap.entries()).map(([emoji, data]) => ({
      emoji,
      count: data.count,
      users: data.users,
      hasReacted: data.hasReacted,
    }));

    // Mentions
    const mentions: SafeMentionSummary[] = (message.mentions || []).map((m: any) => ({
      userId: m.mentionedUserId,
      name: m.mentionedUser?.employee
        ? `${m.mentionedUser.employee.firstName} ${m.mentionedUser.employee.lastName}`
        : m.mentionedUser?.email || 'User',
      email: m.mentionedUser?.email || '',
    }));

    // Attachments (FileAsset records linked to this ChatMessage via polymorphic relatedType='CHAT_MESSAGE')
    let attachments: SafeAttachmentSummary[] = [];
    if (!isDeleted) {
      const files = await prisma.fileAsset.findMany({
        where: {
          relatedType: 'CHAT_MESSAGE',
          relatedId: message.id,
        },
      });
      attachments = files.map((f) => ({
        id: f.id,
        name: f.name,
        originalName: f.originalName,
        mimeType: f.mimeType,
        size: Number(f.size),
        downloadUrl: `/api/files/${f.id}/download`,
      }));
    }

    return {
      id: message.id,
      conversationId: message.conversationId,
      channelId: message.channelId,
      senderId: message.senderId,
      sender: this.formatUser(message.sender),
      content,
      isDeleted,
      parentMessageId: message.parentMessageId,
      parentMessage: message.parentMessage
        ? {
            id: message.parentMessage.id,
            senderId: message.parentMessage.senderId,
            senderName: message.parentMessage.sender?.employee
              ? `${message.parentMessage.sender.employee.firstName} ${message.parentMessage.sender.employee.lastName}`
              : message.parentMessage.sender?.email || 'User',
            content: message.parentMessage.deletedAt ? 'This message was deleted' : message.parentMessage.content,
          }
        : null,
      reactions,
      mentions,
      attachments,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }

  // ==========================================================================
  // ACCESS CONTROL & VALIDATION
  // ==========================================================================

  /**
   * Check whether a user has permission to access a channel or direct conversation.
   * Returns { type: 'CHANNEL' | 'DM', targetId: string, channel?: ChatChannel, conversation?: ChatConversation }
   */
  public static async assertConversationAccess(
    targetId: string,
    user: AuthenticatedUser
  ): Promise<{
    type: 'CHANNEL' | 'DM';
    id: string;
    channel?: any;
    conversation?: any;
  }> {
    // 1. Check if targetId is a ChatChannel
    const channel = await prisma.chatChannel.findUnique({
      where: { id: targetId },
      include: {
        project: {
          include: {
            members: true,
          },
        },
        members: true,
      },
    });

    if (channel) {
      if (user.isSuperAdmin) {
        return { type: 'CHANNEL', id: channel.id, channel };
      }

      // Project channel: Project Manager or Project Team Member has access
      if (channel.projectId && channel.project) {
        const isProjectManager = channel.project.managerId === user.employeeId;
        const isProjectMember = channel.project.members.some((m) => m.employeeId === user.employeeId);
        const isDirectMember = channel.members.some((m) => m.userId === user.userId);

        if (isProjectManager || isProjectMember || isDirectMember) {
          return { type: 'CHANNEL', id: channel.id, channel };
        }
      }

      // General or group channel: Must be a member unless public CHANNEL with open membership
      const isMember = channel.members.some((m) => m.userId === user.userId);
      if (isMember || channel.type === ChannelType.CHANNEL) {
        return { type: 'CHANNEL', id: channel.id, channel };
      }

      throw new AppError('Access denied: You are not a member of this chat channel', 403);
    }

    // 2. Check if targetId is a ChatConversation (DM)
    const dm = await prisma.chatConversation.findUnique({
      where: { id: targetId },
      include: {
        userOne: { include: { employee: true } },
        userTwo: { include: { employee: true } },
      },
    });

    if (dm) {
      if (user.isSuperAdmin || dm.userOneId === user.userId || dm.userTwoId === user.userId) {
        return { type: 'DM', id: dm.id, conversation: dm };
      }
      throw new AppError('Access denied: You are not a participant in this conversation', 403);
    }

    throw new AppError('Conversation or channel not found', 404);
  }

  // ==========================================================================
  // DIRECT MESSAGING (DM)
  // ==========================================================================

  /**
   * Get or create canonical 1-on-1 direct conversation between authenticated user and recipient
   */
  public static async getOrCreateDM(
    recipientUserId: string,
    currentUser: AuthenticatedUser
  ): Promise<SafeConversationListItem> {
    if (recipientUserId === currentUser.userId) {
      throw new AppError('Cannot start a direct message conversation with yourself', 400);
    }

    // Verify recipient user exists and is active
    const recipient = await prisma.user.findUnique({
      where: { id: recipientUserId },
      include: { employee: true },
    });

    if (!recipient || recipient.accountStatus !== 'ACTIVE') {
      throw new AppError('Recipient user not found or is inactive', 404);
    }

    // Canonical ordering: deterministic userOneId < userTwoId prevents duplicate reverse DMs
    const [userOneId, userTwoId] = [currentUser.userId, recipientUserId].sort();

    // Upsert canonical conversation
    const conversation = await prisma.chatConversation.upsert({
      where: {
        userOneId_userTwoId: {
          userOneId,
          userTwoId,
        },
      },
      create: {
        userOneId,
        userTwoId,
      },
      update: {},
      include: {
        userOne: { include: { employee: true } },
        userTwo: { include: { employee: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { include: { employee: true } } },
        },
      },
    });

    const otherUser = conversation.userOneId === currentUser.userId ? conversation.userTwo : conversation.userOne;
    const otherUserName = otherUser.employee
      ? `${otherUser.employee.firstName} ${otherUser.employee.lastName}`
      : otherUser.email;

    const lastMessage = conversation.messages[0] || null;

    return {
      id: conversation.id,
      type: 'DM',
      name: otherUserName,
      participants: [
        this.formatUser(conversation.userOne)!,
        this.formatUser(conversation.userTwo)!,
      ],
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            senderId: lastMessage.senderId,
            senderName: lastMessage.sender?.employee
              ? `${lastMessage.sender.employee.firstName} ${lastMessage.sender.employee.lastName}`
              : lastMessage.sender?.email || 'User',
            content: lastMessage.deletedAt ? 'This message was deleted' : lastMessage.content,
            createdAt: lastMessage.createdAt,
          }
        : null,
      lastActivityAt: lastMessage ? lastMessage.createdAt : conversation.createdAt,
      unreadCount: 0,
    };
  }

  // ==========================================================================
  // CHANNELS MANAGEMENT
  // ==========================================================================

  public static async listChannels(user: AuthenticatedUser): Promise<SafeChannelResponse[]> {
    const channels = await prisma.chatChannel.findMany({
      include: {
        project: {
          select: {
            id: true,
            projectCode: true,
            name: true,
            managerId: true,
            members: { select: { employeeId: true } },
          },
        },
        members: true,
        _count: {
          select: { members: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter channels based on record-level access
    const accessibleChannels = channels.filter((channel) => {
      if (user.isSuperAdmin) return true;
      if (channel.projectId && channel.project) {
        const isManager = channel.project.managerId === user.employeeId;
        const isMember = channel.project.members.some((m) => m.employeeId === user.employeeId);
        const isDirect = channel.members.some((m) => m.userId === user.userId);
        return isManager || isMember || isDirect;
      }
      if (channel.type === ChannelType.CHANNEL) return true;
      return channel.members.some((m) => m.userId === user.userId);
    });

    return accessibleChannels.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      type: c.type,
      createdById: c.createdById,
      projectId: c.projectId,
      project: c.project
        ? {
            id: c.project.id,
            projectCode: c.project.projectCode,
            name: c.project.name,
          }
        : null,
      membersCount: c._count.members,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  public static async createChannel(
    data: CreateChannelDTO,
    user: AuthenticatedUser
  ): Promise<SafeChannelResponse> {
    // If project channel, verify project exists
    if (data.projectId) {
      const project = await prisma.project.findUnique({ where: { id: data.projectId } });
      if (!project) {
        throw new AppError('Project not found for project chat channel', 404);
      }
    }

    const memberIds = new Set<string>(data.memberUserIds || []);
    memberIds.add(user.userId); // Ensure creator is included

    const channel = await prisma.$transaction(async (tx) => {
      const newChannel = await tx.chatChannel.create({
        data: {
          name: data.name.trim(),
          description: data.description?.trim() || null,
          type: data.type || (data.projectId ? ChannelType.PROJECT : ChannelType.CHANNEL),
          createdById: user.userId,
          projectId: data.projectId || null,
        },
      });

      // Add initial members
      if (memberIds.size > 0) {
        await tx.channelMember.createMany({
          data: Array.from(memberIds).map((uid) => ({
            channelId: newChannel.id,
            userId: uid,
            role: uid === user.userId ? 'ADMIN' : 'MEMBER',
          })),
        });
      }

      return newChannel;
    });

    await AuditService.log({
      userId: user.userId,
      action: 'CHAT_CHANNEL_CREATED',
      entityType: 'CHAT_CHANNEL',
      entityId: channel.id,
      metadata: {
        name: channel.name,
        type: channel.type,
        projectId: channel.projectId,
      },
    });

    const fullChannel = await prisma.chatChannel.findUnique({
      where: { id: channel.id },
      include: {
        project: { select: { id: true, projectCode: true, name: true } },
        _count: { select: { members: true } },
      },
    });

    return {
      id: fullChannel!.id,
      name: fullChannel!.name,
      description: fullChannel!.description,
      type: fullChannel!.type,
      createdById: fullChannel!.createdById,
      projectId: fullChannel!.projectId,
      project: fullChannel!.project,
      membersCount: fullChannel!._count.members,
      createdAt: fullChannel!.createdAt,
      updatedAt: fullChannel!.updatedAt,
    };
  }

  public static async getChannelById(
    channelId: string,
    user: AuthenticatedUser
  ): Promise<SafeChannelResponse> {
    const access = await this.assertConversationAccess(channelId, user);
    const channel = await prisma.chatChannel.findUnique({
      where: { id: access.id },
      include: {
        project: { select: { id: true, projectCode: true, name: true } },
        _count: { select: { members: true } },
      },
    });

    if (!channel) throw new AppError('Channel not found', 404);

    return {
      id: channel.id,
      name: channel.name,
      description: channel.description,
      type: channel.type,
      createdById: channel.createdById,
      projectId: channel.projectId,
      project: channel.project,
      membersCount: channel._count.members,
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
    };
  }

  public static async updateChannel(
    channelId: string,
    data: UpdateChannelDTO,
    user: AuthenticatedUser
  ): Promise<SafeChannelResponse> {
    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      include: { members: true },
    });

    if (!channel) throw new AppError('Channel not found', 404);

    // Permission check: Super Admin, or channel admin/creator
    const isChannelAdmin = channel.createdById === user.userId ||
      channel.members.some((m) => m.userId === user.userId && m.role === 'ADMIN');

    if (!user.isSuperAdmin && !isChannelAdmin) {
      throw new AppError('You do not have permission to manage this channel', 403);
    }

    const updated = await prisma.chatChannel.update({
      where: { id: channelId },
      data: {
        name: data.name !== undefined ? data.name.trim() : undefined,
        description: data.description !== undefined ? (data.description ? data.description.trim() : null) : undefined,
      },
      include: {
        project: { select: { id: true, projectCode: true, name: true } },
        _count: { select: { members: true } },
      },
    });

    await AuditService.log({
      userId: user.userId,
      action: 'CHAT_CHANNEL_UPDATED',
      entityType: 'CHAT_CHANNEL',
      entityId: channelId,
      metadata: { updatedFields: Object.keys(data) },
    });

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      type: updated.type,
      createdById: updated.createdById,
      projectId: updated.projectId,
      project: updated.project,
      membersCount: updated._count.members,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  public static async deleteChannel(
    channelId: string,
    user: AuthenticatedUser
  ): Promise<{ id: string; message: string }> {
    const channel = await prisma.chatChannel.findUnique({ where: { id: channelId } });
    if (!channel) throw new AppError('Channel not found', 404);

    // Only Super Admin or Channel creator can delete channel
    if (!user.isSuperAdmin && channel.createdById !== user.userId) {
      throw new AppError('You do not have permission to delete this channel', 403);
    }

    await prisma.chatChannel.delete({ where: { id: channelId } });

    await AuditService.log({
      userId: user.userId,
      action: 'CHAT_CHANNEL_ARCHIVED',
      entityType: 'CHAT_CHANNEL',
      entityId: channelId,
      metadata: { name: channel.name },
    });

    return { id: channelId, message: `Channel "${channel.name}" deleted successfully` };
  }

  // ==========================================================================
  // CHANNEL MEMBERS
  // ==========================================================================

  public static async listChannelMembers(
    channelId: string,
    user: AuthenticatedUser
  ): Promise<SafeChannelMemberResponse[]> {
    await this.assertConversationAccess(channelId, user);

    const members = await prisma.channelMember.findMany({
      where: { channelId },
      include: {
        user: { include: { employee: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return members.map((m) => ({
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      user: this.formatUser(m.user)!,
    }));
  }

  public static async addChannelMember(
    channelId: string,
    targetUserId: string,
    role = 'MEMBER',
    user: AuthenticatedUser
  ): Promise<SafeChannelMemberResponse> {
    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      include: { members: true },
    });
    if (!channel) throw new AppError('Channel not found', 404);

    // Permission check
    const isChannelAdmin = channel.createdById === user.userId ||
      channel.members.some((m) => m.userId === user.userId && m.role === 'ADMIN');
    if (!user.isSuperAdmin && !isChannelAdmin) {
      throw new AppError('You do not have permission to add members to this channel', 403);
    }

    // Verify target user exists and is active
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { employee: true },
    });
    if (!targetUser || targetUser.accountStatus !== 'ACTIVE') {
      throw new AppError('User not found or is inactive', 404);
    }

    const member = await prisma.channelMember.upsert({
      where: {
        channelId_userId: {
          channelId,
          userId: targetUserId,
        },
      },
      update: { role },
      create: {
        channelId,
        userId: targetUserId,
        role,
      },
      include: {
        user: { include: { employee: true } },
      },
    });

    await AuditService.log({
      userId: user.userId,
      action: 'CHAT_MEMBER_ADDED',
      entityType: 'CHAT_CHANNEL',
      entityId: channelId,
      metadata: { targetUserId, role },
    });

    return {
      userId: member.userId,
      role: member.role,
      joinedAt: member.joinedAt,
      user: this.formatUser(member.user)!,
    };
  }

  public static async removeChannelMember(
    channelId: string,
    targetUserId: string,
    user: AuthenticatedUser
  ): Promise<{ message: string }> {
    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      include: { members: true },
    });
    if (!channel) throw new AppError('Channel not found', 404);

    // Member can leave on their own, or admin can remove
    const isSelf = targetUserId === user.userId;
    const isChannelAdmin = channel.createdById === user.userId ||
      channel.members.some((m) => m.userId === user.userId && m.role === 'ADMIN');

    if (!user.isSuperAdmin && !isSelf && !isChannelAdmin) {
      throw new AppError('You do not have permission to remove members from this channel', 403);
    }

    await prisma.channelMember.deleteMany({
      where: {
        channelId,
        userId: targetUserId,
      },
    });

    await AuditService.log({
      userId: user.userId,
      action: 'CHAT_MEMBER_REMOVED',
      entityType: 'CHAT_CHANNEL',
      entityId: channelId,
      metadata: { targetUserId },
    });

    return { message: 'Member removed from channel successfully' };
  }

  // ==========================================================================
  // PROJECT CHAT CONVERSATION
  // ==========================================================================

  /**
   * Get or create canonical primary project chat channel
   */
  public static async getProjectChat(
    projectId: string,
    user: AuthenticatedUser
  ): Promise<SafeChannelResponse> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: true,
      },
    });
    if (!project) throw new AppError('Project not found', 404);

    // Record-level access check for project
    if (!user.isSuperAdmin) {
      const isManager = project.managerId === user.employeeId;
      const isMember = project.members.some((m) => m.employeeId === user.employeeId);
      if (!isManager && !isMember) {
        throw new AppError('Access denied: You are not assigned to this project', 403);
      }
    }

    // Find existing primary channel for project
    let channel = await prisma.chatChannel.findFirst({
      where: {
        projectId,
        type: ChannelType.PROJECT,
      },
      include: {
        project: { select: { id: true, projectCode: true, name: true } },
        _count: { select: { members: true } },
      },
    });

    // Create if missing
    if (!channel) {
      const created = await prisma.chatChannel.create({
        data: {
          name: `${project.name} Chat`,
          description: `Project discussion for ${project.projectCode}`,
          type: ChannelType.PROJECT,
          projectId,
          createdById: user.userId,
          members: {
            create: {
              userId: user.userId,
              role: 'ADMIN',
            },
          },
        },
        include: {
          project: { select: { id: true, projectCode: true, name: true } },
          _count: { select: { members: true } },
        },
      });
      channel = created;
    }

    return {
      id: channel.id,
      name: channel.name,
      description: channel.description,
      type: channel.type,
      createdById: channel.createdById,
      projectId: channel.projectId,
      project: channel.project,
      membersCount: channel._count.members,
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
    };
  }

  // ==========================================================================
  // MESSAGES: SEND, LIST, EDIT, DELETE, REACTIONS, MENTIONS
  // ==========================================================================

  public static async listMessages(
    conversationOrChannelId: string,
    query: MessageListQuery,
    user: AuthenticatedUser
  ): Promise<{ items: SafeChatMessageResponse[]; nextCursor: string | null }> {
    const access = await this.assertConversationAccess(conversationOrChannelId, user);
    const limit = query.limit || 50;

    const where: Prisma.ChatMessageWhereInput = access.type === 'CHANNEL'
      ? { channelId: access.id }
      : { conversationId: access.id };

    if (query.cursor) {
      const cursorMessage = await prisma.chatMessage.findUnique({ where: { id: query.cursor } });
      if (cursorMessage) {
        if (query.direction === 'after') {
          where.createdAt = { gt: cursorMessage.createdAt };
        } else {
          where.createdAt = { lt: cursorMessage.createdAt };
        }
      }
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { include: { employee: true } },
        parentMessage: {
          include: { sender: { include: { employee: true } } },
        },
        reactions: {
          include: { user: { include: { employee: true } } },
        },
        mentions: {
          include: { mentionedUser: { include: { employee: true } } },
        },
      },
    });

    const hasMore = messages.length > limit;
    const itemsRaw = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? itemsRaw[itemsRaw.length - 1].id : null;

    const formatted = await Promise.all(itemsRaw.map((m) => this.formatMessage(m, user.userId)));

    return {
      items: formatted,
      nextCursor,
    };
  }

  public static async sendMessage(
    conversationOrChannelId: string,
    data: SendMessageDTO,
    user: AuthenticatedUser
  ): Promise<SafeChatMessageResponse> {
    const access = await this.assertConversationAccess(conversationOrChannelId, user);

    // Validate replyTo is within same conversation
    if (data.parentMessageId) {
      const parent = await prisma.chatMessage.findUnique({ where: { id: data.parentMessageId } });
      if (!parent) throw new AppError('Reply parent message not found', 404);

      if (access.type === 'CHANNEL' && parent.channelId !== access.id) {
        throw new AppError('Cross-conversation replies are not permitted', 400);
      }
      if (access.type === 'DM' && parent.conversationId !== access.id) {
        throw new AppError('Cross-conversation replies are not permitted', 400);
      }
    }

    // Validate attachments exist and user has access
    if (data.attachmentFileIds && data.attachmentFileIds.length > 0) {
      for (const fId of data.attachmentFileIds) {
        const file = await prisma.fileAsset.findUnique({ where: { id: fId } });
        if (!file) {
          throw new AppError(`Attachment file ${fId} not found`, 404);
        }
      }
    }

    // Persist message in PostgreSQL transaction
    const createdMessage = await prisma.$transaction(async (tx) => {
      const msg = await tx.chatMessage.create({
        data: {
          content: data.content,
          senderId: user.userId,
          channelId: access.type === 'CHANNEL' ? access.id : null,
          conversationId: access.type === 'DM' ? access.id : null,
          parentMessageId: data.parentMessageId || null,
        },
      });

      // Link attachments to this ChatMessage
      if (data.attachmentFileIds && data.attachmentFileIds.length > 0) {
        await tx.fileAsset.updateMany({
          where: { id: { in: data.attachmentFileIds } },
          data: {
            relatedType: 'CHAT_MESSAGE',
            relatedId: msg.id,
          },
        });
      }

      // Record mentions
      if (data.mentionUserIds && data.mentionUserIds.length > 0) {
        const uniqueMentions = Array.from(new Set(data.mentionUserIds));
        await tx.chatMention.createMany({
          data: uniqueMentions.map((mentionedId) => ({
            messageId: msg.id,
            mentionedUserId: mentionedId,
          })),
        });
      }

      // Update sender's read pointer
      if (access.type === 'CHANNEL') {
        await tx.channelMember.updateMany({
          where: { channelId: access.id, userId: user.userId },
          data: { lastReadAt: new Date(), lastReadMessageId: msg.id },
        });
      } else {
        const isUserOne = access.conversation.userOneId === user.userId;
        await tx.chatConversation.update({
          where: { id: access.id },
          data: isUserOne
            ? { userOneLastReadAt: new Date(), userOneLastReadMsgId: msg.id }
            : { userTwoLastReadAt: new Date(), userTwoLastReadMsgId: msg.id },
        });
      }

      return msg;
    });

    const fullMessage = await prisma.chatMessage.findUnique({
      where: { id: createdMessage.id },
      include: {
        sender: { include: { employee: true } },
        parentMessage: {
          include: { sender: { include: { employee: true } } },
        },
        reactions: {
          include: { user: { include: { employee: true } } },
        },
        mentions: {
          include: { mentionedUser: { include: { employee: true } } },
        },
      },
    });

    const formatted = await this.formatMessage(fullMessage!, user.userId);

    // Emit event for real-time delivery
    chatEvents.emit(CHAT_EVENTS.MESSAGE_NEW, {
      conversationId: access.id,
      message: formatted,
      senderId: user.userId,
    });

    // 1. Dispatch CHAT_MENTION notifications for mentioned users
    if (data.mentionUserIds && data.mentionUserIds.length > 0) {
      const uniqueMentions = Array.from(new Set(data.mentionUserIds));
      for (const targetUserId of uniqueMentions) {
        if (targetUserId !== user.userId) {
          NotificationService.createNotification({
            userId: targetUserId,
            type: 'CHAT_MENTION',
            title: `Mentioned by ${formatted.sender?.firstName || user.email}`,
            message: formatted.content.length > 100 ? `${formatted.content.slice(0, 97)}...` : formatted.content,
            entityType: 'CHAT',
            entityId: access.id,
            actorId: user.userId,
            category: NotificationCategory.CHAT,
            metadata: {
              conversationId: access.id,
              messageId: formatted.id,
            },
          }).catch(() => {});
        }
      }
    }

    // 2. Dispatch CHAT_MESSAGE notification if 1-on-1 Direct Message (DM)
    if (access.type === 'DM' && access.conversation) {
      const otherUserId = access.conversation.userOneId === user.userId
        ? access.conversation.userTwoId
        : access.conversation.userOneId;

      NotificationService.createNotification({
        userId: otherUserId,
        type: 'CHAT_MESSAGE',
        title: `Direct Message from ${formatted.sender?.firstName || user.email}`,
        message: formatted.content.length > 100 ? `${formatted.content.slice(0, 97)}...` : formatted.content,
        entityType: 'CHAT',
        entityId: access.id,
        actorId: user.userId,
        category: NotificationCategory.CHAT,
        metadata: {
          conversationId: access.id,
          messageId: formatted.id,
        },
      }).catch(() => {});
    }

    return formatted;
  }

  public static async editMessage(
    messageId: string,
    data: EditMessageDTO,
    user: AuthenticatedUser
  ): Promise<SafeChatMessageResponse> {
    const existing = await prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!existing) throw new AppError('Message not found', 404);
    if (existing.deletedAt) throw new AppError('Cannot edit a deleted message', 400);

    // Only author or Super Admin can edit
    if (!user.isSuperAdmin && existing.senderId !== user.userId) {
      throw new AppError('You do not have permission to edit this message', 403);
    }

    const updated = await prisma.chatMessage.update({
      where: { id: messageId },
      data: { content: data.content.trim() },
      include: {
        sender: { include: { employee: true } },
        parentMessage: {
          include: { sender: { include: { employee: true } } },
        },
        reactions: {
          include: { user: { include: { employee: true } } },
        },
        mentions: {
          include: { mentionedUser: { include: { employee: true } } },
        },
      },
    });

    const formatted = await this.formatMessage(updated, user.userId);
    const targetRoomId = updated.channelId || updated.conversationId!;

    chatEvents.emit(CHAT_EVENTS.MESSAGE_UPDATED, {
      conversationId: targetRoomId,
      message: formatted,
    });

    return formatted;
  }

  public static async deleteMessage(
    messageId: string,
    user: AuthenticatedUser
  ): Promise<{ id: string; message: string }> {
    const existing = await prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!existing) throw new AppError('Message not found', 404);

    // Soft delete: author, Super Admin, or user with chat.delete_messages
    const canDelete = user.isSuperAdmin || existing.senderId === user.userId || user.permissions.has('chat.delete_messages');
    if (!canDelete) {
      throw new AppError('You do not have permission to delete this message', 403);
    }

    await prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    const targetRoomId = existing.channelId || existing.conversationId!;

    chatEvents.emit(CHAT_EVENTS.MESSAGE_DELETED, {
      conversationId: targetRoomId,
      messageId,
    });

    return { id: messageId, message: 'Message deleted successfully' };
  }

  // ==========================================================================
  // REACTIONS
  // ==========================================================================

  public static async addReaction(
    messageId: string,
    emoji: string,
    user: AuthenticatedUser
  ): Promise<SafeChatMessageResponse> {
    const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new AppError('Message not found', 404);
    if (message.deletedAt) throw new AppError('Cannot react to a deleted message', 400);

    const targetId = message.channelId || message.conversationId!;
    await this.assertConversationAccess(targetId, user);

    // Upsert reaction (prevents duplicate reaction from same user with same emoji)
    await prisma.chatReaction.upsert({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId: user.userId,
          emoji,
        },
      },
      update: {},
      create: {
        messageId,
        userId: user.userId,
        emoji,
      },
    });

    const updated = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: {
        sender: { include: { employee: true } },
        parentMessage: { include: { sender: { include: { employee: true } } } },
        reactions: { include: { user: { include: { employee: true } } } },
        mentions: { include: { mentionedUser: { include: { employee: true } } } },
      },
    });

    const formatted = await this.formatMessage(updated!, user.userId);

    chatEvents.emit(CHAT_EVENTS.REACTION_UPDATED, {
      conversationId: targetId,
      message: formatted,
    });

    return formatted;
  }

  public static async removeReaction(
    messageId: string,
    emoji: string,
    user: AuthenticatedUser
  ): Promise<SafeChatMessageResponse> {
    const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new AppError('Message not found', 404);

    const targetId = message.channelId || message.conversationId!;
    await this.assertConversationAccess(targetId, user);

    await prisma.chatReaction.deleteMany({
      where: {
        messageId,
        userId: user.userId,
        emoji,
      },
    });

    const updated = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: {
        sender: { include: { employee: true } },
        parentMessage: { include: { sender: { include: { employee: true } } } },
        reactions: { include: { user: { include: { employee: true } } } },
        mentions: { include: { mentionedUser: { include: { employee: true } } } },
      },
    });

    const formatted = await this.formatMessage(updated!, user.userId);

    chatEvents.emit(CHAT_EVENTS.REACTION_UPDATED, {
      conversationId: targetId,
      message: formatted,
    });

    return formatted;
  }

  // ==========================================================================
  // READ STATE & UNREAD COUNTS
  // ==========================================================================

  public static async markAsRead(
    conversationOrChannelId: string,
    user: AuthenticatedUser
  ): Promise<{ success: boolean }> {
    const access = await this.assertConversationAccess(conversationOrChannelId, user);
    const now = new Date();

    if (access.type === 'CHANNEL') {
      await prisma.channelMember.updateMany({
        where: { channelId: access.id, userId: user.userId },
        data: { lastReadAt: now },
      });
    } else {
      const isUserOne = access.conversation.userOneId === user.userId;
      await prisma.chatConversation.update({
        where: { id: access.id },
        data: isUserOne ? { userOneLastReadAt: now } : { userTwoLastReadAt: now },
      });
    }

    chatEvents.emit(CHAT_EVENTS.CONVERSATION_READ, {
      conversationId: access.id,
      userId: user.userId,
      readAt: now,
    });

    return { success: true };
  }

  public static async getUnreadCounts(user: AuthenticatedUser): Promise<{
    totalUnread: number;
    conversations: Record<string, number>;
  }> {
    const countsMap: Record<string, number> = {};
    let totalUnread = 0;

    // 1. Unread from Channels where user is a member
    const channelMemberships = await prisma.channelMember.findMany({
      where: { userId: user.userId },
      select: { channelId: true, lastReadAt: true },
    });

    for (const membership of channelMemberships) {
      const unreadCount = await prisma.chatMessage.count({
        where: {
          channelId: membership.channelId,
          createdAt: { gt: membership.lastReadAt },
          senderId: { not: user.userId },
          deletedAt: null,
        },
      });

      if (unreadCount > 0) {
        countsMap[membership.channelId] = unreadCount;
        totalUnread += unreadCount;
      }
    }

    // 2. Unread from DMs
    const dms = await prisma.chatConversation.findMany({
      where: {
        OR: [{ userOneId: user.userId }, { userTwoId: user.userId }],
      },
    });

    for (const dm of dms) {
      const isUserOne = dm.userOneId === user.userId;
      const lastReadAt = isUserOne ? dm.userOneLastReadAt : dm.userTwoLastReadAt;

      const unreadCount = await prisma.chatMessage.count({
        where: {
          conversationId: dm.id,
          createdAt: { gt: lastReadAt },
          senderId: { not: user.userId },
          deletedAt: null,
        },
      });

      if (unreadCount > 0) {
        countsMap[dm.id] = unreadCount;
        totalUnread += unreadCount;
      }
    }

    return { totalUnread, conversations: countsMap };
  }

  // ==========================================================================
  // CONVERSATION LIST & SEARCH
  // ==========================================================================

  public static async listConversations(
    user: AuthenticatedUser
  ): Promise<SafeConversationListItem[]> {
    const items: SafeConversationListItem[] = [];

    // 1. Get DMs
    const dms = await prisma.chatConversation.findMany({
      where: {
        OR: [{ userOneId: user.userId }, { userTwoId: user.userId }],
      },
      include: {
        userOne: { include: { employee: true } },
        userTwo: { include: { employee: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { include: { employee: true } } },
        },
      },
    });

    for (const dm of dms) {
      const otherUser = dm.userOneId === user.userId ? dm.userTwo : dm.userOne;
      const otherUserName = otherUser.employee
        ? `${otherUser.employee.firstName} ${otherUser.employee.lastName}`
        : otherUser.email;
      const isUserOne = dm.userOneId === user.userId;
      const lastReadAt = isUserOne ? dm.userOneLastReadAt : dm.userTwoLastReadAt;

      const lastMsg = dm.messages[0] || null;

      const unreadCount = await prisma.chatMessage.count({
        where: {
          conversationId: dm.id,
          createdAt: { gt: lastReadAt },
          senderId: { not: user.userId },
          deletedAt: null,
        },
      });

      items.push({
        id: dm.id,
        type: 'DM',
        name: otherUserName,
        participants: [this.formatUser(dm.userOne)!, this.formatUser(dm.userTwo)!],
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              senderId: lastMsg.senderId,
              senderName: lastMsg.sender?.employee
                ? `${lastMsg.sender.employee.firstName} ${lastMsg.sender.employee.lastName}`
                : lastMsg.sender?.email || 'User',
              content: lastMsg.deletedAt ? 'This message was deleted' : lastMsg.content,
              createdAt: lastMsg.createdAt,
            }
          : null,
        lastActivityAt: lastMsg ? lastMsg.createdAt : dm.createdAt,
        unreadCount,
      });
    }

    // 2. Get Channels & Project Channels
    const channels = await prisma.chatChannel.findMany({
      include: {
        project: {
          select: {
            id: true,
            projectCode: true,
            name: true,
            managerId: true,
            members: { select: { employeeId: true } },
          },
        },
        members: {
          include: { user: { include: { employee: true } } },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { include: { employee: true } } },
        },
      },
    });

    for (const ch of channels) {
      let hasAccess = user.isSuperAdmin;
      if (!hasAccess && ch.projectId && ch.project) {
        hasAccess = ch.project.managerId === user.employeeId ||
          ch.project.members.some((m) => m.employeeId === user.employeeId) ||
          ch.members.some((m) => m.userId === user.userId);
      } else if (!hasAccess) {
        hasAccess = ch.type === ChannelType.CHANNEL || ch.members.some((m) => m.userId === user.userId);
      }

      if (!hasAccess) continue;

      const userMembership = ch.members.find((m) => m.userId === user.userId);
      const lastReadAt = userMembership?.lastReadAt || new Date(0);

      const lastMsg = ch.messages[0] || null;

      const unreadCount = await prisma.chatMessage.count({
        where: {
          channelId: ch.id,
          createdAt: { gt: lastReadAt },
          senderId: { not: user.userId },
          deletedAt: null,
        },
      });

      items.push({
        id: ch.id,
        type: ch.type === ChannelType.PROJECT ? 'PROJECT' : 'CHANNEL',
        name: ch.name,
        description: ch.description,
        projectId: ch.projectId,
        projectCode: ch.project?.projectCode,
        participants: ch.members.map((m) => this.formatUser(m.user)!),
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              senderId: lastMsg.senderId,
              senderName: lastMsg.sender?.employee
                ? `${lastMsg.sender.employee.firstName} ${lastMsg.sender.employee.lastName}`
                : lastMsg.sender?.email || 'User',
              content: lastMsg.deletedAt ? 'This message was deleted' : lastMsg.content,
              createdAt: lastMsg.createdAt,
            }
          : null,
        lastActivityAt: lastMsg ? lastMsg.createdAt : ch.createdAt,
        unreadCount,
      });
    }

    // Sort primarily by most recent activity timestamp
    return items.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  }

  public static async searchMessages(
    query: SearchMessagesQuery,
    user: AuthenticatedUser
  ): Promise<SafeChatMessageResponse[]> {
    const where: Prisma.ChatMessageWhereInput = {
      content: { contains: query.q, mode: 'insensitive' },
      deletedAt: null,
    };

    if (query.conversationId) where.conversationId = query.conversationId;
    if (query.channelId) where.channelId = query.channelId;
    if (query.senderId) where.senderId = query.senderId;

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = query.dateFrom;
      if (query.dateTo) where.createdAt.lte = query.dateTo;
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      take: query.limit || 20,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { include: { employee: true } },
        parentMessage: { include: { sender: { include: { employee: true } } } },
        reactions: { include: { user: { include: { employee: true } } } },
        mentions: { include: { mentionedUser: { include: { employee: true } } } },
      },
    });

    // Enforce record-level visibility check on search results
    const accessibleMessages: any[] = [];
    for (const msg of messages) {
      try {
        const targetId = msg.channelId || msg.conversationId!;
        await this.assertConversationAccess(targetId, user);
        accessibleMessages.push(msg);
      } catch {
        // Discard messages the user does not have permission to view
      }
    }

    return await Promise.all(accessibleMessages.map((m) => this.formatMessage(m, user.userId)));
  }
}
