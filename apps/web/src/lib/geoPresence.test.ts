import { describe, expect, it } from 'vitest';
import { applyPresence, isLivePresence, prunePresence, type LivePresence } from './geoPresence.js';

const frame = (memberId: string, at: number): LivePresence => ({
  kind: 'geo',
  memberId,
  name: memberId,
  color: '#16a34a',
  lat: 1,
  lng: 2,
  at,
});

describe('geoPresence', () => {
  it('upserts presence by member id', () => {
    let m = applyPresence({}, frame('a', 100));
    m = applyPresence(m, frame('b', 100));
    m = applyPresence(m, frame('a', 200));
    expect(Object.keys(m)).toEqual(['a', 'b']);
    expect(m.a!.at).toBe(200);
  });

  it('prunes stale locations past the TTL', () => {
    const m = { a: frame('a', 0), b: frame('b', 9000) };
    const pruned = prunePresence(m, 10000, 5000);
    expect(Object.keys(pruned)).toEqual(['b']);
    // Unchanged maps keep their reference.
    expect(prunePresence(pruned, 10000, 5000)).toBe(pruned);
  });

  it('distinguishes geo frames from cursor frames', () => {
    expect(isLivePresence(frame('a', 1))).toBe(true);
    // A doodle cursor frame (no kind, has x/y) must not be treated as geo.
    expect(isLivePresence({ memberId: 'a', x: 0.5, y: 0.5, at: 1 })).toBe(false);
    expect(isLivePresence(null)).toBe(false);
  });
});
