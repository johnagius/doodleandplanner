/**
 * Room persistence logic, decoupled from Durable Object storage via a tiny
 * key/value interface so it can be unit-tested with an in-memory map.
 */
import type { RoomState } from '@dap/shared';

export interface KvLike {
  get(key: string): Promise<string | undefined | null>;
  put(key: string, value: string): Promise<void>;
}

const ROOM_KEY = 'room';

export class RoomConflictError extends Error {
  constructor() {
    super('Room already exists');
    this.name = 'RoomConflictError';
  }
}

export class RoomService {
  constructor(private readonly storage: KvLike) {}

  async get(): Promise<RoomState | null> {
    const raw = await this.storage.get(ROOM_KEY);
    return raw ? (JSON.parse(raw) as RoomState) : null;
  }

  /** Create the room if absent; throws {@link RoomConflictError} if it exists. */
  async create(state: RoomState): Promise<RoomState> {
    if (await this.storage.get(ROOM_KEY)) throw new RoomConflictError();
    await this.storage.put(ROOM_KEY, JSON.stringify(state));
    return state;
  }

  /** Replace the stored room (used for every mutation from clients). */
  async save(state: RoomState): Promise<RoomState> {
    await this.storage.put(ROOM_KEY, JSON.stringify(state));
    return state;
  }
}

/** Validate an untrusted body looks enough like a RoomState to store. */
export function isRoomState(value: unknown): value is RoomState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const room = v.room as Record<string, unknown> | undefined;
  return (
    !!room &&
    typeof room.id === 'string' &&
    typeof room.slug === 'string' &&
    Array.isArray(room.members) &&
    Array.isArray(v.polls)
  );
}
