import { Response, NextFunction } from 'express';
import { NotificationService } from './notifications.service';
import { sendSuccess } from '../../utils/api-response';
import { AuthenticatedRequest } from '../../types/auth.types';

export class NotificationsController {
  /**
   * GET /api/notifications - List authenticated user's notifications
   */
  public static async listNotifications(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await NotificationService.listNotifications(req.query as any, req.user!);
      sendSuccess(res, result, 'Notifications retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/notifications/unread-count - Get authenticated user's unread count
   */
  public static async getUnreadCount(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const unreadCount = await NotificationService.getUnreadCount(req.user!);
      sendSuccess(res, { unreadCount }, 'Unread count retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/notifications/:id/read - Mark one notification as read
   */
  public static async markAsRead(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const updated = await NotificationService.markAsRead(id, req.user!);
      sendSuccess(res, updated, 'Notification marked as read');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/notifications/read-all - Mark all unread notifications as read
   */
  public static async markAllAsRead(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await NotificationService.markAllAsRead(req.user!);
      sendSuccess(res, result, 'All notifications marked as read');
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/notifications/:id - Delete/dismiss single notification
   */
  public static async deleteNotification(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await NotificationService.deleteNotification(id, req.user!);
      sendSuccess(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/notification-preferences - Get authenticated user's preferences
   */
  public static async getPreferences(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const preferences = await NotificationService.getPreferences(req.user!);
      sendSuccess(res, preferences, 'Notification preferences retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/notification-preferences - Update user preferences
   */
  public static async updatePreferences(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await NotificationService.updatePreferences(req.body, req.user!);
      sendSuccess(res, updated, 'Notification preferences updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/notifications/system - Admin endpoint to send targeted or global system notifications
   */
  public static async sendSystemNotification(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await NotificationService.sendSystemNotification(req.body, req.user!);
      sendSuccess(res, result, 'System notification dispatched successfully', 201);
    } catch (error) {
      next(error);
    }
  }
}
