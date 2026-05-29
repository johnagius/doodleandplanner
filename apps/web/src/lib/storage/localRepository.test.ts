import { createRoom, emptyRoomState, type RoomState } from '@dap/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageRepository } from './localRepository.js';
import { RoomExistsError } from './repository.js';

async function makeState(name = 'Trip'): Promise<RoomState> {
  const { room } = await createRoom({ name, ownerName: 'Alice' });
  return emptyRoomState(room);
}

describe('LocalStorageRepository', () => {
  let repo: LocalStorageRepository;

  beforeEach(() => {
    localStorage.clear();
    repo = new LocalStorageRepository();
  });

  it('creates and reads a room by slug', async () => {
    const state = await makeState();
    await repo.createRoom(state);
    const loaded = await repo.getRoom(state.room.slug);
    expect(loaded?.room.name).toBe('Trip');
    expect(loaded?.room.id).toBe(state.room.id);
  });

  it('migrates a legacy stored room on read', async () => {
    // Hand-write a pre-versioning record missing newer fields.
    const legacy = {
      version: 1,
      updatedAt: new Date().toISOString(),
      state: {
        room: {
          id: 'room_legacy',
          slug: 'legacy1',
          name: 'Legacy',
          createdAt: 'x',
          createdBy: 'm1',
          inviteToken: 't',
          members: [{ id: 'm1', name: 'A', color: '#ef4444', role: 'owner', joinedAt: 'x' }],
        },
        polls: [],
        inventory: [],
        activities: [],
        events: [],
        doodle: { id: 'd', roomId: 'room_legacy', strokes: [] },
      },
    };
    localStorage.setItem('dap:room:legacy1', JSON.stringify(legacy));
    const loaded = await repo.getRoom('legacy1');
    expect(loaded?.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(loaded?.messages).toEqual([]);
    expect(loaded?.availability).toEqual([]);
    expect(loaded?.room.settings.currency).toBe('EUR');
  });

  it('returns null for unknown slugs', async () => {
    expect(await repo.getRoom('nope')).toBeNull();
  });

  it('rejects duplicate room creation', async () => {
    const state = await makeState();
    await repo.createRoom(state);
    await expect(repo.createRoom(state)).rejects.toBeInstanceOf(RoomExistsError);
  });

  it('saves updates and lists rooms newest-first', async () => {
    const a = await makeState('Alpha');
    const b = await makeState('Beta');
    await repo.createRoom(a);
    await repo.createRoom(b);
    const list = await repo.listRooms();
    expect(list.map((r) => r.name)).toEqual(['Beta', 'Alpha']);
    expect(list[0]!.memberCount).toBe(1);
  });

  it('notifies subscribers on save', async () => {
    const state = await makeState();
    await repo.createRoom(state);
    const listener = vi.fn();
    const unsub = repo.subscribe(state.room.slug, listener);
    const updated = { ...state, room: { ...state.room, name: 'Renamed' } };
    await repo.saveRoom(updated);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ room: expect.objectContaining({ name: 'Renamed' }) }),
    );
    unsub();
    await repo.saveRoom(updated);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('deletes a room and drops it from the index', async () => {
    const state = await makeState();
    await repo.createRoom(state);
    await repo.deleteRoom(state.room.slug);
    expect(await repo.getRoom(state.room.slug)).toBeNull();
    expect(await repo.listRooms()).toHaveLength(0);
  });

  it('reacts to cross-tab storage events', async () => {
    const state = await makeState();
    await repo.createRoom(state);
    const listener = vi.fn();
    repo.subscribe(state.room.slug, listener);

    const updated = { ...state, room: { ...state.room, name: 'FromOtherTab' } };
    const record = JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      state: updated,
    });
    window.dispatchEvent(
      new StorageEvent('storage', { key: `dap:room:${state.room.slug}`, newValue: record }),
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ room: expect.objectContaining({ name: 'FromOtherTab' }) }),
    );
  });
});
