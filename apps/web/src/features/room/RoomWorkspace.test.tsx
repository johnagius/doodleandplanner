import {
  addMember,
  createGame,
  createRoom,
  emptyRoomState,
  joinGame,
  startGame,
} from '@dap/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../../components/Toast.js';
import {
  LocalStorageRepository,
  getRepository,
  setIdentity,
  setRepository,
} from '../../lib/storage/index.js';
import { useRoomStore } from '../../state/roomStore.js';
import { RoomWorkspace } from './RoomWorkspace.js';

async function seedAndLoad() {
  const { room, owner } = await createRoom({ name: 'Beach Day', ownerName: 'Alice' });
  await getRepository().createRoom(emptyRoomState(room));
  setIdentity(room.id, owner.id);
  await useRoomStore.getState().loadRoom(room.slug);
}

function renderWorkspace() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <RoomWorkspace />
      </MemoryRouter>
    </ToastProvider>,
  );
}

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
  await seedAndLoad();
});

describe('RoomWorkspace', () => {
  it('shows the room header and tabs', () => {
    renderWorkspace();
    expect(screen.getByRole('heading', { name: 'Beach Day' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Schedule/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Doodle/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Inventory/ })).toBeInTheDocument();
  });

  it('badges the Games tab when it is your move', () => {
    const s = useRoomStore.getState().state!;
    const meId = useRoomStore.getState().meId!;
    const withBob = addMember(s.room, { name: 'Bob' });
    let g = createGame({ roomId: s.room.id, type: 'tictactoe', createdBy: meId });
    g = joinGame(g, withBob.member.id);
    g = startGame(g); // turn 0 = me (the owner)
    useRoomStore.setState({ state: { ...s, room: withBob.room, games: [g] } });

    renderWorkspace();
    const gamesTab = screen.getByRole('tab', { name: /Games/ });
    expect(gamesTab).toHaveTextContent('1');
    expect(gamesTab.querySelector('.tab-badge')).not.toBeNull();
  });

  it('adds and claims an inventory item through the UI', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('tab', { name: /Inventory/ }));
    // The panel animates in (AnimatePresence), so await its content.
    await user.type(await screen.findByLabelText('Item name'), 'Sunscreen');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('Sunscreen')).toBeInTheDocument();
    expect(screen.getByText('unclaimed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /I’ll bring it/ }));
    // Once claimed, the claimer (Alice, the owner) is shown and the claim CTA is gone.
    expect(screen.queryByRole('button', { name: /I’ll bring it/ })).not.toBeInTheDocument();
    const summary = screen.getByText(/sorted/);
    expect(summary).toBeInTheDocument();
  });

  it('creates a scheduling poll and records a vote', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    // Header + empty-state both offer "+ New poll"; the header one is first.
    await user.click(screen.getAllByRole('button', { name: '+ New poll' })[0]!);
    await user.type(screen.getByLabelText('Poll title'), 'Which evening?');
    await user.click(screen.getByRole('button', { name: 'Create poll' }));

    // Poll renders with vote controls; cast a yes on the first option.
    const yesButtons = await screen.findAllByRole('button', { name: 'Vote yes' });
    await user.click(yesButtons[0]!);
    // The tally is rendered by <CountUp>, which animates "👍 " and the number in
    // separate nodes; assert on the card's combined text once it settles.
    const card = screen.getByText('Which evening?').closest('.card')!;
    // The tally counts up via an animation; allow headroom so a loaded full-suite
    // run doesn't time out before it settles (the default waitFor is only 1s).
    await waitFor(() => expect(card).toHaveTextContent(/👍\s*1/), { timeout: 3000 });
  });
});
