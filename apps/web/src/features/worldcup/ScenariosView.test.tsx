import type { WcMatch, WorldCupState } from '@dap/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScenariosView } from './ScenariosView.js';

// Ann leads after m0. Two group games remain: m1 (12th) then m2 (13th). Ann
// picked wildly each time, Bob sensibly — so across the run-in Bob can reel her
// in. The card for m2 must reflect the game (m1) that lands first, not pretend
// the table is frozen.
const wc: WorldCupState = {
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

const matchById = (id: string) => wc.matches.find((m) => m.id === id) as WcMatch;

describe('ScenariosView', () => {
  it('for the imminent match (nothing in between) gives the exact single-match read', () => {
    render(<ScenariosView wc={wc} match={matchById('m1')} meId={null} />);
    // Crisp marginal wording — no forward caveat.
    expect(screen.getByText(/stays top/)).toBeTruthy();
    expect(screen.queryByText(/before it/)).toBeNull();
  });

  it('for a later match projects forward through the games in between', () => {
    render(<ScenariosView wc={wc} match={matchById('m2')} meId={null} />);
    // It now accounts for the one game that lands first…
    expect(screen.getByText(/Through the 1 game before it/)).toBeTruthy();
    // …and frames the lead as a forward race, not a frozen certainty.
    expect(screen.getAllByText(/top by then/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Projected across every game between now and this one/)).toBeTruthy();
    expect(screen.queryByText(/stays top/)).toBeNull();
  });

  it('shows every contender’s chance to lead, not just the front-runner', () => {
    render(<ScenariosView wc={wc} match={matchById('m2')} meId={null} />);
    // Both the leader (Ann) and the chaser (Bob) get their own odds-of-leading line.
    expect(screen.getByText(/Ann top by then/)).toBeTruthy();
    expect(screen.getByText(/Bob top by then/)).toBeTruthy();
  });
});
