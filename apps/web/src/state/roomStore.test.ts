import {
  createRoom,
  emptyRoomState,
  linkGoogleProfile,
  tallyPoll,
  type RoomState,
} from '@dap/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LocalStorageRepository,
  clearIdentity,
  getRepository,
  setIdentity,
  setRepository,
} from '../lib/storage/index.js';
import { useGoogleStore } from './googleStore.js';
import { useRoomStore } from './roomStore.js';

afterEach(() => useGoogleStore.setState({ profile: null, email: null }));

let seed: RoomState;
let ownerId: string;

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

  const { room, owner } = await createRoom({ name: 'Camping', ownerName: 'Alice' });
  ownerId = owner.id;
  seed = emptyRoomState(room);
  await getRepository().createRoom(seed);
  setIdentity(room.id, owner.id);
});

const store = () => useRoomStore.getState();

describe('roomStore loading & identity', () => {
  it('loads a room and resolves the local member', async () => {
    await store().loadRoom(seed.room.slug);
    expect(store().state?.room.name).toBe('Camping');
    expect(store().meId).toBe(ownerId);
  });

  it('returns null state for unknown rooms', async () => {
    await store().loadRoom('missing');
    expect(store().state).toBeNull();
  });

  it('recognises a signed-in member across devices by Google email', async () => {
    // Owner links a Google email; persist it.
    const linked = {
      ...seed,
      room: linkGoogleProfile(seed.room, ownerId, { email: 'alice@example.com', name: 'Alice' }),
    };
    await getRepository().saveRoom(linked);

    // Simulate a fresh device: no local identity, but signed in as that email.
    clearIdentity(seed.room.id);
    useGoogleStore.setState({
      profile: { email: 'alice@example.com' },
      email: 'alice@example.com',
    });

    await store().loadRoom(seed.room.slug);
    expect(store().meId).toBe(ownerId);
  });

  it('does not adopt an identity when no member email matches', async () => {
    clearIdentity(seed.room.id);
    useGoogleStore.setState({
      profile: { email: 'stranger@example.com' },
      email: 'stranger@example.com',
    });
    await store().loadRoom(seed.room.slug);
    expect(store().meId).toBeNull();
  });

  it('joins a room as a new member and persists', async () => {
    localStorage.removeItem(`dap:identity:${seed.room.id}`);
    await store().loadRoom(seed.room.slug);
    expect(store().meId).toBeNull();
    const member = await store().joinRoom('Bob');
    expect(member?.name).toBe('Bob');
    expect(store().meId).toBe(member?.id);
    const persisted = await getRepository().getRoom(seed.room.slug);
    expect(persisted?.room.members).toHaveLength(2);
  });
});

describe('roomStore actions', () => {
  beforeEach(async () => {
    await store().loadRoom(seed.room.slug);
  });

  it('creates a poll and records a vote', async () => {
    await store().addPoll({
      title: 'Weekend?',
      options: [{ start: '2026-06-06T10:00:00Z', end: '2026-06-06T12:00:00Z' }],
    });
    const poll = store().state!.polls[0]!;
    await store().vote(poll.id, poll.options[0]!.id, 'yes');
    const tally = tallyPoll(store().state!.polls[0]!);
    expect(tally[0]!.yes).toBe(1);
    expect(tally[0]!.yesMembers).toEqual([ownerId]);
  });

  it('manages inventory claim lifecycle', async () => {
    await store().addItem({ name: 'Tent', quantity: 1 });
    const item = store().state!.inventory[0]!;
    await store().claim(item.id);
    expect(store().state!.inventory[0]!.claimedBy).toBe(ownerId);
    await store().release(item.id);
    expect(store().state!.inventory[0]!.status).toBe('needed');
  });

  it('adds an activity and toggles interest', async () => {
    await store().addActivity({ title: 'Kayaking' });
    const act = store().state!.activities[0]!;
    await store().toggleActivityInterest(act.id);
    expect(store().state!.activities[0]!.interested).toContain(ownerId);
  });

  it('draws and undoes strokes', async () => {
    await store().draw({ color: '#ef4444', width: 3, points: [{ x: 0.1, y: 0.1 }] });
    await store().draw({ color: '#3b82f6', width: 3, points: [{ x: 0.5, y: 0.5 }] });
    expect(store().state!.doodle.strokes).toHaveLength(2);
    await store().undoDoodle();
    expect(store().state!.doodle.strokes).toHaveLength(1);
  });

  it('schedules an event and persists across reload', async () => {
    await store().addEvent({
      title: 'Campfire',
      start: '2026-06-06T20:00:00Z',
      end: '2026-06-06T22:00:00Z',
    });
    expect(store().state!.events).toHaveLength(1);
    // Reload from the backend to confirm persistence.
    useRoomStore.setState({ state: null });
    await store().loadRoom(seed.room.slug);
    expect(store().state!.events[0]!.title).toBe('Campfire');
  });

  it('surfaces domain errors without throwing', async () => {
    await store().addItem({ name: 'Chairs' });
    const item = store().state!.inventory[0]!;
    await store().editItem(item.id, { quantity: 0 });
    expect(store().error).toMatch(/Quantity/);
  });
});

describe('room settings', () => {
  it('updates name, description and working hours', async () => {
    await store().loadRoom(seed.room.slug);
    await store().updateRoom({
      name: 'Glamping',
      description: 'Fancy tents',
      settings: { defaultSlotMinutes: 120, workingHours: { startHour: 8, endHour: 20 } },
    });
    const room = store().state!.room;
    expect(room.name).toBe('Glamping');
    expect(room.description).toBe('Fancy tents');
    expect(room.settings.defaultSlotMinutes).toBe(120);
    expect(room.settings.workingHours).toEqual({ startHour: 8, endHour: 20 });
  });

  it('rejects an empty room name', async () => {
    await store().loadRoom(seed.room.slug);
    await store().updateRoom({ name: '   ' });
    expect(store().error).toMatch(/name/i);
    expect(store().state!.room.name).toBe('Camping');
  });
});

describe('realtime: optimistic update vs subscription echo', () => {
  let listener: ((s: RoomState) => void) | null;
  let releaseSave: (() => void) | null;
  let saved: RoomState[];
  let base: RoomState;

  async function setup() {
    listener = null;
    releaseSave = null;
    saved = [];
    const { room } = await createRoom({ name: 'Race', ownerName: 'Ann' });
    base = emptyRoomState(room);
    const repo = {
      async createRoom() {},
      async getRoom() {
        return base;
      },
      async saveRoom(s: RoomState) {
        saved.push(s);
        await new Promise<void>((res) => (releaseSave = res));
        return s;
      },
      async deleteRoom() {},
      async listRooms() {
        return [];
      },
      subscribe(_slug: string, l: (s: RoomState) => void) {
        listener = l;
        return () => {};
      },
    };
    setRepository(repo as never);
    setIdentity(base.room.id, base.room.members[0]!.id);
    await store().loadRoom(base.room.slug);
  }

  it('ignores the echo of our own save (no clobber)', async () => {
    await setup();
    const writing = store().addItem({ name: 'Local item' });
    expect(store().state!.inventory).toHaveLength(1);

    // The backend echoes back exactly what we saved — must not change anything.
    listener!(saved[0]!);
    releaseSave!();
    await writing;
    expect(store().state!.inventory).toHaveLength(1);
  });

  it('applies a genuinely newer remote update that arrived mid-write', async () => {
    await setup();
    const writing = store().addItem({ name: 'Local item' });

    // A different client renamed the room while our write was in flight.
    const remote = { ...base, room: { ...base.room, name: 'FromOtherClient' } };
    listener!(remote);
    // Still our optimistic state until the write settles.
    expect(store().state!.room.name).toBe('Race');

    releaseSave!();
    await writing;
    // Deferred remote differs from our echo, so it's applied afterwards.
    expect(store().state!.room.name).toBe('FromOtherClient');
  });

  it('rolls back and surfaces an error when the save fails', async () => {
    const { room } = await createRoom({ name: 'Rollback', ownerName: 'Ann' });
    const seed = emptyRoomState(room);
    const repo = {
      async createRoom() {},
      async getRoom() {
        return seed;
      },
      async saveRoom() {
        throw new Error('network down');
      },
      async deleteRoom() {},
      async listRooms() {
        return [];
      },
      subscribe() {
        return () => {};
      },
    };
    setRepository(repo as never);
    setIdentity(seed.room.id, seed.room.members[0]!.id);
    await store().loadRoom(seed.room.slug);

    await store().addItem({ name: 'Doomed' });
    // Optimistic add was rolled back, and the error surfaced.
    expect(store().state!.inventory).toHaveLength(0);
    expect(store().error).toMatch(/network down/);
  });
});
