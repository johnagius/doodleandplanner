/** Room discussion: lightweight chat messages. */
import { generateId } from './ids.js';
import type { Message } from './types.js';

export const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_CAP = 500;

export interface CreateMessageInput {
  roomId: string;
  authorId: string;
  text: string;
  /** Optional attached photo id. */
  photoId?: string;
  now?: () => Date;
}

export function createMessage(input: CreateMessageInput): Message {
  const text = input.text.trim();
  if (!text && !input.photoId) throw new Error('Message cannot be empty');
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error('Message is too long');
  return {
    id: generateId('msg'),
    roomId: input.roomId,
    authorId: input.authorId,
    text,
    photoId: input.photoId,
    createdAt: (input.now ?? (() => new Date()))().toISOString(),
  };
}

/** Append a message, keeping at most `cap` most-recent messages. */
export function appendMessage(messages: Message[], message: Message, cap = DEFAULT_CAP): Message[] {
  const next = [...messages, message];
  return next.length > cap ? next.slice(next.length - cap) : next;
}
