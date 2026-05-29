/**
 * Time / interval helpers. All functions work on ISO-8601 strings and treat
 * intervals as half-open `[start, end)` so adjacent intervals don't "overlap".
 */
import type { BusyInterval, ISODateTime } from './types.js';

export function toMs(iso: ISODateTime): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Invalid ISO date-time: ${iso}`);
  return ms;
}

export function toISO(ms: number): ISODateTime {
  return new Date(ms).toISOString();
}

export function addMinutes(iso: ISODateTime, minutes: number): ISODateTime {
  return toISO(toMs(iso) + minutes * 60_000);
}

export function durationMinutes(start: ISODateTime, end: ISODateTime): number {
  return (toMs(end) - toMs(start)) / 60_000;
}

/** Half-open overlap test: do `[aStart,aEnd)` and `[bStart,bEnd)` intersect? */
export function intervalsOverlap(
  aStart: ISODateTime,
  aEnd: ISODateTime,
  bStart: ISODateTime,
  bEnd: ISODateTime,
): boolean {
  return toMs(aStart) < toMs(bEnd) && toMs(bStart) < toMs(aEnd);
}

/** Merge overlapping/adjacent busy intervals into a minimal sorted set. */
export function mergeBusyIntervals(intervals: BusyInterval[]): BusyInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals]
    .map((i) => ({ start: toMs(i.start), end: toMs(i.end) }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const cur of sorted) {
    const last = merged[merged.length - 1];
    if (last && cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged.map((i) => ({ start: toISO(i.start), end: toISO(i.end) }));
}

/** Subtract busy intervals from a window, returning the free gaps. */
export function freeGaps(
  windowStart: ISODateTime,
  windowEnd: ISODateTime,
  busy: BusyInterval[],
): BusyInterval[] {
  const start = toMs(windowStart);
  const end = toMs(windowEnd);
  if (end <= start) return [];

  const merged = mergeBusyIntervals(busy)
    .map((b) => ({ start: toMs(b.start), end: toMs(b.end) }))
    .filter((b) => b.end > start && b.start < end);

  const gaps: BusyInterval[] = [];
  let cursor = start;
  for (const b of merged) {
    if (b.start > cursor) {
      gaps.push({ start: toISO(cursor), end: toISO(Math.min(b.start, end)) });
    }
    cursor = Math.max(cursor, b.end);
    if (cursor >= end) break;
  }
  if (cursor < end) gaps.push({ start: toISO(cursor), end: toISO(end) });
  return gaps;
}

/** Format a slot for display, e.g. "Mon 2 Jun, 14:00–15:30". */
export function formatSlot(start: ISODateTime, end: ISODateTime, locale = 'en-GB'): string {
  const s = new Date(toMs(start));
  const e = new Date(toMs(end));
  const day = s.toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const time = (d: Date) =>
    d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day}, ${time(s)}–${time(e)}`;
}
