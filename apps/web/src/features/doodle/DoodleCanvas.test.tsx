import { createRoom, emptyRoomState } from '@dap/shared';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageRepository, setRepository, type Repository } from '../../lib/storage/index.js';
import { useRoomStore } from '../../state/roomStore.js';
import { DoodleCanvas } from './DoodleCanvas.js';

// A repository whose presence channel we can drive directly.
let presenceCb: ((payload: unknown) => void) | null = null;
const fakeRepo: Repository = {
  async createRoom() {},
  async getRoom() {
    return null;
  },
  async saveRoom(s) {
    return s;
  },
  async deleteRoom() {},
  async listRooms() {
    return [];
  },
  subscribe() {
    return () => undefined;
  },
  publishPresence() {},
  subscribePresence(_slug, cb) {
    presenceCb = cb;
    return () => {
      presenceCb = null;
    };
  },
};

beforeEach(() => {
  presenceCb = null;
});

describe('DoodleCanvas live cursors', () => {
  it('renders a remote cursor received over presence', async () => {
    setRepository(fakeRepo);
    const { room, owner } = await createRoom({ name: 'Sketch', ownerName: 'Alice' });
    useRoomStore.setState({ state: emptyRoomState(room), meId: owner.id });

    render(<DoodleCanvas />);
    expect(screen.queryByTestId('remote-cursor')).toBeNull();

    act(() => {
      presenceCb?.({
        memberId: 'bob',
        name: 'Bob',
        color: '#ef4444',
        x: 0.5,
        y: 0.5,
        at: Date.now(),
      });
    });

    expect(screen.getByTestId('remote-cursor')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();

    setRepository(new LocalStorageRepository());
  });
});
