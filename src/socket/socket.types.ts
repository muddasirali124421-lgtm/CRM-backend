import { Socket } from 'socket.io';
import { AuthenticatedUser } from '../types/auth.types';

export interface AuthenticatedSocket extends Socket {
  user: AuthenticatedUser;
}

export interface ClientToServerEvents {
  'chat:conversation:join': (data: { conversationId: string }, callback?: (response: { status: 'ok' | 'error'; message?: string }) => void) => void;
  'chat:conversation:leave': (data: { conversationId: string }, callback?: (response: { status: 'ok' | 'error'; message?: string }) => void) => void;
  'chat:message:send': (data: { conversationId: string; content: string; parentMessageId?: string; mentionUserIds?: string[]; attachmentFileIds?: string[] }, callback?: (response: { status: 'ok' | 'error'; data?: any; message?: string }) => void) => void;
  'chat:typing:start': (data: { conversationId: string }) => void;
  'chat:typing:stop': (data: { conversationId: string }) => void;
  'chat:read': (data: { conversationId: string }, callback?: (response: { status: 'ok' | 'error'; message?: string }) => void) => void;
}

export interface ServerToClientEvents {
  'chat:message:new': (payload: { conversationId: string; message: any }) => void;
  'chat:message:updated': (payload: { conversationId: string; message: any }) => void;
  'chat:message:deleted': (payload: { conversationId: string; messageId: string }) => void;
  'chat:reaction:updated': (payload: { conversationId: string; message: any }) => void;
  'chat:read:updated': (payload: { conversationId: string; userId: string; readAt: Date }) => void;
  'chat:typing:status': (payload: { conversationId: string; userId: string; userName: string; isTyping: boolean }) => void;
  'presence:user:status': (payload: { userId: string; status: 'online' | 'offline' }) => void;
  'notification:new': (payload: { notification: any }) => void;
  'notification:unread-count': (payload: { unreadCount: number }) => void;
  'error': (error: { code: string; message: string }) => void;
}
