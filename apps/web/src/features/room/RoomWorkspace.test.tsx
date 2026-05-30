import { createRoom, emptyRoomState } from '@dap/shared';
import { render, screen, within } from '@testing-library/react';
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
    expect(
      within(screen.getByText('Which evening?').closest('.card')!).getByText(/👍 1/),
    ).toBeInTheDocument();
  });
});
