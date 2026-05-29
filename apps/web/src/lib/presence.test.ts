import { describe, expect, it } from 'vitest';
import { applyCursor, isCursor, pruneCursors, type CursorMap } from './presence.js';

const cursor = (memberId: string, at: number) => ({
  memberId,
  name: memberId,
  color: '#000',
  x: 0.5,
  y: 0.5,
  at,
});

describe('applyCursor', () => {
  it('adds and replaces by member id', () => {
    let map: CursorMap = {};
    map = applyCursor(map, cursor('a', 1));
    map = applyCursor(map, cursor('b', 1));
    map = applyCursor(map, { ...cursor('a', 2), x: 0.9 });
    expect(Object.keys(map)).toEqual(['a', 'b']);
    expect(map['a']!.x).toBe(0.9);
  });
});

describe('pruneCursors', () => {
  it('drops cursors older than the ttl', () => {
    const map = { a: cursor('a', 1000), b: cursor('b', 9000) };
    const pruned = pruneCursors(map, 10000, 5000);
    expect(Object.keys(pruned)).toEqual(['b']);
  });

  it('returns the same reference when nothing is stale', () => {
    const map = { a: cursor('a', 9000) };
    expect(pruneCursors(map, 10000, 5000)).toBe(map);
  });
});

describe('isCursor', () => {
  it('accepts valid cursors and rejects junk', () => {
    expect(isCursor(cursor('a', 1))).toBe(true);
    expect(isCursor(null)).toBe(false);
    expect(isCursor({ memberId: 'a' })).toBe(false);
    expect(isCursor({ memberId: 'a', x: 1, y: 1, at: 'no' })).toBe(false);
  });
});
