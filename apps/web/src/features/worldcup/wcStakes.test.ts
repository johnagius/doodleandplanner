import type { WorldCupState } from '@dap/shared';
import { describe, expect, it } from 'vitest';
import type { WcLiveInfo } from '../../state/worldCupStore.js';
import { liveStakes } from './wcStakes.js';

// Standings after m1 (resolved 2–1): Ann 5 (exact) > Bea 3 (right result) > Cid 0.
// m2 is unplayed; under a 1–1 scoreline Bea nails it (+5) and vaults to 1st.
const U = '2026-06-10T00:00:00.000Z'; // predictions need an updatedAt; value is unused here
function board(): WorldCupState {
  const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
  return {
    season: '2026',
    title: 'Test Cup',
    version: 9999,
    teams: [
      { id: 'AAA', name: 'Aland', flag: '🅰️', group: 'A' },
      { id: 'BBB', name: 'Bland', flag: '🅱️', group: 'A' },
      { id: 'CCC', name: 'Cland', flag: '🇨', group: 'B' },
      { id: 'DDD', name: 'Dland', flag: '🇩', group: 'B' },
    ],
    matches: [
      {
        id: 'm1',
        stage: 'group',
        group: 'A',
        matchday: 1,
        order: 0,
        kickoff: '2026-06-12T16:00:00.000Z',
        homeId: 'AAA',
        awayId: 'BBB',
        result: { home: 2, away: 1 },
      },
      {
        id: 'm2',
        stage: 'group',
        group: 'B',
        matchday: 1,
        order: 1,
        kickoff: future,
        homeId: 'CCC',
        awayId: 'DDD',
      },
    ],
    predictors: [
      { id: 'p1', name: 'Ann' },
      { id: 'p2', name: 'Bea' },
      { id: 'p3', name: 'Cid' },
    ],
    predictions: [
      { matchId: 'm1', predictorId: 'p1', home: 2, away: 1, updatedAt: U }, // exact → 5
      { matchId: 'm1', predictorId: 'p2', home: 2, away: 0, updatedAt: U }, // right result → 3
      { matchId: 'm1', predictorId: 'p3', home: 0, away: 0, updatedAt: U }, // miss → 0
      { matchId: 'm2', predictorId: 'p1', home: 2, away: 0, updatedAt: U }, // miss under 1–1
      { matchId: 'm2', predictorId: 'p2', home: 1, away: 1, updatedAt: U }, // exact under 1–1 → +5
      { matchId: 'm2', predictorId: 'p3', home: 0, away: 3, updatedAt: U }, // miss under 1–1
    ],
    createdAt: new Date().toISOString(),
  };
}

const live: WcLiveInfo = { status: 'IN_PLAY', minute: 50, home: 1, away: 1 };

describe('liveStakes', () => {
  it('returns null for someone not on the board', () => {
    expect(liveStakes(board(), 'nobody', 'm2', live)).toBeNull();
  });

  it('reads the chaser and the leap from a live scoreline', () => {
    const s = liveStakes(board(), 'p2', 'm2', live)!;
    expect(s.rank).toBe(2);
    expect(s.of).toBe(3);
    expect(s.nemesis).toEqual({ name: 'Ann', gap: 2, direction: 'chase' });
    // A 1–1 makes Bea's exact pick land and vaults them past Ann.
    expect(s.ifStands?.fromRank).toBe(2);
    expect(s.ifStands?.toRank).toBe(1);
    expect(s.ifStands?.delta).toBeGreaterThan(0);
    expect(s.ifStands?.gain).toBeGreaterThan(0);
  });

  it('frames the leader as defending against the chaser below', () => {
    const s = liveStakes(board(), 'p1', 'm2', live)!;
    expect(s.rank).toBe(1);
    expect(s.nemesis?.direction).toBe('defend');
    expect(s.nemesis?.name).toBe('Bea');
  });

  it('omits the projection before there is a live scoreline', () => {
    const s = liveStakes(board(), 'p2', 'm2', undefined)!;
    expect(s.ifStands).toBeNull();
    expect(s.nemesis?.direction).toBe('chase');
  });
});
