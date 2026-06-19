import type { WcSquadPlayer, WorldCupState } from '@dap/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlayerProfileModal } from './PlayerProfileModal.js';

// Stub the network-backed hooks so the modal renders deterministically offline.
vi.mock('./playerPhoto.js', () => ({ usePlayerPhoto: () => null }));
vi.mock('./playerProfile.js', () => ({
  usePlayerProfile: () => ({
    profile: {
      club: 'FC Test',
      nationality: 'Brazil',
      position: 'Forward',
      born: '1997-07-12',
      height: '1.75 m',
      description: 'A test footballer who plays up front.',
    },
    loading: false,
  }),
}));

const wc = {
  season: '2026',
  title: 'T',
  teams: [{ id: 'BRA', name: 'Brazil', flag: '🇧🇷', group: 'A' }],
  matches: [],
  predictors: [],
  predictions: [],
  createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as WorldCupState;

const player: WcSquadPlayer = { id: 1, name: 'Test Player', pos: 'FWD', nat: 'BRA' };

describe('PlayerProfileModal', () => {
  it('shows the fetched club and bio', () => {
    render(<PlayerProfileModal player={player} wc={wc} onClose={() => {}} />);
    expect(screen.getByText('FC Test')).toBeInTheDocument();
    expect(screen.getByText(/plays up front/)).toBeInTheDocument();
    // Our ability rating (a number 62–91) renders.
    expect(screen.getByTitle('Our ability rating')).toBeInTheDocument();
  });
});
