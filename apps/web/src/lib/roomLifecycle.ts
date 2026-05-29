import { createRoom, emptyRoomState, type RoomSettings } from '@dap/shared';
import { getRepository, setIdentity } from './storage/index.js';

export interface CreateRoomFormInput {
  name: string;
  description?: string;
  ownerName: string;
  password?: string;
  settings?: Partial<RoomSettings>;
}

/**
 * Create a room, persist it, and remember this device as the owner. Returns the
 * shareable slug and the secret invite token for building the first link.
 */
export async function createAndStoreRoom(
  input: CreateRoomFormInput,
): Promise<{ slug: string; inviteToken: string }> {
  const { room, owner } = await createRoom(input);
  const state = emptyRoomState(room);
  await getRepository().createRoom(state);
  setIdentity(room.id, owner.id);
  return { slug: room.slug, inviteToken: room.inviteToken };
}
