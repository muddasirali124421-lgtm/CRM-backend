import { Response, NextFunction } from 'express';
import { ChatService } from './chat.service';
import { sendSuccess } from '../../utils/api-response';
import { AuthenticatedRequest } from '../../types/auth.types';

export class ChatController {
  // ==========================================================================
  // DIRECT MESSAGING (DM)
  // ==========================================================================

  public static async getOrCreateDM(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { recipientUserId } = req.body;
      const conversation = await ChatService.getOrCreateDM(recipientUserId, req.user!);
      sendSuccess(res, conversation, 'Direct message conversation retrieved or created');
    } catch (error) {
      next(error);
    }
  }

  // ==========================================================================
  // CHANNELS
  // ==========================================================================

  public static async listChannels(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const channels = await ChatService.listChannels(req.user!);
      sendSuccess(res, channels, 'Channels retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async createChannel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const channel = await ChatService.createChannel(req.body, req.user!);
      sendSuccess(res, channel, 'Channel created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  public static async getChannelById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const channel = await ChatService.getChannelById(id, req.user!);
      sendSuccess(res, channel, 'Channel retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async updateChannel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const channel = await ChatService.updateChannel(id, req.body, req.user!);
      sendSuccess(res, channel, 'Channel updated successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async deleteChannel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await ChatService.deleteChannel(id, req.user!);
      sendSuccess(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================================================
  // CHANNEL MEMBERS
  // ==========================================================================

  public static async listMembers(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const members = await ChatService.listChannelMembers(id, req.user!);
      sendSuccess(res, members, 'Channel members retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async addMember(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { userId, role } = req.body;
      const member = await ChatService.addChannelMember(id, userId, role, req.user!);
      sendSuccess(res, member, 'Member added to channel', 201);
    } catch (error) {
      next(error);
    }
  }

  public static async removeMember(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, userId } = req.params;
      const result = await ChatService.removeChannelMember(id, userId, req.user!);
      sendSuccess(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================================================
  // PROJECT CHAT
  // ==========================================================================

  public static async getProjectChat(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { projectId } = req.params;
      const channel = await ChatService.getProjectChat(projectId, req.user!);
      sendSuccess(res, channel, 'Project chat retrieved or created');
    } catch (error) {
      next(error);
    }
  }

  // ==========================================================================
  // MESSAGES
  // ==========================================================================

  public static async listMessages(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const query = {
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        cursor: req.query.cursor as string | undefined,
        direction: req.query.direction as 'before' | 'after' | undefined,
      };
      const result = await ChatService.listMessages(id, query, req.user!);
      sendSuccess(res, result, 'Messages retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async sendMessage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const message = await ChatService.sendMessage(id, req.body, req.user!);
      sendSuccess(res, message, 'Message sent successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  public static async editMessage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const message = await ChatService.editMessage(id, req.body, req.user!);
      sendSuccess(res, message, 'Message updated successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async deleteMessage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await ChatService.deleteMessage(id, req.user!);
      sendSuccess(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================================================
  // REACTIONS
  // ==========================================================================

  public static async addReaction(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { emoji } = req.body;
      const message = await ChatService.addReaction(id, emoji, req.user!);
      sendSuccess(res, message, 'Reaction added successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async removeReaction(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, emoji } = req.params;
      const message = await ChatService.removeReaction(id, decodeURIComponent(emoji), req.user!);
      sendSuccess(res, message, 'Reaction removed successfully');
    } catch (error) {
      next(error);
    }
  }

  // ==========================================================================
  // READ STATE & UNREAD COUNTS
  // ==========================================================================

  public static async markAsRead(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await ChatService.markAsRead(id, req.user!);
      sendSuccess(res, result, 'Marked as read');
    } catch (error) {
      next(error);
    }
  }

  public static async getUnreadCounts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const counts = await ChatService.getUnreadCounts(req.user!);
      sendSuccess(res, counts, 'Unread counts retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  // ==========================================================================
  // CONVERSATIONS LIST & SEARCH
  // ==========================================================================

  public static async listConversations(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const conversations = await ChatService.listConversations(req.user!);
      sendSuccess(res, conversations, 'Conversations retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async searchMessages(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = {
        q: req.query.q as string,
        conversationId: req.query.conversationId as string | undefined,
        channelId: req.query.channelId as string | undefined,
        projectId: req.query.projectId as string | undefined,
        senderId: req.query.senderId as string | undefined,
        dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
        dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      };
      const messages = await ChatService.searchMessages(query, req.user!);
      sendSuccess(res, messages, 'Messages search results');
    } catch (error) {
      next(error);
    }
  }
}
