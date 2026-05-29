import { addMember, createPoll, createRoom, emptyRoomState } from '@dap/shared';
import { render, screen } from '@testing-library/react';
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
import { PollCard } from './PollCard.js';

const O1 = { start: '2026-06-01T10:00:00.000Z', end: '2026-06-01T11:00:00.000Z' };
const O2 = { start: '2026-06-01T14:00:00.000Z', end: '2026-06-01T15:00:00.000Z' };

async function seed() {
  const { room, owner } = await createRoom({ name: 'Trip', ownerName: 'Alice' });
  const withBob = addMember(room, { name: 'Bob' });
  const poll = createPoll({ roomId: room.id, title: 'When?', options: [O1, O2] });
  const state = {
    ...emptyRoomState(withBob.room),
    polls: [poll],
    // Alice is busy during option 1 only; Bob hasn't shared (unknown).
    availability: [
      {
        memberId: owner.id,
        busy: [
          {
            start: '2026-06-01T10:30:00.000Z',
            end: '2026-06-01T10:45:00.000Z',
            title: 'Standup',
          },
        ],
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ],
  };
  await getRepository().createRoom(state);
  setIdentity(room.id, owner.id);
  await useRoomStore.getState().loadRoom(room.slug);
  return poll.id;
}

beforeEach(() => {
  localStorage.clear();
  setRepository(new LocalStorageRepository());
  useRoomStore.setState({
    state: null,
    meId: null,
    loading: false,
    error: null,
    unsubscribe: null,
  });
});

describe('PollCard conflict overlay', () => {
  it('shows conflict counts and names the clashing event', async () => {
    const pollId = await seed();
    render(
      <ToastProvider>
        <MemoryRouter>
          <PollCard pollId={pollId} />
        </MemoryRouter>
      </ToastProvider>,
    );
    // Option 1: Alice has a hard clash (15m of 60m). Option 2: she's free.
    expect(screen.getByText(/can’t make it/)).toBeInTheDocument();
    expect(screen.getByText(/free/)).toBeInTheDocument();
    // The blocking event name surfaces in the explanation.
    expect(screen.getByText(/Standup/)).toBeInTheDocument();
  });
});
