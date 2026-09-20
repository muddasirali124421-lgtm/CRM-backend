import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { NotificationsController } from './notifications.controller';
import {
  notificationListQuerySchema,
  updateNotificationPreferencesSchema,
  sendSystemNotificationSchema,
} from './notifications.validation';

export const notificationsRouter = Router();
export const notificationPreferencesRouter = Router();

// ============================================================================
// NOTIFICATIONS ROUTER (/api/notifications)
// ============================================================================

// Require authentication for all notification operations
notificationsRouter.use(authenticate);

// 1. List authenticated user's notifications
notificationsRouter.get(
  '/',
  validateRequest({ query: notificationListQuerySchema }),
  NotificationsController.listNotifications
);

// 2. Get unread notifications count for bell badge
notificationsRouter.get(
  '/unread-count',
  NotificationsController.getUnreadCount
);

// 3. Mark all unread notifications as read
notificationsRouter.patch(
  '/read-all',
  NotificationsController.markAllAsRead
);

// 4. Mark single notification as read
notificationsRouter.patch(
  '/:id/read',
  NotificationsController.markAsRead
);

// 5. Delete/dismiss single notification
notificationsRouter.delete(
  '/:id',
  NotificationsController.deleteNotification
);

// 6. Administrative route to send internal system notifications
notificationsRouter.post(
  '/system',
  authorize(['settings.view', 'settings.manage_users']),
  validateRequest({ body: sendSystemNotificationSchema }),
  NotificationsController.sendSystemNotification
);

// ============================================================================
// NOTIFICATION PREFERENCES ROUTER (/api/notification-preferences)
// ============================================================================

notificationPreferencesRouter.use(authenticate);

// Get current user's preferences
notificationPreferencesRouter.get(
  '/',
  NotificationsController.getPreferences
);

// Update user's preferences
notificationPreferencesRouter.patch(
  '/',
  validateRequest({ body: updateNotificationPreferencesSchema }),
  NotificationsController.updatePreferences
);
