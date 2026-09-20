import { EventEmitter } from 'events';

class ChatEventEmitter extends EventEmitter {}

export const chatEvents = new ChatEventEmitter();

// Event names
export const CHAT_EVENTS = {
  MESSAGE_NEW: 'chat:message:new',
  MESSAGE_UPDATED: 'chat:message:updated',
  MESSAGE_DELETED: 'chat:message:deleted',
  REACTION_UPDATED: 'chat:reaction:updated',
  CONVERSATION_READ: 'chat:read:updated',
};
