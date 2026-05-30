/**
 * Map meet-up points: shared, pinned locations (with optional time + note) that
 * everyone in the room can see and navigate to. Pure, immutable helpers — the
 * points ride along in {@link RoomState} and sync like everything else.
 *
 * Live, opt-in member locations are deliberately NOT modelled here: they are
 * ephemeral and travel over the presence channel, never persisted.
 */
import { generateId } from './ids.js';
import type { ISODateTime, MeetPoint } from './types.js';

export interface CreateMeetPointInput {
  roomId: string;
  label: string;
  lat: number;
  lng: number;
  note?: string;
  /** Optional meet-up time. */
  time?: ISODateTime;
  createdBy: string;
  now?: () => Date;
}

const MAX_LABEL = 80;

function clampLat(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}
/** Normalise longitude into the -180..180 range. */
function wrapLng(lng: number): number {
  let x = ((lng + 180) % 360) - 180;
  if (x < -180) x += 360;
  return x;
}

export function createMeetPoint(input: CreateMeetPointInput): MeetPoint {
  const label = input.label.trim();
  if (!label) throw new Error('A place name is required');
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    throw new Error('Invalid coordinates');
  }
  const now = (input.now ?? (() => new Date()))().toISOString();
  return {
    id: generateId('meet'),
    roomId: input.roomId,
    label: label.slice(0, MAX_LABEL),
    lat: clampLat(input.lat),
    lng: wrapLng(input.lng),
    note: input.note?.trim() || undefined,
    time: input.time,
    createdBy: input.createdBy,
    createdAt: now,
  };
}

export function updateMeetPoint(
  point: MeetPoint,
  patch: Partial<Pick<MeetPoint, 'label' | 'note' | 'time' | 'lat' | 'lng'>>,
): MeetPoint {
  const next: MeetPoint = { ...point };
  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (!label) throw new Error('A place name is required');
    next.label = label.slice(0, MAX_LABEL);
  }
  if (patch.note !== undefined) next.note = patch.note.trim() || undefined;
  if (patch.time !== undefined) next.time = patch.time || undefined;
  if (patch.lat !== undefined) next.lat = clampLat(patch.lat);
  if (patch.lng !== undefined) next.lng = wrapLng(patch.lng);
  return next;
}

/** Chronological by meet time (timed first, untimed last), then creation. */
export function sortMeetPoints(points: MeetPoint[]): MeetPoint[] {
  return [...points].sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/** A directions URL anyone's device can open (OpenStreetMap, no API key). */
export function directionsUrl(point: Pick<MeetPoint, 'lat' | 'lng'>): string {
  return `https://www.openstreetmap.org/directions?to=${point.lat}%2C${point.lng}`;
}

/** A geo: URI that opens the device's default maps app at the point. */
export function geoUrl(point: Pick<MeetPoint, 'lat' | 'lng' | 'label'>): string {
  return `geo:${point.lat},${point.lng}?q=${encodeURIComponent(point.label)}`;
}
