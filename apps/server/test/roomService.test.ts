import { createRoom, emptyRoomState } from '@dap/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { RoomConflictError, RoomService, isRoomState, type KvLike } from '../src/roomService.js';

class MemoryKv implements KvLike {
  private map = new Map<string, string>();
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.map.set(key, value);
  }
}

async function freshState() {
  const { room } = await createRoom({ name: 'Trip', ownerName: 'Ann' });
  return emptyRoomState(room);
}

describe('RoomService', () => {
  let kv: MemoryKv;
  let service: RoomService;

  beforeEach(() => {
    kv = new MemoryKv();
    service = new RoomService(kv);
  });

  it('returns null before a room exists', async () => {
    expect(await service.get()).toBeNull();
  });

  it('creates then reads a room round-trip', async () => {
    const state = await freshState();
    await service.create(state);
    const loaded = await service.get();
    expect(loaded?.room.slug).toBe(state.room.slug);
    expect(loaded?.room.name).toBe('Trip');
  });

  it('rejects creating the same room twice', async () => {
    const state = await freshState();
    await service.create(state);
    await expect(service.create(state)).rejects.toBeInstanceOf(RoomConflictError);
  });

  it('saves updates over an existing room', async () => {
    const state = await freshState();
    await service.create(state);
    const updated = { ...state, room: { ...state.room, name: 'Renamed' } };
    await service.save(updated);
    expect((await service.get())?.room.name).toBe('Renamed');
  });
});

describe('isRoomState', () => {
  it('accepts a real room state and rejects junk', async () => {
    expect(isRoomState(await freshState())).toBe(true);
    expect(isRoomState(null)).toBe(false);
    expect(isRoomState({})).toBe(false);
    expect(isRoomState({ room: { id: 'x' } })).toBe(false);
    expect(isRoomState('nope')).toBe(false);
  });
});
