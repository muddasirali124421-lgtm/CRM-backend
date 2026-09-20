import { z } from 'zod';
import { NotificationCategory } from '@prisma/client';

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  isRead: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  type: z.string().trim().optional(),
  entityType: z.string().trim().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const updateNotificationPreferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        category: z.nativeEnum(NotificationCategory),
        inAppEnabled: z.boolean().optional(),
        emailEnabled: z.boolean().optional(),
      })
    )
    .min(1, 'At least one category preference must be specified'),
});

export const sendSystemNotificationSchema = z.object({
  recipientUserIds: z.array(z.string().uuid('Invalid recipient user ID')).optional(),
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(150),
  message: z.string().trim().min(2, 'Message must be at least 2 characters').max(3000),
  metadata: z.record(z.any()).optional(),
});
