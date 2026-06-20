import { createRoom, emptyRoomState, type WorldCupState } from '@dap/shared';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../../components/Toast.js';
import { LocalStorageRepository, setRepository } from '../../lib/storage/index.js';
import { useWorldCupStore, type WcLiveInfo } from '../../state/worldCupStore.js';
import { MatchRoom } from './MatchRoom.js';
import { useMatchRoom } from './useMatchRoom.js';
import { WORLD_CUP_SLUG } from './worldCupRoom.js';

async function seed(live?: WcLiveInfo): Promise<void> {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString();
  const wc: WorldCupState = {
    season: '2026',
    title: 'Test Cup',
    version: 9999,
    teams: [
      { id: 'AAA', name: 'Aland', flag: '🅰️', group: 'A' },
      { id: 'BBB', name: 'Bland', flag: '🅱️', group: 'A' },
    ],
    matches: [
      {
        id: 'g-A-1',
        stage: 'group',
        group: 'A',
        matchday: 1,
        order: 0,
        kickoff: future,
        homeId: 'AAA',
        awayId: 'BBB',
      },
    ],
    predictors: [
      { id: 'p1', name: 'John' },
      { id: 'p2', name: 'Daniel' },
    ],
    predictions: [],
    createdAt: new Date().toISOString(),
  };
  const { room } = await createRoom({
    name: 'World Cup',
    ownerName: 'Predictions',
    slug: WORLD_CUP_SLUG,
  });
  useWorldCupStore.setState({
    state: { ...emptyRoomState(room), worldCup: wc },
    meId: 'p1',
    live: live ? { 'g-A-1': live } : {},
  });
}

function renderRoom() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <MatchRoom />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  setRepository(new LocalStorageRepository());
  useWorldCupStore.setState({
    state: null,
    meId: null,
    admin: false,
    live: {},
    liveFetchedAt: null,
    matchEvents: {},
    unsubscribe: null,
  });
  useMatchRoom.setState({ openId: null });
});

afterEach(() => {
  useMatchRoom.setState({ openId: null });
});

describe('MatchRoom', () => {
  it('renders nothing until a match is opened', async () => {
    await seed({ status: 'IN_PLAY', minute: 30, home: 1, away: 0 });
    renderRoom();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a live room with the scoreboard, watchers and live standings', async () => {
    await seed({ status: 'IN_PLAY', minute: 30, home: 1, away: 0 });
    renderRoom();
    act(() => useMatchRoom.getState().open('g-A-1'));

    const dialog = await screen.findByRole('dialog');
    // Both teams named (title + sides).
    expect(dialog.textContent).toContain('Aland');
    expect(dialog.textContent).toContain('Bland');
    // Live scoreline shows 1–0.
    const score = dialog.querySelector('.wc-room-score');
    expect(score?.textContent).toContain('1');
    expect(score?.textContent).toContain('0');
    // Presence + the live-folded board with both predictors.
    expect(dialog.querySelector('.wc-room-watchers')?.textContent).toMatch(/watching/i);
    const board = dialog.querySelector('.wc-room-board');
    expect(board).not.toBeNull();
    expect(board?.textContent).toContain('John');
    expect(board?.textContent).toContain('Daniel');
  });

  it('closes on the close button', async () => {
    await seed({ status: 'IN_PLAY', minute: 12, home: 0, away: 0 });
    const user = userEvent.setup();
    renderRoom();
    act(() => useMatchRoom.getState().open('g-A-1'));
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useMatchRoom.getState().openId).toBeNull();
  });
});
