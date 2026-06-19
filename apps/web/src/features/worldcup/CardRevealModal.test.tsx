import type { WcWonCard, WorldCupState } from '@dap/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CardRevealModal } from './CardRevealModal.js';

// The card art hook hits the network for photos — stub it so the reveal renders
// from flag art alone (the component under test doesn't care about photos).
vi.mock('./playerPhoto.js', () => ({ usePlayerPhoto: () => null }));

const wc = {
  season: '2026',
  title: 'T',
  teams: [{ id: 'BRA', name: 'Brazil', flag: '🇧🇷', group: 'A' }],
  matches: [],
  predictors: [],
  predictions: [],
  createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as WorldCupState;

const card = (matchId: string, id: number, name: string): WcWonCard => ({
  matchId,
  player: { id, name, pos: 'FWD', nat: 'BRA' },
});

describe('CardRevealModal', () => {
  it('renders nothing when there are no new cards', () => {
    const { container } = render(<CardRevealModal cards={[]} wc={wc} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reveals a single won card and closes on confirm', () => {
    const onClose = vi.fn();
    render(<CardRevealModal cards={[card('g-A-1', 1, 'Vinícius Jr')]} wc={wc} onClose={onClose} />);
    expect(screen.getByText('🃏 New card!')).toBeInTheDocument();
    expect(screen.getByText('Vinícius Jr')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add to collection/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pluralises the title when several drop at once', () => {
    render(
      <CardRevealModal
        cards={[card('g-A-1', 1, 'Rodrygo'), card('g-A-2', 2, 'Raphinha')]}
        wc={wc}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('🃏 2 new cards!')).toBeInTheDocument();
    expect(screen.getByText('Rodrygo')).toBeInTheDocument();
    expect(screen.getByText('Raphinha')).toBeInTheDocument();
  });
});
