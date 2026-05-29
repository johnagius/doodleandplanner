/**
 * Itinerary planning: lay a list of activities out into a timed running order
 * ("what we'll do, and when"). Activities with an explicit `scheduledAt` act as
 * fixed anchors; the rest flow sequentially from the start time.
 */
import { addMinutes, toMs } from './time.js';
import type { Activity, ISODateTime } from './types.js';

export interface ItinerarySegment {
  activityId: string;
  title: string;
  start: ISODateTime;
  end: ISODateTime;
  durationMinutes: number;
}

export interface ItineraryOptions {
  /** Buffer in minutes inserted between consecutive activities. Default 0. */
  gapMinutes?: number;
  /** Duration used for activities that don't specify one. Default 60. */
  defaultDurationMinutes?: number;
}

/**
 * Order activities for an itinerary: pinned (scheduled) ones first, by time,
 * then the rest in creation order.
 */
export function orderForItinerary(activities: Activity[]): Activity[] {
  const pinned = activities
    .filter((a) => a.scheduledAt)
    .sort((a, b) => toMs(a.scheduledAt!) - toMs(b.scheduledAt!));
  const loose = activities
    .filter((a) => !a.scheduledAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [...pinned, ...loose];
}

/**
 * Build a sequential plan starting at `startISO`. An activity's `scheduledAt`,
 * when later than the running cursor, pushes its start forward (a fixed anchor);
 * everything else is packed back-to-back with an optional gap.
 */
export function planItinerary(
  activities: Activity[],
  startISO: ISODateTime,
  options: ItineraryOptions = {},
): ItinerarySegment[] {
  const gap = options.gapMinutes ?? 0;
  const defaultDuration = options.defaultDurationMinutes ?? 60;

  const segments: ItinerarySegment[] = [];
  let cursor = startISO;

  for (const activity of orderForItinerary(activities)) {
    if (activity.scheduledAt && toMs(activity.scheduledAt) > toMs(cursor)) {
      cursor = activity.scheduledAt;
    }
    const duration = activity.durationMinutes ?? defaultDuration;
    const end = addMinutes(cursor, duration);
    segments.push({
      activityId: activity.id,
      title: activity.title,
      start: cursor,
      end,
      durationMinutes: duration,
    });
    cursor = addMinutes(end, gap);
  }
  return segments;
}

/** Total scheduled minutes across all segments (excludes gaps). */
export function itineraryMinutes(segments: ItinerarySegment[]): number {
  return segments.reduce((sum, s) => sum + s.durationMinutes, 0);
}

/** When the last activity finishes, or null for an empty plan. */
export function itineraryEnd(segments: ItinerarySegment[]): ISODateTime | null {
  return segments.length === 0 ? null : segments[segments.length - 1]!.end;
}
