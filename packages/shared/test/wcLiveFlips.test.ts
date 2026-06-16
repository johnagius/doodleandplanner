import { describe, expect, it } from 'vitest';
import { liveSweat } from '../src/wcForward.js';
import { liveRankFlips, minuteValue } from '../src/wcLiveFlips.js';
import type { WcMatchEvent, WorldCupState } from '../src/worldcup.js';

// After m0, Ann leads (exact 1-0 = 5) over Bob (right winner 3-0 = 3). In the
// live game m1, Ann picked 0-0 and Bob 2-0: at 1-0 Ann is still ahead, but the
// second goal (2-0) makes Bob's pick exact and he leapfrogs her.
const state: WorldCupState = {
  season: '2026',
  title: 'T',
  teams: [],
  matches: [
    {
      id: 'm0',
      stage: 'group',
      order: 0,
      kickoff: '2026-06-11T00:00:00Z',
      homeId: 'A',
      awayId: 'B',
      result: { home: 1, away: 0 },
    },
    {
      id: 'm1',
      stage: 'group',
      order: 1,
      kickoff: '2026-06-12T00:00:00Z',
      homeId: 'HOM',
      awayId: 'AWY',
    },
  ],
  predictors: [
    { id: 'ann', name: 'Ann' },
    { id: 'bob', name: 'Bob' },
  ],
  predictions: [
    { predictorId: 'ann', matchId: 'm0', home: 1, away: 0, updatedAt: 'x' }, // exact ⇒ leads
    { predictorId: 'bob', matchId: 'm0', home: 3, away: 0, updatedAt: 'x' }, // right winner only
    { predictorId: 'ann', matchId: 'm1', home: 0, away: 0, updatedAt: 'x' },
    { predictorId: 'bob', matchId: 'm1', home: 2, away: 0, updatedAt: 'x' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const events: WcMatchEvent[] = [
  { minute: "20'", kind: 'goal', teamTla: 'HOM', player: 'X' },
  { minute: "40'", kind: 'goal', teamTla: 'HOM', player: 'Y' },
];

describe('liveRankFlips', () => {
  it('flags only the goal that flips the lead, with who passed whom', () => {
    const flips = liveRankFlips(state, 'm1', events);
    expect(flips).toHaveLength(1); // the 1-0 goal changes nobody's order
    const f = flips[0]!;
    expect(f.minute).toBe("40'");
    expect([f.home, f.away]).toEqual([2, 0]);
    expect(f.name).toBe('Bob');
    expect(f.fromRank).toBe(2);
    expect(f.toRank).toBe(1);
    expect(f.passed).toContain('Ann');
    expect(f.topChange).toBe(true);
  });

  it('returns nothing without events', () => {
    expect(liveRankFlips(state, 'm1', [])).toEqual([]);
    expect(liveRankFlips(state, 'm1', undefined)).toEqual([]);
  });

  it('orders stoppage-time minutes correctly', () => {
    expect(minuteValue("45'+2'")).toBeGreaterThan(minuteValue("45'"));
    expect(minuteValue("90'")).toBeGreaterThan(minuteValue("45'+2'"));
  });
});

describe('liveSweat', () => {
  it('reads 0 once there is no time left to change anything', () => {
    const s = liveSweat(state, 'm1', { odds: null, live: { home: 0, away: 0, minute: 90 } });
    expect(s.index).toBe(0);
    expect(s.pLeadChange).toBe(0);
  });

  it('is volatile early when picks diverge', () => {
    const s = liveSweat(state, 'm1', { odds: null, live: { home: 0, away: 0, minute: 1 } });
    expect(s.index).toBeGreaterThan(0);
    expect(s.pLeadChange).toBeGreaterThan(0);
    expect(s.leaderName).toBe('Ann'); // provisional leader at 0–0 right now
  });

  it('is deterministic for the same live state', () => {
    const a = liveSweat(state, 'm1', { odds: null, live: { home: 1, away: 0, minute: 30 } });
    const b = liveSweat(state, 'm1', { odds: null, live: { home: 1, away: 0, minute: 30 } });
    expect(a).toEqual(b);
  });
});
