import { Server as SocketIOServer } from 'socket.io';
import { notificationEvents, NOTIFICATION_EVENTS } from '../modules/notifications/notifications.events';

let isNotificationEventsSubscribed = false;

export function setupNotificationEventSubscriptions(io: SocketIOServer): void {
  if (isNotificationEventsSubscribed) return;
  isNotificationEventsSubscribed = true;

  // New notification delivered to user-specific room
  notificationEvents.on(NOTIFICATION_EVENTS.NOTIFICATION_NEW, ({ userId, notification }) => {
    io.to(`user:${userId}`).emit('notification:new', { notification });
  });

  // Updated unread count delivered to user-specific room
  notificationEvents.on(NOTIFICATION_EVENTS.UNREAD_COUNT_UPDATED, ({ userId, unreadCount }) => {
    io.to(`user:${userId}`).emit('notification:unread-count', { unreadCount });
  });
}
