import { Server as SocketIOServer } from 'socket.io';
import { AuthenticatedSocket } from './socket.types';
import { ChatService } from '../modules/chat/chat.service';
import { chatEvents, CHAT_EVENTS } from '../modules/chat/chat.events';
import { presenceManager } from './presence';

export function registerChatSocketHandlers(io: SocketIOServer, socket: AuthenticatedSocket): void {
  const user = socket.user;
  const userRoom = `user:${user.userId}`;

  // Automatically join personal room for direct notifications / targeted pushes
  socket.join(userRoom);

  // Track presence
  const becameOnline = presenceManager.addConnection(user.userId);
  if (becameOnline) {
    io.emit('presence:user:status', { userId: user.userId, status: 'online' });
  }

  // --------------------------------------------------------------------------
  // 1. Join Conversation / Channel Room
  // --------------------------------------------------------------------------
  socket.on('chat:conversation:join', async (data, callback) => {
    try {
      if (!data || !data.conversationId) {
        if (callback) callback({ status: 'error', message: 'conversationId is required' });
        return;
      }

      // Record-level access check: ensure user has rights to channel or DM
      await ChatService.assertConversationAccess(data.conversationId, user);

      const room = `conversation:${data.conversationId}`;
      socket.join(room);

      if (callback) callback({ status: 'ok' });
    } catch (err: any) {
      if (callback) {
        callback({ status: 'error', message: err.message || 'Access denied to conversation' });
      } else {
        socket.emit('error', { code: 'FORBIDDEN', message: err.message || 'Access denied' });
      }
    }
  });

  // --------------------------------------------------------------------------
  // 2. Leave Conversation / Channel Room
  // --------------------------------------------------------------------------
  socket.on('chat:conversation:leave', (data, callback) => {
    try {
      if (data && data.conversationId) {
        const room = `conversation:${data.conversationId}`;
        socket.leave(room);
      }
      if (callback) callback({ status: 'ok' });
    } catch (err: any) {
      if (callback) callback({ status: 'error', message: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // 3. Real-Time Send Message
  // --------------------------------------------------------------------------
  socket.on('chat:message:send', async (data, callback) => {
    try {
      if (!data || !data.conversationId) {
        if (callback) callback({ status: 'error', message: 'conversationId is required' });
        return;
      }

      // Rate limit check / abuse protection: payload max length
      if (data.content && data.content.length > 5000) {
        if (callback) callback({ status: 'error', message: 'Message cannot exceed 5000 characters' });
        return;
      }

      // Check send capability
      if (!user.isSuperAdmin && !user.permissions.has('chat.send_messages')) {
        if (callback) callback({ status: 'error', message: 'Permission denied: chat.send_messages required' });
        return;
      }

      // Persist message first via ChatService
      const savedMessage = await ChatService.sendMessage(
        data.conversationId,
        {
          content: data.content || '',
          parentMessageId: data.parentMessageId,
          mentionUserIds: data.mentionUserIds,
          attachmentFileIds: data.attachmentFileIds,
        },
        user
      );

      if (callback) callback({ status: 'ok', data: savedMessage });
    } catch (err: any) {
      if (callback) {
        callback({ status: 'error', message: err.message || 'Failed to send message' });
      } else {
        socket.emit('error', { code: 'MESSAGE_SEND_FAILED', message: err.message || 'Failed to send message' });
      }
    }
  });

  // --------------------------------------------------------------------------
  // 4. Typing Indicators
  // --------------------------------------------------------------------------
  socket.on('chat:typing:start', async (data) => {
    try {
      if (!data?.conversationId) return;
      // Emit to room without persisting
      const room = `conversation:${data.conversationId}`;
      const userName = user.email; // Can be enhanced with first/last name
      socket.to(room).emit('chat:typing:status', {
        conversationId: data.conversationId,
        userId: user.userId,
        userName,
        isTyping: true,
      });
    } catch {
      // Non-critical typing event silently discarded on error
    }
  });

  socket.on('chat:typing:stop', async (data) => {
    try {
      if (!data?.conversationId) return;
      const room = `conversation:${data.conversationId}`;
      const userName = user.email;
      socket.to(room).emit('chat:typing:status', {
        conversationId: data.conversationId,
        userId: user.userId,
        userName,
        isTyping: false,
      });
    } catch {
      // Non-critical typing event silently discarded on error
    }
  });

  // --------------------------------------------------------------------------
  // 5. Mark as Read
  // --------------------------------------------------------------------------
  socket.on('chat:read', async (data, callback) => {
    try {
      if (!data?.conversationId) {
        if (callback) callback({ status: 'error', message: 'conversationId required' });
        return;
      }
      await ChatService.markAsRead(data.conversationId, user);
      if (callback) callback({ status: 'ok' });
    } catch (err: any) {
      if (callback) callback({ status: 'error', message: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // 6. Handle Disconnect
  // --------------------------------------------------------------------------
  socket.on('disconnect', () => {
    const becameOffline = presenceManager.removeConnection(user.userId);
    if (becameOffline) {
      io.emit('presence:user:status', { userId: user.userId, status: 'offline' });
    }
  });
}

/**
 * Setup global event subscriptions so that ChatService emits broadcast to Socket rooms
 */
let isChatEventsSubscribed = false;

export function setupChatEventSubscriptions(io: SocketIOServer): void {
  if (isChatEventsSubscribed) return;
  isChatEventsSubscribed = true;

  // Real-time new message
  chatEvents.on(CHAT_EVENTS.MESSAGE_NEW, ({ conversationId, message }) => {
    io.to(`conversation:${conversationId}`).emit('chat:message:new', {
      conversationId,
      message,
    });
  });

  // Message edit
  chatEvents.on(CHAT_EVENTS.MESSAGE_UPDATED, ({ conversationId, message }) => {
    io.to(`conversation:${conversationId}`).emit('chat:message:updated', {
      conversationId,
      message,
    });
  });

  // Message soft-delete
  chatEvents.on(CHAT_EVENTS.MESSAGE_DELETED, ({ conversationId, messageId }) => {
    io.to(`conversation:${conversationId}`).emit('chat:message:deleted', {
      conversationId,
      messageId,
    });
  });

  // Reaction update
  chatEvents.on(CHAT_EVENTS.REACTION_UPDATED, ({ conversationId, message }) => {
    io.to(`conversation:${conversationId}`).emit('chat:reaction:updated', {
      conversationId,
      message,
    });
  });

  // Conversation marked as read
  chatEvents.on(CHAT_EVENTS.CONVERSATION_READ, ({ conversationId, userId, readAt }) => {
    io.to(`conversation:${conversationId}`).emit('chat:read:updated', {
      conversationId,
      userId,
      readAt,
    });
  });
}
