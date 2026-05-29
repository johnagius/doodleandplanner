/**
 * Schema versioning + migrations for {@link RoomState}.
 *
 * Rooms are persisted in localStorage, exported to JSON files, and sent over
 * the wire to the Worker. As the model evolves, older persisted states may lack
 * newer fields. `migrateRoomState` upgrades any prior shape to the current one:
 * it is **pure, defensive (accepts `unknown`), and idempotent**.
 *
 * Bump {@link CURRENT_SCHEMA_VERSION} and add a step to `MIGRATIONS` whenever a
 * structural change needs data backfilled.
 */
import { DEFAULT_ROOM_SETTINGS } from './rooms.js';
import type {
  Activity,
  DoodleBoard,
  InventoryItem,
  MemberAvailability,
  Message,
  PlannedEvent,
  Room,
  RoomSettings,
  RoomState,
  SchedulePoll,
  Stroke,
} from './types.js';

export const CURRENT_SCHEMA_VERSION = 1;

type AnyRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is AnyRecord => typeof v === 'object' && v !== null;
const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Normalise room settings, filling any missing field from defaults. */
function normalizeSettings(raw: unknown): RoomSettings {
  const r = isRecord(raw) ? raw : {};
  const wh = isRecord(r.workingHours) ? r.workingHours : {};
  return {
    openJoin: typeof r.openJoin === 'boolean' ? r.openJoin : DEFAULT_ROOM_SETTINGS.openJoin,
    defaultSlotMinutes:
      typeof r.defaultSlotMinutes === 'number'
        ? r.defaultSlotMinutes
        : DEFAULT_ROOM_SETTINGS.defaultSlotMinutes,
    workingHours: {
      startHour:
        typeof wh.startHour === 'number'
          ? (wh.startHour as number)
          : DEFAULT_ROOM_SETTINGS.workingHours.startHour,
      endHour:
        typeof wh.endHour === 'number'
          ? (wh.endHour as number)
          : DEFAULT_ROOM_SETTINGS.workingHours.endHour,
    },
    currency: typeof r.currency === 'string' ? r.currency : DEFAULT_ROOM_SETTINGS.currency,
  };
}

function normalizeRoom(raw: unknown): Room {
  const r = isRecord(raw) ? raw : {};
  return {
    ...(r as unknown as Room),
    members: asArray(r.members),
    settings: normalizeSettings(r.settings),
  };
}

function normalizeDoodle(raw: unknown, roomId: string): DoodleBoard {
  const d = isRecord(raw) ? raw : {};
  return {
    id: typeof d.id === 'string' ? d.id : `doodle_${roomId}`,
    roomId: typeof d.roomId === 'string' ? d.roomId : roomId,
    strokes: asArray<Stroke>(d.strokes),
    notes: Array.isArray(d.notes) ? (d.notes as DoodleBoard['notes']) : [],
  };
}

/**
 * Version 0 → 1: introduce schemaVersion; backfill the collections and nested
 * objects added across early development (messages, availability, doodle notes,
 * inventory cost, event rsvps, settings.currency). All handled by normalisation.
 */
function toV1(raw: AnyRecord): AnyRecord {
  const room = normalizeRoom(raw.room);
  return {
    ...raw,
    room,
    polls: asArray<SchedulePoll>(raw.polls),
    inventory: asArray<InventoryItem>(raw.inventory),
    activities: asArray<Activity>(raw.activities),
    events: asArray<PlannedEvent>(raw.events),
    doodle: normalizeDoodle(raw.doodle, room.id),
    messages: asArray<Message>(raw.messages),
    availability: asArray<MemberAvailability>(raw.availability),
  };
}

/** Ordered migration steps. Index i upgrades from version i to i+1. */
const MIGRATIONS: ((raw: AnyRecord) => AnyRecord)[] = [toV1];

/** Read a state's declared version (legacy/untagged states are version 0). */
export function schemaVersionOf(raw: unknown): number {
  if (isRecord(raw) && typeof raw.schemaVersion === 'number') return raw.schemaVersion;
  return 0;
}

/**
 * Upgrade any (possibly legacy or untrusted) room-state-like value to the
 * current schema. Throws only if the input cannot represent a room at all.
 */
export function migrateRoomState(raw: unknown): RoomState {
  if (!isRecord(raw) || !isRecord(raw.room)) {
    throw new Error('Not a room state');
  }
  let current: AnyRecord = raw;
  for (let v = schemaVersionOf(raw); v < CURRENT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) break;
    current = step(current);
  }
  current.schemaVersion = CURRENT_SCHEMA_VERSION;
  return current as unknown as RoomState;
}

/** True when a value is already at the current schema version. */
export function isCurrentSchema(raw: unknown): boolean {
  return schemaVersionOf(raw) === CURRENT_SCHEMA_VERSION;
}
