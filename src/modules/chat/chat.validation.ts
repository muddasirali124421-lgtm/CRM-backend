import { z } from 'zod';
import { ChannelType } from '@prisma/client';

export const createDMSchema = z.object({
  recipientUserId: z.string().uuid('Invalid recipient user ID format'),
});

export const createChannelSchema = z.object({
  name: z.string().trim().min(2, 'Channel name must be at least 2 characters').max(80),
  description: z.string().trim().max(500).optional(),
  type: z.nativeEnum(ChannelType).optional().default(ChannelType.CHANNEL),
  projectId: z.string().uuid('Invalid project ID format').optional(),
  memberUserIds: z.array(z.string().uuid()).optional(),
});

export const updateChannelSchema = z.object({
  name: z.string().trim().min(2, 'Channel name must be at least 2 characters').max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

export const addChannelMemberSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  role: z.enum(['MEMBER', 'ADMIN', 'MODERATOR']).optional().default('MEMBER'),
});

export const sendMessageSchema = z.object({
  content: z.string().trim().max(5000, 'Message cannot exceed 5000 characters').default(''),
  parentMessageId: z.string().uuid('Invalid parent message ID format').optional(),
  mentionUserIds: z.array(z.string().uuid()).optional(),
  attachmentFileIds: z.array(z.string().uuid()).optional(),
}).refine(
  (data) => data.content.length > 0 || (data.attachmentFileIds && data.attachmentFileIds.length > 0),
  { message: 'Message content cannot be empty unless an attachment is provided' }
);

export const editMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message content cannot be empty').max(5000),
});

export const addReactionSchema = z.object({
  emoji: z.string().trim().min(1).max(16, 'Reaction emoji must be between 1 and 16 characters'),
});

export const messageListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().uuid().optional(),
  direction: z.enum(['before', 'after']).default('before'),
});

export const searchMessagesQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search query is required').max(200),
  conversationId: z.string().uuid().optional(),
  channelId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  senderId: z.string().uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
