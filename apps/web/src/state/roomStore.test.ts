import { createRoom, emptyRoomState, tallyPoll, type RoomState } from '@dap/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  LocalStorageRepository,
  getRepository,
  setIdentity,
  setRepository,
} from '../lib/storage/index.js';
import { useRoomStore } from './roomStore.js';

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
