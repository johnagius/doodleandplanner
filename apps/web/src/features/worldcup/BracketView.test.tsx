import type { WorldCupState } from '@dap/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/Toast.js';
import { LocalStorageRepository, setRepository } from '../../lib/storage/index.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { BracketView } from './BracketView.js';

const soon = new Date(Date.now() + 3 * 86_400_000).toISOString(); // 3 days out
const past = new Date(Date.now() - 3_600_000).toISOString(); // kicked off an hour ago

function board(): WorldCupState {
  return {
    season: '2026',
    title: 'T',
    teams: [
      { id: 'GER', name: 'Germany', flag: '🇩🇪', group: 'E' },
      { id: 'PAR', name: 'Paraguay', flag: '🇵🇾', group: 'D' },
      { id: 'BRA', name: 'Brazil', flag: '🇧🇷', group: 'C' },
      { id: 'JPN', name: 'Japan', flag: '🇯🇵', group: 'F' },
    ],
    matches: [
      // Ready and still in the future → predictable here.
      { id: 'r32-1', stage: 'r32', order: 0, kickoff: soon, homeId: 'GER', awayId: 'PAR' },
      // Ready but already kicked off → locked, no entry.
      { id: 'r32-2', stage: 'r32', order: 1, kickoff: past, homeId: 'BRA', awayId: 'JPN' },
    ],
    predictors: [{ id: 'p1', name: 'John' }],
    predictions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function renderBracket(wc: WorldCupState) {
  return render(
    <ToastProvider>
      <BracketView wc={wc} />
    </ToastProvider>,
  );
}

describe('BracketView', () => {
  beforeEach(() => {
    setRepository(new LocalStorageRepository());
    useWorldCupStore.setState({
      meId: 'p1',
      predict: vi.fn().mockResolvedValue(undefined),
      unpredict: vi.fn().mockResolvedValue(undefined),
    } as never);
  });

  it('shows each tie’s Malta kick-off time and a countdown for upcoming ties', () => {
    renderBracket(board());
    // Kick-off time label (🕒) appears for the ties.
    expect(screen.getAllByText(/🕒/).length).toBeGreaterThanOrEqual(2);
    // The upcoming tie gets a live countdown; the kicked-off one shows the lock.
    expect(screen.getByText(/⏱/)).toBeTruthy();
    expect(screen.getByText(/Kicked off/)).toBeTruthy();
  });

  it('lets you enter a scoreline for a ready, not-yet-started tie', async () => {
    const user = userEvent.setup();
    renderBracket(board());
    // Steppers only for the predictable tie (GER vs PAR), not the locked one.
    const goalGroups = screen.getAllByRole('group', { name: /goals$/ });
    expect(goalGroups).toHaveLength(2); // home + away of the one open tie
    const predict = useWorldCupStore.getState().predict;
    await user.click(within(goalGroups[0]!).getByRole('button', { name: /one more/ }));
    expect(predict).toHaveBeenCalledWith('r32-1', 1, 0);
  });

  it('does not offer score entry once a tie has kicked off', () => {
    renderBracket(board());
    // The locked tie (Brazil vs Japan) shows no steppers.
    expect(screen.getByText('Brazil')).toBeTruthy();
    expect(screen.getByText('Japan')).toBeTruthy();
    // Only one tie is predictable, so exactly two stepper groups exist in total.
    expect(screen.getAllByRole('group', { name: /goals$/ })).toHaveLength(2);
  });
});
