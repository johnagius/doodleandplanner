import { seedWorldCup, setResult, type WorldCupState } from '@dap/shared';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useWorldCupStore } from '../../state/worldCupStore.js';
import { GroupTables } from './GroupTables.js';

afterEach(() => useWorldCupStore.setState({ live: {} }));

/** Play every group out so each group has a settled third-placed team. Higher
 * seed (earlier in the group) wins 2-0. */
function completedTournament(): WorldCupState {
  let s = seedWorldCup(() => new Date('2026-06-01T00:00:00Z'));
  const rank = new Map<string, number>();
  for (const g of new Set(s.teams.map((t) => t.group))) {
    s.teams.filter((t) => t.group === g).forEach((t, i) => rank.set(t.id, i));
  }
  for (const m of s.matches.filter((m) => m.stage === 'group')) {
    const homeWins = (rank.get(m.homeId!) ?? 9) < (rank.get(m.awayId!) ?? 9);
    s = setResult(s, { matchId: m.id, home: homeWins ? 2 : 0, away: homeWins ? 0 : 2 });
  }
  return s;
}

describe('GroupTables — best third-placed teams race', () => {
  it('lists all 12 thirds and marks the top-8 cut', () => {
    const { container } = render(<GroupTables wc={completedTournament()} />);
    const rows = container.querySelectorAll('.wc-thirds-table tbody tr');
    expect(rows).toHaveLength(12);
    // Eight qualify, four miss out.
    expect(container.querySelectorAll('.wc-thirds-table .wc-third-in')).toHaveLength(8);
    expect(container.querySelectorAll('.wc-thirds-table .wc-third-out')).toHaveLength(4);
    // The cut line sits on the first team below the line (the 9th).
    const cut = container.querySelectorAll('.wc-thirds-table .wc-third-cut');
    expect(cut).toHaveLength(1);
    expect(rows[8]!.classList.contains('wc-third-cut')).toBe(true);
  });

  it('shows a placeholder before any group game is played', () => {
    const fresh = seedWorldCup(() => new Date('2026-06-01T00:00:00Z'));
    const { container } = render(<GroupTables wc={fresh} />);
    expect(container.querySelector('.wc-thirds-table')).toBeNull();
    expect(container.querySelector('.wc-thirds')?.textContent).toContain('Fills in once');
  });

  it('folds an in-play score in live and flags the live group', () => {
    const fresh = seedWorldCup(() => new Date('2026-06-01T00:00:00Z'));
    const m = fresh.matches.find((x) => x.stage === 'group' && x.group === 'A')!;
    useWorldCupStore.setState({
      live: { [m.id]: { status: 'IN_PLAY', minute: 60, home: 2, away: 0 } },
    });
    const { container } = render(<GroupTables wc={fresh} />);
    // The 🔴 LIVE badge shows (thirds header + the live group's card).
    expect(container.querySelectorAll('.wc-live-badge').length).toBeGreaterThan(0);
    // The provisional score lights up the table that was empty before.
    expect(container.querySelector('.wc-thirds-table')).not.toBeNull();
  });
});
