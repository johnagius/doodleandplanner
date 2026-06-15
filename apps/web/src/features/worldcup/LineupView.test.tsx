import type { WcLineup, WcMatch, WorldCupState } from '@dap/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Spain's XI — the exact lineup that used to show "—" for the front six. The
// network hooks are stubbed so the test exercises only the value path: with no
// VITE_API_BASE, usePlayerValues resolves synchronously from the committed DB.
const SPAIN: WcLineup = {
  teamTla: 'ESP',
  players: [
    { name: 'Unai Simón', jersey: 23, pos: 'G', starter: true, formationPlace: 1 },
    { name: 'Pedro Porro', jersey: 2, pos: 'RB', starter: true, formationPlace: 2 },
    { name: 'Dean Huijsen', jersey: 4, pos: 'CD-R', starter: true, formationPlace: 3 },
    { name: 'Robin Le Normand', jersey: 3, pos: 'CD-L', starter: true, formationPlace: 4 },
    { name: 'Marc Cucurella', jersey: 24, pos: 'LB', starter: true, formationPlace: 5 },
    { name: 'Rodri', jersey: 16, pos: 'DM', starter: true, formationPlace: 6 },
    { name: 'Pedri', jersey: 8, pos: 'CM-L', starter: true, formationPlace: 7 },
    { name: 'Fabián Ruiz', jersey: 14, pos: 'CM-R', starter: true, formationPlace: 8 },
    { name: 'Lamine Yamal', jersey: 19, pos: 'RW', starter: true, formationPlace: 9 },
    { name: 'Mikel Oyarzabal', jersey: 21, pos: 'ST', starter: true, formationPlace: 10 },
    { name: 'Nico Williams', jersey: 17, pos: 'LW', starter: true, formationPlace: 11 },
  ],
};

vi.mock('./lineups.js', () => ({
  useLineups: () => ({ loading: false, lineups: { home: SPAIN, away: null } }),
}));
vi.mock('./playerPhoto.js', () => ({
  usePlayerPhoto: () => null, // numbered shirts, no network
}));

import { LineupView } from './LineupView.js';

const wc = {
  teams: [{ id: 'ESP', name: 'Spain', flag: '🇪🇸', group: 'H' }],
} as unknown as WorldCupState;

const match = {
  id: 'm1',
  stage: 'group',
  order: 0,
  kickoff: '2026-06-15T16:00:00Z',
  homeId: 'ESP',
  awayId: 'CPV',
} as WcMatch;

describe('LineupView values', () => {
  it('renders real Transfermarkt values for the XI (no "—")', () => {
    const { container } = render(<LineupView wc={wc} match={match} />);
    // The front-six that used to be blank now show real values from the DB.
    expect(screen.getByText('€150M')).toBeTruthy(); // Pedri
    expect(screen.getByText('€200M')).toBeTruthy(); // Lamine Yamal
    // No starter renders the unknown ("—") or loading ("…") placeholder.
    const labels = [...container.querySelectorAll('.wc-lp-val')].map((n) => n.textContent);
    expect(labels.length).toBe(11);
    expect(labels).not.toContain('—');
    expect(labels).not.toContain('…');
    // The total is a real summed value, not the loading state.
    expect(screen.getByText(/Total XI value/)).toBeTruthy();
    expect(screen.queryByText(/Loading market values/)).toBeNull();
  });
});
