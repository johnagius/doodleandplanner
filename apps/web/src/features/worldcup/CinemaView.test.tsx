import { createRoom, emptyRoomState, type WcMatchEvent, type WorldCupState } from '@dap/shared';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../../components/Toast.js';
import { LocalStorageRepository, setRepository } from '../../lib/storage/index.js';
import { useWorldCupStore, type WcLiveInfo } from '../../state/worldCupStore.js';
import { CinemaView } from './CinemaView.js';
import { useMatchRoom } from './useMatchRoom.js';
import { WORLD_CUP_SLUG } from './worldCupRoom.js';

async function seedBoard(): Promise<WorldCupState> {
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
  useWorldCupStore.setState({ state: { ...emptyRoomState(room), worldCup: wc }, meId: 'p1' });
  return wc;
}

function renderCinema(wc: WorldCupState) {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <CinemaView wc={wc} />
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
  useMatchRoom.setState({ openId: null, seq: 0 });
});

afterEach(() => useMatchRoom.setState({ openId: null }));

describe('CinemaView', () => {
  it('opens a full-screen modal with the broadcast, the seats and the room chat', async () => {
    const wc = await seedBoard();
    const live: WcLiveInfo = { status: 'IN_PLAY', minute: 30, home: 1, away: 0 };
    const goal: WcMatchEvent = { minute: "23'", kind: 'goal', teamTla: 'AAA', player: 'Striker' };
    useWorldCupStore.setState({ live: { 'g-A-1': live }, matchEvents: { 'g-A-1': [goal] } });

    act(() => {
      renderCinema(wc);
    });
    act(() => {
      useMatchRoom.getState().open('g-A-1');
    });

    // The modal is portaled to <body>.
    expect(document.body.querySelector('.wc-cinema-modal')).not.toBeNull();
    // It names both teams.
    expect(document.body.textContent).toContain('Aland');
    expect(document.body.textContent).toContain('Bland');
    // The broadcast feed carries the commentary for the goal.
    expect(document.body.querySelector('.wc-feed')?.textContent).toContain('Striker');
    // The amphitheatre seats me.
    expect(document.body.querySelector('.wc-amph')).not.toBeNull();
    expect(document.body.querySelector('.wc-amph-person.is-me')).not.toBeNull();
    // Prominent room chat, and no leftover channel tabs.
    expect(screen.getByLabelText('Message the room')).toBeInTheDocument();
    expect(document.body.querySelector('.wc-screen-chan')).toBeNull();
  });

  it('stays closed until a match is opened', async () => {
    const wc = await seedBoard();
    act(() => {
      renderCinema(wc);
    });
    expect(document.body.querySelector('.wc-cinema-modal')).toBeNull();
  });
});
