import { createRoom, emptyRoomState } from '@dap/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/Toast.js';
import {
  LocalStorageRepository,
  getRepository,
  setIdentity,
  setRepository,
} from '../../lib/storage/index.js';
import { useRoomStore } from '../../state/roomStore.js';
import { InviteModal } from './InviteModal.js';

async function seed() {
  const { room, owner } = await createRoom({ name: 'Beach Day', ownerName: 'Alice' });
  await getRepository().createRoom(emptyRoomState(room));
  setIdentity(room.id, owner.id);
  await useRoomStore.getState().loadRoom(room.slug);
}

function renderModal() {
  return render(
    <ToastProvider>
      <InviteModal open onClose={() => {}} />
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
  await seed();
});

describe('InviteModal', () => {
  it('shows the invite link with the room token and an email invite', () => {
    renderModal();
    const link = screen.getByLabelText('Invite link') as HTMLInputElement;
    const token = useRoomStore.getState().state!.room.inviteToken;
    expect(link.value).toContain('/r/');
    expect(link.value).toContain(`invite=${token}`);

    const email = screen.getByRole('link', { name: /email invite/i }) as HTMLAnchorElement;
    expect(email.href.startsWith('mailto:')).toBe(true);
    expect(decodeURIComponent(email.href)).toContain('Beach Day');
  });

  it('copies the invite link to the clipboard', async () => {
    const user = userEvent.setup();
    // user-event installs a clipboard stub; spy on it rather than reassigning
    // (navigator.clipboard is getter-only once set up).
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    renderModal();

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    const link = (screen.getByLabelText('Invite link') as HTMLInputElement).value;
    expect(writeText).toHaveBeenCalledWith(link);
  });

  it('resets the invite link, invalidating the old token', async () => {
    const before = useRoomStore.getState().state!.room.inviteToken;
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /reset link/i }));
    await waitFor(() => {
      expect(useRoomStore.getState().state!.room.inviteToken).not.toBe(before);
    });
  });
});
