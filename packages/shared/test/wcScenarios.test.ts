import { describe, expect, it } from 'vitest';
import { matchScenarios } from '../src/wcScenarios.js';
import type { WorldCupState } from '../src/worldcup.js';

// Ann leads after m0 (exact 1-0 = 5) over Bob (right result = 3). m1 is unplayed:
// Ann picked 0-0, Bob picked 2-1 — so a 2-1 hands Bob the lead.
const base: WorldCupState = {
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
      homeId: 'C',
      awayId: 'D',
    },
  ],
  predictors: [
    { id: 'ann', name: 'Ann' },
    { id: 'bob', name: 'Bob' },
  ],
  predictions: [
    { predictorId: 'ann', matchId: 'm0', home: 1, away: 0, updatedAt: 'x' },
    { predictorId: 'bob', matchId: 'm0', home: 3, away: 0, updatedAt: 'x' },
    { predictorId: 'ann', matchId: 'm1', home: 0, away: 0, updatedAt: 'x' },
    { predictorId: 'bob', matchId: 'm1', home: 2, away: 1, updatedAt: 'x' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('matchScenarios', () => {
  it('gives each player odds of finishing top, and flags a volatile table', () => {
    const s = matchScenarios(base, 'm1', null);
    expect(s.leaderName).toBe('Ann');
    expect(s.predicted).toBe(2);
    expect(s.volatile).toBe(true);

    const ann = s.outlooks.find((o) => o.name === 'Ann')!;
    const bob = s.outlooks.find((o) => o.name === 'Bob')!;
    // Someone is always 1st, so the two pTop values cover ~all the probability.
    expect(ann.pTop + bob.pTop).toBeCloseTo(1, 1);
    // Bob can take 1st (he reaches rank 1 on some results), but Ann is likelier.
    expect(bob.pTop).toBeGreaterThan(0);
    expect(bob.bestRank).toBe(1);
    expect(ann.pTop).toBeGreaterThan(bob.pTop);
    // Bob can climb; Ann can drop.
    expect(bob.pUp).toBeGreaterThan(0);
    expect(ann.pDown).toBeGreaterThan(0);
    expect(bob.maxGain).toBe(5); // an exact 2-1
  });

  it('updates with the live score: 0-0 at 89’ all but locks Ann on top', () => {
    const s = matchScenarios(base, 'm1', null, { minute: 89, home: 0, away: 0 });
    const ann = s.outlooks.find((o) => o.name === 'Ann')!;
    expect(ann.pTop).toBeGreaterThan(0.8); // a 0-0 finish hands Ann the exact
  });

  it('outlooks are ordered by current rank', () => {
    const s = matchScenarios(base, 'm1', null);
    expect(s.outlooks.map((o) => o.currentRank)).toEqual([1, 2]);
  });
});
