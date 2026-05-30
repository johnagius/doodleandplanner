import {
  applyTemplate,
  createRoom,
  emptyRoomState,
  findTemplate,
  type RoomSettings,
} from '@dap/shared';
import { getRepository, setIdentity } from './storage/index.js';

export interface CreateRoomFormInput {
  name: string;
  description?: string;
  ownerName: string;
  /** Optional custom room code; normalised, falling back to a random one. */
  slug?: string;
  password?: string;
  settings?: Partial<RoomSettings>;
  /** Optional template id to pre-fill inventory + activities. */
  templateId?: string;
}

/**
 * Create a room, persist it, and remember this device as the owner. Returns the
 * shareable slug and the secret invite token for building the first link.
 */
export async function createAndStoreRoom(
  input: CreateRoomFormInput,
): Promise<{ slug: string; inviteToken: string }> {
  const { room, owner } = await createRoom(input);
  let state = emptyRoomState(room);
  const template = input.templateId ? findTemplate(input.templateId) : undefined;
  if (template) state = applyTemplate(state, template, owner.id);
  await getRepository().createRoom(state);
  setIdentity(room.id, owner.id);
  return { slug: room.slug, inviteToken: room.inviteToken };
}
