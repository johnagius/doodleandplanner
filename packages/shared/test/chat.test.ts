import { describe, expect, it } from 'vitest';
import {
  appendMessage,
  createMessage,
  deleteMessage,
  editMessage,
  MAX_MESSAGE_LENGTH,
  toggleReaction,
} from '../src/chat.js';

describe('createMessage', () => {
  it('creates a trimmed message', () => {
    const msg = createMessage({ roomId: 'r', authorId: 'm1', text: '  hi there  ' });
    expect(msg.text).toBe('hi there');
    expect(msg.authorId).toBe('m1');
    expect(msg.id).toMatch(/^msg_/);
  });

  it('rejects empty or over-long messages', () => {
    expect(() => createMessage({ roomId: 'r', authorId: 'm', text: '   ' })).toThrow(/empty/);
    expect(() =>
      createMessage({ roomId: 'r', authorId: 'm', text: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) }),
    ).toThrow(/too long/);
  });

  it('allows an empty caption when a photo is attached', () => {
    const msg = createMessage({ roomId: 'r', authorId: 'm', text: '', photoId: 'photo_1' });
    expect(msg.photoId).toBe('photo_1');
    expect(msg.text).toBe('');
  });
});

describe('appendMessage', () => {
  it('appends in order', () => {
    const a = createMessage({ roomId: 'r', authorId: 'm', text: 'a' });
    const b = createMessage({ roomId: 'r', authorId: 'm', text: 'b' });
    expect(appendMessage([a], b).map((m) => m.text)).toEqual(['a', 'b']);
  });

  it('caps to the most recent messages', () => {
    let list = [createMessage({ roomId: 'r', authorId: 'm', text: '0' })];
    for (let i = 1; i <= 5; i++) {
      list = appendMessage(list, createMessage({ roomId: 'r', authorId: 'm', text: String(i) }), 3);
    }
    expect(list).toHaveLength(3);
    expect(list.map((m) => m.text)).toEqual(['3', '4', '5']);
  });
});
