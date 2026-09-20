import { ChannelType } from '@prisma/client';

export interface SafeChatUserSummary {
  id: string;
  email: string;
  employeeId?: string | null;
  employeeCode?: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  profileImage?: string | null;
}

export interface SafeReactionSummary {
  emoji: string;
  count: number;
  users: { userId: string; name: string }[];
  hasReacted: boolean;
}

export interface SafeMentionSummary {
  userId: string;
  name: string;
  email: string;
}

export interface SafeAttachmentSummary {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  downloadUrl: string;
}

export interface SafeChatMessageResponse {
  id: string;
  conversationId?: string | null;
  channelId?: string | null;
  senderId: string;
  sender: SafeChatUserSummary | null;
  content: string;
  isDeleted: boolean;
  parentMessageId?: string | null;
  parentMessage?: {
    id: string;
    senderId: string;
    senderName: string;
    content: string;
  } | null;
  reactions: SafeReactionSummary[];
  mentions: SafeMentionSummary[];
  attachments: SafeAttachmentSummary[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SafeConversationListItem {
  id: string;
  type: 'DM' | 'CHANNEL' | 'PROJECT';
  name: string;
  description?: string | null;
  projectId?: string | null;
  projectCode?: string | null;
  participants: SafeChatUserSummary[];
  lastMessage?: {
    id: string;
    senderId: string;
    senderName: string;
    content: string;
    createdAt: Date;
  } | null;
  lastActivityAt: Date;
  unreadCount: number;
}

export interface SafeChannelResponse {
  id: string;
  name: string;
  description?: string | null;
  type: ChannelType;
  createdById?: string | null;
  projectId?: string | null;
  project?: {
    id: string;
    projectCode: string;
    name: string;
  } | null;
  membersCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SafeChannelMemberResponse {
  userId: string;
  role: string;
  joinedAt: Date;
  user: SafeChatUserSummary;
}

export interface CreateChannelDTO {
  name: string;
  description?: string;
  type?: ChannelType;
  projectId?: string;
  memberUserIds?: string[];
}

export interface UpdateChannelDTO {
  name?: string;
  description?: string;
}

export interface SendMessageDTO {
  content: string;
  parentMessageId?: string;
  mentionUserIds?: string[];
  attachmentFileIds?: string[];
}

export interface EditMessageDTO {
  content: string;
}

export interface MessageListQuery {
  limit?: number;
  cursor?: string; // Message ID for cursor pagination
  direction?: 'before' | 'after';
}

export interface SearchMessagesQuery {
  q: string;
  conversationId?: string;
  channelId?: string;
  projectId?: string;
  senderId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}
