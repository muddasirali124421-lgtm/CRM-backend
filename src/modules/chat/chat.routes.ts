import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { ChatController } from './chat.controller';
import {
  createDMSchema,
  createChannelSchema,
  updateChannelSchema,
  addChannelMemberSchema,
  sendMessageSchema,
  editMessageSchema,
  addReactionSchema,
  messageListQuerySchema,
  searchMessagesQuerySchema,
} from './chat.validation';

// ============================================================================
// CHAT ROUTER (/api/chat)
// ============================================================================

export const chatRouter = Router();

// Require authenticated user for all chat endpoints
chatRouter.use(authenticate);

// ----------------------------------------------------------------------------
// 1. Conversations & Overview
// ----------------------------------------------------------------------------

// List all active conversations (DMs, Channels, Project chats) for authenticated user
chatRouter.get(
  '/conversations',
  authorize('chat.view'),
  ChatController.listConversations
);

// Get global and per-conversation unread count for badges
chatRouter.get(
  '/unread',
  authorize('chat.view'),
  ChatController.getUnreadCounts
);

// Search messages across accessible conversations
chatRouter.get(
  '/search',
  authorize('chat.view'),
  validateRequest({ query: searchMessagesQuerySchema }),
  ChatController.searchMessages
);

// ----------------------------------------------------------------------------
// 2. Direct Messages (DM)
// ----------------------------------------------------------------------------

// Get or create canonical 1-to-1 direct message conversation
chatRouter.post(
  '/dm',
  authorize(['chat.view', 'chat.send_messages']),
  validateRequest({ body: createDMSchema }),
  ChatController.getOrCreateDM
);

// ----------------------------------------------------------------------------
// 3. Channels & Project Discussions
// ----------------------------------------------------------------------------

// List all channels
chatRouter.get(
  '/channels',
  authorize('chat.view'),
  ChatController.listChannels
);

// Create a new channel
chatRouter.post(
  '/channels',
  authorize('chat.create_channels'),
  validateRequest({ body: createChannelSchema }),
  ChatController.createChannel
);

// Get project primary chat conversation
chatRouter.get(
  '/projects/:projectId',
  authorize('chat.view'),
  ChatController.getProjectChat
);

// Get single channel details
chatRouter.get(
  '/channels/:id',
  authorize('chat.view'),
  ChatController.getChannelById
);

// Update channel details
chatRouter.patch(
  '/channels/:id',
  authorize('chat.manage_channels'),
  validateRequest({ body: updateChannelSchema }),
  ChatController.updateChannel
);

// Delete / archive channel
chatRouter.delete(
  '/channels/:id',
  authorize('chat.manage_channels'),
  ChatController.deleteChannel
);

// ----------------------------------------------------------------------------
// 4. Channel Members
// ----------------------------------------------------------------------------

// List channel members
chatRouter.get(
  '/channels/:id/members',
  authorize('chat.view'),
  ChatController.listMembers
);

// Add member to channel
chatRouter.post(
  '/channels/:id/members',
  authorize('chat.manage_channels'),
  validateRequest({ body: addChannelMemberSchema }),
  ChatController.addMember
);

// Remove member from channel (or leave channel)
chatRouter.delete(
  '/channels/:id/members/:userId',
  authorize('chat.view'),
  ChatController.removeMember
);

// ----------------------------------------------------------------------------
// 5. Messages within Conversations / Channels
// ----------------------------------------------------------------------------

// List messages in conversation or channel (cursor pagination)
chatRouter.get(
  '/conversations/:id/messages',
  authorize('chat.view'),
  validateRequest({ query: messageListQuerySchema }),
  ChatController.listMessages
);

// Send message in conversation or channel
chatRouter.post(
  '/conversations/:id/messages',
  authorize('chat.send_messages'),
  validateRequest({ body: sendMessageSchema }),
  ChatController.sendMessage
);

// Mark conversation or channel as read
chatRouter.post(
  '/conversations/:id/read',
  authorize('chat.view'),
  ChatController.markAsRead
);

// ----------------------------------------------------------------------------
// 6. Individual Messages: Edit, Delete, Reactions
// ----------------------------------------------------------------------------

// Edit message (author or Super Admin)
chatRouter.patch(
  '/messages/:id',
  authorize('chat.send_messages'),
  validateRequest({ body: editMessageSchema }),
  ChatController.editMessage
);

// Delete message (soft-delete)
chatRouter.delete(
  '/messages/:id',
  authorize('chat.view'),
  ChatController.deleteMessage
);

// Add reaction to message
chatRouter.post(
  '/messages/:id/reactions',
  authorize('chat.send_messages'),
  validateRequest({ body: addReactionSchema }),
  ChatController.addReaction
);

// Remove reaction from message
chatRouter.delete(
  '/messages/:id/reactions/:emoji',
  authorize('chat.send_messages'),
  ChatController.removeReaction
);
