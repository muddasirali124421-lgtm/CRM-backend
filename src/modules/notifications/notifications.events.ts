import { EventEmitter } from 'events';

export const notificationEvents = new EventEmitter();

export const NOTIFICATION_EVENTS = {
  NOTIFICATION_NEW: 'notification:new',
  UNREAD_COUNT_UPDATED: 'notification:unread-count',
} as const;
