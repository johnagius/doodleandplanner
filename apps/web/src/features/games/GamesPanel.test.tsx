import {
  addMember,
  createGame as makeGame,
  createRoom,
  emptyRoomState,
  joinGame as joinG,
  startGame as startG,
} from '@dap/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../../components/Toast.js';
import {
  LocalStorageRepository,
  getRepository,
  setIdentity,
  setRepository,
} from '../../lib/storage/index.js';
import { useRoomStore } from '../../state/roomStore.js';
import { GamesPanel } from './GamesPanel.js';

let aliceId = '';
let bobId = '';

beforeEach(async () => {
  localStorage.clear();
  setRepository(new LocalStorageRepository());
  useRoomStore.setState({
    state: null,
    meId: null,
    loading: false,
    error: null,
    unsubscribe: null,
  });

  const { room, owner } = await createRoom({ name: 'Game Night', ownerName: 'Alice' });
  const withBob = addMember(room, { name: 'Bob' });
  aliceId = owner.id;
  bobId = withBob.member.id;
  await getRepository().createRoom(emptyRoomState(withBob.room));
  setIdentity(withBob.room.id, owner.id);
  await useRoomStore.getState().loadRoom(withBob.room.slug);
});

function renderPanel() {
  return render(
    <ToastProvider>
      <GamesPanel />
    </ToastProvider>,
  );
}

describe('GamesPanel', () => {
  it('creates a game from the catalog and opens its lobby', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: /Dots & Boxes/ }));
    // Lobby view: creator is seated, needs a second player.
    expect(await screen.findByText(/Waiting for players \(1\/4\)/)).toBeInTheDocument();
    expect(screen.getByText(/Need at least 2 players/)).toBeInTheDocument();
  });

  it('plays a move in a started tic-tac-toe game', async () => {
    const roomId = useRoomStore.getState().state!.room.id;
    let g = makeGame({ roomId, type: 'tictactoe', createdBy: aliceId });
    g = joinG(g, bobId);
    g = startG(g);
    useRoomStore.setState((s) => ({ state: { ...s.state!, games: [g] } }));

    const user = userEvent.setup();
    renderPanel();

    // Open the in-progress game from the active list.
    await user.click(screen.getByRole('button', { name: /In progress/ }));
    expect(await screen.findByLabelText('Tic-tac-toe board')).toBeInTheDocument();
    // Alice (meId, seat 0) is to move.
    expect(screen.getByText(/Alice's turn/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cell 1, empty' }));
    // The cell is now taken and the turn passes to Bob.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cell 1, taken' })).toBeInTheDocument();
      expect(screen.getByText(/Bob's turn/)).toBeInTheDocument();
    });
  });
});
