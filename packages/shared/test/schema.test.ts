import { describe, expect, it } from 'vitest';
import { createRoom, emptyRoomState } from '../src/rooms.js';
import {
  CURRENT_SCHEMA_VERSION,
  isCurrentSchema,
  migrateRoomState,
  schemaVersionOf,
} from '../src/schema.js';

/** A minimal legacy (pre-versioning) room state: only the original fields. */
function legacyState() {
  return {
    room: {
      id: 'room_1',
      slug: 'abc123',
      name: 'Old Trip',
      createdAt: '2026-01-01T00:00:00Z',
      createdBy: 'mem_1',
      inviteToken: 'tok',
      members: [{ id: 'mem_1', name: 'Ann', color: '#ef4444', role: 'owner', joinedAt: 'x' }],
      // NOTE: no settings, no currency
    },
    polls: [],
    inventory: [],
    activities: [],
    events: [],
    doodle: { id: 'd1', roomId: 'room_1', strokes: [] },
    // no messages, availability, notes
  };
}

describe('schemaVersionOf', () => {
  it('treats untagged states as version 0', () => {
    expect(schemaVersionOf(legacyState())).toBe(0);
    expect(schemaVersionOf({ schemaVersion: 1, room: {} })).toBe(1);
    expect(schemaVersionOf(null)).toBe(0);
  });
});

describe('migrateRoomState', () => {
  it('upgrades a legacy state and backfills every collection', () => {
    const migrated = migrateRoomState(legacyState());
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.messages).toEqual([]);
    expect(migrated.availability).toEqual([]);
    expect(migrated.doodle.notes).toEqual([]);
    // settings backfilled from defaults
    expect(migrated.room.settings.currency).toBe('EUR');
    expect(migrated.room.settings.workingHours).toEqual({ startHour: 9, endHour: 22 });
    expect(migrated.room.settings.openJoin).toBe(true);
  });

  it('preserves existing data while filling gaps', () => {
    const s = legacyState();
    s.inventory = [{ id: 'i1', name: 'Tent' }] as never;
    const migrated = migrateRoomState(s);
    expect(migrated.inventory).toHaveLength(1);
    expect(migrated.room.name).toBe('Old Trip');
  });

  it('is idempotent', async () => {
    const { room } = await createRoom({ name: 'X', ownerName: 'A' });
    const once = migrateRoomState(emptyRoomState(room));
    const twice = migrateRoomState(once);
    expect(twice).toEqual(once);
    expect(isCurrentSchema(twice)).toBe(true);
  });

  it('leaves a current-version state at the current version', async () => {
    const { room } = await createRoom({ name: 'X', ownerName: 'A' });
    const state = { ...emptyRoomState(room), schemaVersion: CURRENT_SCHEMA_VERSION };
    expect(migrateRoomState(state).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('keeps a partial settings object and fills only missing keys', () => {
    const s = legacyState();
    (s.room as Record<string, unknown>).settings = { currency: 'USD' };
    const migrated = migrateRoomState(s);
    expect(migrated.room.settings.currency).toBe('USD');
    expect(migrated.room.settings.defaultSlotMinutes).toBe(90); // default filled
  });

  it('does not mutate its input (pure)', () => {
    const s = legacyState();
    const snapshot = JSON.stringify(s);
    migrateRoomState(s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('leaves a future-version state untouched rather than downgrading it', () => {
    const future = {
      schemaVersion: CURRENT_SCHEMA_VERSION + 5,
      room: { id: 'r', slug: 's', members: [] },
      polls: [],
      futureField: 'keep me',
    };
    const result = migrateRoomState(future) as unknown as Record<string, unknown>;
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION + 5);
    expect(result.futureField).toBe('keep me');
  });

  it('throws on values that cannot be a room state', () => {
    expect(() => migrateRoomState(null)).toThrow(/room state/);
    expect(() => migrateRoomState({ nope: true })).toThrow(/room state/);
  });
});
