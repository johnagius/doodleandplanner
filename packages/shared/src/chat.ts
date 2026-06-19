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
  /** Optional attached GIF media URL. */
  gifUrl?: string;
  /** Optional World Cup match id, for per-match banter threads. */
  matchId?: string;
  now?: () => Date;
}

export function createMessage(input: CreateMessageInput): Message {
  const text = input.text.trim();
  if (!text && !input.photoId && !input.gifUrl) throw new Error('Message cannot be empty');
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error('Message is too long');
  return {
    id: generateId('msg'),
    roomId: input.roomId,
    authorId: input.authorId,
    text,
    photoId: input.photoId,
    gifUrl: input.gifUrl,
    matchId: input.matchId,
    createdAt: (input.now ?? (() => new Date()))().toISOString(),
  };
}

/** Append a message, keeping at most `cap` most-recent messages. */
export function appendMessage(messages: Message[], message: Message, cap = DEFAULT_CAP): Message[] {
  const next = [...messages, message];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** A small, curated set of reaction emoji offered in the UI. */
export const REACTION_EMOJI = ['👍', '❤️', '😂', '🎉', '😮', '😢'] as const;

/**
 * Edit a message's text (author only). Trims and length-checks like creation.
 * Returns the same array reference when the edit is a no-op or not permitted.
 */
export function editMessage(
  messages: Message[],
  messageId: string,
  authorId: string,
  text: string,
): Message[] {
  const trimmed = text.trim();
  return messages.map((m) => {
    if (m.id !== messageId) return m;
    if (m.authorId !== authorId) return m; // only the author may edit
    if (!trimmed && !m.photoId) return m; // don't allow emptying a text-only message
    if (trimmed.length > MAX_MESSAGE_LENGTH) return m;
    return { ...m, text: trimmed, editedAt: new Date().toISOString() };
  });
}

/** Remove a message (author only). Returns the same reference if not permitted. */
export function deleteMessage(messages: Message[], messageId: string, authorId: string): Message[] {
  const target = messages.find((m) => m.id === messageId);
  if (!target || target.authorId !== authorId) return messages;
  return messages.filter((m) => m.id !== messageId);
}

/**
 * Toggle a member's emoji reaction on a message immutably. Adds the member to
 * that emoji's list, or removes them if already present (dropping the emoji key
 * when its last reactor leaves). Returns a new messages array; the target
 * message is replaced, others keep their reference.
 */
export function toggleReaction(
  messages: Message[],
  messageId: string,
  emoji: string,
  memberId: string,
): Message[] {
  return messages.map((m) => {
    if (m.id !== messageId) return m;
    const reactions = { ...(m.reactions ?? {}) };
    const reactors = reactions[emoji] ?? [];
    if (reactors.includes(memberId)) {
      const next = reactors.filter((id) => id !== memberId);
      if (next.length === 0) delete reactions[emoji];
      else reactions[emoji] = next;
    } else {
      reactions[emoji] = [...reactors, memberId];
    }
    return { ...m, reactions };
  });
}
