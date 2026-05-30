import { createPhoto, createRoom, emptyRoomState } from '@dap/shared';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../../components/Toast.js';
import {
  LocalStorageRepository,
  getRepository,
  setIdentity,
  setRepository,
} from '../../lib/storage/index.js';
import { useRoomStore } from '../../state/roomStore.js';
import { GalleryPanel } from './GalleryPanel.js';

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
  const { room, owner } = await createRoom({ name: 'Trip', ownerName: 'Alice' });
  await getRepository().createRoom(emptyRoomState(room));
  setIdentity(room.id, owner.id);
  await useRoomStore.getState().loadRoom(room.slug);
});

function renderPanel() {
  return render(
    <ToastProvider>
      <GalleryPanel />
    </ToastProvider>,
  );
}

describe('GalleryPanel', () => {
  it('shows an empty state and the add controls', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /Add photos/ })).toBeInTheDocument();
    expect(screen.getByText(/No photos yet/)).toBeInTheDocument();
  });

  it('groups existing photos into country albums with event subheaders', () => {
    const roomId = useRoomStore.getState().state!.room.id;
    const authorId = useRoomStore.getState().meId!;
    const base = { roomId, authorId, mime: 'image/jpeg', width: 100, height: 100 };
    useRoomStore.setState((s) => ({
      state: {
        ...s.state!,
        photos: [
          createPhoto({ ...base, country: 'Malta', event: 'Beach day', caption: 'Sea' }),
          createPhoto({ ...base, country: 'Italy', event: 'Rome' }),
        ],
      },
    }));
    renderPanel();
    expect(screen.getByRole('heading', { name: /Malta/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Italy/ })).toBeInTheDocument();
    expect(screen.getByText('Beach day')).toBeInTheDocument();
    expect(screen.getByText('2 photos')).toBeInTheDocument();
  });
});
