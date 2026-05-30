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

describe('toggleReaction', () => {
  const base = () => [createMessage({ roomId: 'r', authorId: 'a', text: 'hi' })];

  it('adds, then removes a reaction for the same member (immutably)', () => {
    const list = base();
    const id = list[0]!.id;

    const added = toggleReaction(list, id, '👍', 'm1');
    expect(added).not.toBe(list);
    expect(added[0]!.reactions).toEqual({ '👍': ['m1'] });
    expect(list[0]!.reactions).toBeUndefined(); // original untouched

    const removed = toggleReaction(added, id, '👍', 'm1');
    expect(removed[0]!.reactions).toEqual({}); // emoji key dropped when empty
  });

  it('accumulates distinct members under one emoji', () => {
    const list = base();
    const id = list[0]!.id;
    let next = toggleReaction(list, id, '🎉', 'm1');
    next = toggleReaction(next, id, '🎉', 'm2');
    expect(next[0]!.reactions).toEqual({ '🎉': ['m1', 'm2'] });
  });

  it('leaves other messages untouched', () => {
    const a = createMessage({ roomId: 'r', authorId: 'a', text: 'a' });
    const b = createMessage({ roomId: 'r', authorId: 'b', text: 'b' });
    const next = toggleReaction([a, b], a.id, '❤️', 'm1');
    expect(next[1]).toBe(b);
  });
});

describe('editMessage / deleteMessage', () => {
  it('edits text for the author only and stamps editedAt', () => {
    const m = createMessage({ roomId: 'r', authorId: 'a', text: 'helo' });
    const edited = editMessage([m], m.id, 'a', '  hello  ');
    expect(edited[0]!.text).toBe('hello');
    expect(edited[0]!.editedAt).toBeTruthy();
    // A different member cannot edit (content stays unchanged).
    expect(editMessage([m], m.id, 'b', 'nope')[0]!.text).toBe('helo');
  });

  it('refuses to empty a text-only message', () => {
    const m = createMessage({ roomId: 'r', authorId: 'a', text: 'keep' });
    expect(editMessage([m], m.id, 'a', '   ')[0]!.text).toBe('keep');
  });

  it('deletes only the author’s own message', () => {
    const m = createMessage({ roomId: 'r', authorId: 'a', text: 'bye' });
    expect(deleteMessage([m], m.id, 'b')).toHaveLength(1); // not the author
    expect(deleteMessage([m], m.id, 'a')).toHaveLength(0);
  });
});
