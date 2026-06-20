import type { WcMatch, WorldCupState } from '@dap/shared';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PreMatchHype } from './PreMatchHype.js';

vi.mock('./wcSound.js', () => ({ playSound: vi.fn() }));

const future = '2026-06-20T18:00:00.000Z';
const match = {
  id: 'm1',
  stage: 'group',
  group: 'A',
  matchday: 1,
  order: 0,
  kickoff: future,
  homeId: 'AAA',
  awayId: 'BBB',
} as WcMatch;

const wc = {
  predictors: [
    { id: 'p1', name: 'John' },
    { id: 'p2', name: 'Sara' },
  ],
  predictions: [{ matchId: 'm1', predictorId: 'p2', home: 7, away: 7, updatedAt: future }],
  matches: [match],
} as unknown as WorldCupState;

describe('PreMatchHype', () => {
  it('shows the lock-in ritual and a countdown, without revealing picks', () => {
    const now = Date.parse('2026-06-20T16:00:00.000Z'); // exactly 2h before kickoff
    const { container } = render(<PreMatchHype wc={wc} match={match} now={now} />);

    expect(container.textContent).toContain('1 of 2 in');
    expect(container.querySelector('.wc-lockin-pending')?.textContent).toContain('John');
    expect(container.querySelector('.wc-hype-countdown')).not.toBeNull();
    // Sara's 7–7 pick must stay hidden until kickoff.
    expect(container.textContent).not.toContain('7');
  });
});
