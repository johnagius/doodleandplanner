import { describe, expect, it } from 'vitest';
import { forwardScenarios, unplayedBefore } from '../src/wcForward.js';
import type { WorldCupState } from '../src/worldcup.js';

// Ann leads after m0 (exact 1-0 = 5) over Bob (right result = 3). Two more group
// games are still to play: m1 (12th) then m2 (13th). Ann picked wildly (5-0 each,
// almost never scores); Bob picked sensibly, so across the run-in he can reel her
// in — exactly the "matches in between" the single-match view ignores.
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
    {
      id: 'm2',
      stage: 'group',
      order: 2,
      kickoff: '2026-06-13T00:00:00Z',
      homeId: 'E',
      awayId: 'F',
    },
    // A knockout slot with no teams yet — must never be simulated.
    { id: 'r32-1', stage: 'r32', order: 3, kickoff: '2026-06-20T00:00:00Z' },
  ],
  predictors: [
    { id: 'ann', name: 'Ann' },
    { id: 'bob', name: 'Bob' },
  ],
  predictions: [
    { predictorId: 'ann', matchId: 'm0', home: 1, away: 0, updatedAt: 'x' },
    { predictorId: 'bob', matchId: 'm0', home: 3, away: 0, updatedAt: 'x' },
    { predictorId: 'ann', matchId: 'm1', home: 5, away: 0, updatedAt: 'x' },
    { predictorId: 'bob', matchId: 'm1', home: 1, away: 1, updatedAt: 'x' },
    { predictorId: 'ann', matchId: 'm2', home: 5, away: 0, updatedAt: 'x' },
    { predictorId: 'bob', matchId: 'm2', home: 1, away: 0, updatedAt: 'x' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('unplayedBefore', () => {
  it('lists only earlier, unplayed, team-known matches', () => {
    expect(unplayedBefore(base, 'm2').map((m) => m.id)).toEqual(['m1']);
    expect(unplayedBefore(base, 'm1')).toEqual([]);
    // The teamless r32 slot is excluded even though it kicks off after everything.
    expect(unplayedBefore(base, 'r32-1').map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});

describe('forwardScenarios', () => {
  it('factors the games in between, so the leader is no longer a certainty', () => {
    const s = forwardScenarios(base, 'm2', { trials: 4000 });
    expect(s.leaderName).toBe('Ann');
    expect(s.matchesBefore).toBe(1); // m1 sits before m2
    expect(s.predicted).toBe(2); // picks on m2 itself
    expect(s.predictedAll).toBe(4); // m1 + m2 picks
    expect(s.outlooks.map((o) => o.currentRank)).toEqual([1, 2]);

    const ann = s.outlooks.find((o) => o.name === 'Ann')!;
    const bob = s.outlooks.find((o) => o.name === 'Bob')!;
    // The whole point: it is NOT 100% for a match two games out.
    expect(ann.pTop).toBeLessThan(1);
    expect(bob.pTop).toBeGreaterThan(0);
    // Someone is always top, so the two cover ~all the probability.
    expect(ann.pTop + bob.pTop).toBeCloseTo(1, 2);
    // Bob can climb; Ann can slip.
    expect(bob.pUp).toBeGreaterThan(0);
    expect(ann.pDown).toBeGreaterThan(0);
  });

  it('grows more uncertain the further out the match sits', () => {
    const near = forwardScenarios(base, 'm1', { trials: 4000 }); // 0 games before
    const far = forwardScenarios(base, 'm2', { trials: 4000 }); // 1 game before
    expect(near.matchesBefore).toBe(0);
    const annNear = near.outlooks.find((o) => o.name === 'Ann')!;
    const annFar = far.outlooks.find((o) => o.name === 'Ann')!;
    // More games in between ⇒ more chances for Ann to be overhauled.
    expect(annFar.pTop).toBeLessThan(annNear.pTop);
  });

  it('is deterministic — same board, same numbers', () => {
    const a = forwardScenarios(base, 'm2', { trials: 1500 });
    const b = forwardScenarios(base, 'm2', { trials: 1500 });
    expect(JSON.stringify(a.outlooks)).toBe(JSON.stringify(b.outlooks));
  });
});
