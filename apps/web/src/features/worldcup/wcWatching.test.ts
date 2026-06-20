import { describe, expect, it } from 'vitest';
import { isWatchLeave, isWatching, watchLeave, watching } from './wcWatching.js';

describe('wcWatching', () => {
  it('builds a tagged watching payload', () => {
    expect(watching('g-A-1', 'p1', 'John', 1000)).toEqual({
      kind: 'wc-watching',
      matchId: 'g-A-1',
      memberId: 'p1',
      name: 'John',
      at: 1000,
    });
  });

  it('accepts well-formed watching frames (including an anonymous null name)', () => {
    expect(isWatching(watching('m', 'anon-7', null))).toBe(true);
    expect(isWatching(watching('m', 'p1', 'Sara'))).toBe(true);
  });

  it('rejects foreign or malformed frames', () => {
    // A live-reaction frame sharing the channel must not match.
    expect(isWatching({ kind: 'wc-reaction', matchId: 'm', emoji: '🔥', at: 1 })).toBe(false);
    // A doodle cursor frame.
    expect(isWatching({ memberId: 'x', x: 1, y: 2, at: 3 })).toBe(false);
    expect(isWatching({ kind: 'wc-watching', matchId: 'm', memberId: 'p1' })).toBe(false); // no at
    expect(isWatching({ kind: 'wc-watching', matchId: 'm', memberId: 1, name: null, at: 2 })).toBe(
      false,
    );
    expect(isWatching(null)).toBe(false);
  });

  it('round-trips a leave frame and guards it', () => {
    expect(watchLeave('m', 'p1')).toEqual({ kind: 'wc-watch-leave', matchId: 'm', memberId: 'p1' });
    expect(isWatchLeave(watchLeave('m', 'p1'))).toBe(true);
    expect(isWatchLeave(watching('m', 'p1', 'John'))).toBe(false);
    expect(isWatchLeave({ kind: 'wc-watch-leave', matchId: 'm' })).toBe(false);
  });
});
