import { NotificationCategory } from '@prisma/client';

export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_REASSIGNED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_DUE_SOON'
  | 'TASK_OVERDUE'
  | 'PROJECT_ASSIGNED'
  | 'PROJECT_MANAGER_ASSIGNED'
  | 'CHAT_MENTION'
  | 'CHAT_MESSAGE'
  | 'INVOICE_CREATED'
  | 'INVOICE_OVERDUE'
  | 'PAYMENT_RECORDED'
  | 'SYSTEM';

export interface CreateNotificationDTO {
  userId: string; // Recipient User ID
  type: NotificationType;
  title: string;
  message: string;
  entityType?: 'TASK' | 'PROJECT' | 'INVOICE' | 'PAYMENT' | 'CHAT' | 'USER' | string;
  entityId?: string;
  actorId?: string; // User ID who triggered the action
  category?: NotificationCategory;
  metadata?: Record<string, any>;
}

export interface SafeNotificationActorSummary {
  id: string;
  email: string;
  employeeCode?: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  profileImage?: string | null;
}

export interface SafeNotificationResponse {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  actorId: string | null;
  actor: SafeNotificationActorSummary | null;
  isRead: boolean;
  metadata: Record<string, any> | null;
  createdAt: Date;
}

export interface NotificationFilterQuery {
  page?: number;
  limit?: number;
  isRead?: boolean;
  type?: string;
  entityType?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface SafeNotificationPreferenceItem {
  category: NotificationCategory;
  inAppEnabled: boolean;
  emailEnabled: boolean;
}

export interface UpdateNotificationPreferencesDTO {
  preferences: {
    category: NotificationCategory;
    inAppEnabled?: boolean;
    emailEnabled?: boolean;
  }[];
}

export interface SendSystemNotificationDTO {
  recipientUserIds?: string[]; // If omitted or empty, send to all active users
  title: string;
  message: string;
  metadata?: Record<string, any>;
}
