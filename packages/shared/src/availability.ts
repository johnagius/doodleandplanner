/**
 * Availability engine. Given each member's busy intervals (e.g. from Google
 * Calendar free/busy), generate candidate slots and rank them by how many
 * members are free — powering "smart" poll suggestions.
 */
import { generateId } from './ids.js';
import { addMinutes, intervalsOverlap, mergeBusyIntervals, toISO, toMs } from './time.js';
import type { BusyInterval, ISODateTime, TimeOption } from './types.js';

export interface MemberBusy {
  memberId: string;
  busy: BusyInterval[];
}

export interface SlotSuggestion {
  option: TimeOption;
  freeMembers: string[];
  busyMembers: string[];
  freeCount: number;
}

export interface GenerateSlotsOptions {
  windowStart: ISODateTime;
  windowEnd: ISODateTime;
  durationMinutes: number;
  /** Spacing between candidate starts; defaults to the slot duration. */
  stepMinutes?: number;
  /** Only keep slots fully inside these hours. */
  workingHours?: { startHour: number; endHour: number };
  /** How to read the hour of a date; defaults to UTC for deterministic output. */
  hourOf?: (date: Date) => number;
  /** Cap on number of generated slots (safety against huge windows). */
  maxSlots?: number;
}

/** Produce evenly spaced candidate slots within a window and working hours. */
export function generateCandidateSlots(options: GenerateSlotsOptions): TimeOption[] {
  const {
    windowStart,
    windowEnd,
    durationMinutes,
    stepMinutes = durationMinutes,
    workingHours,
    hourOf = (d) => d.getUTCHours(),
    maxSlots = 500,
  } = options;

  if (durationMinutes <= 0) throw new Error('durationMinutes must be positive');
  if (stepMinutes <= 0) throw new Error('stepMinutes must be positive');

  const end = toMs(windowEnd);
  const slots: TimeOption[] = [];
  // Normalise the cursor so every generated slot uses a consistent ISO format.
  let cursor = toISO(toMs(windowStart));

  while (toMs(cursor) + durationMinutes * 60_000 <= end && slots.length < maxSlots) {
    const slotStart = cursor;
    const slotEnd = addMinutes(cursor, durationMinutes);
    const inHours =
      !workingHours ||
      (hourOf(new Date(toMs(slotStart))) >= workingHours.startHour &&
        // the slot must finish by endHour; check the last minute it occupies
        hourOf(new Date(toMs(slotEnd) - 1)) < workingHours.endHour &&
        hourOf(new Date(toMs(slotEnd) - 1)) >= workingHours.startHour);

    if (inHours) {
      slots.push({ id: generateId('opt'), start: slotStart, end: slotEnd });
    }
    cursor = addMinutes(cursor, stepMinutes);
  }
  return slots;
}

/** Is a member free for the whole slot? */
export function isFreeDuring(slot: TimeOption, busy: BusyInterval[]): boolean {
  return !mergeBusyIntervals(busy).some((b) =>
    intervalsOverlap(slot.start, slot.end, b.start, b.end),
  );
}

/** Annotate a slot with which members are free vs busy. */
export function evaluateSlot(slot: TimeOption, members: MemberBusy[]): SlotSuggestion {
  const freeMembers: string[] = [];
  const busyMembers: string[] = [];
  for (const m of members) {
    if (isFreeDuring(slot, m.busy)) freeMembers.push(m.memberId);
    else busyMembers.push(m.memberId);
  }
  return { option: slot, freeMembers, busyMembers, freeCount: freeMembers.length };
}

export interface SuggestSlotsOptions extends GenerateSlotsOptions {
  members: MemberBusy[];
  /** Return at most this many suggestions (best first). Default 5. */
  limit?: number;
  /** Drop slots where fewer than this many members are free. Default 1. */
  minFree?: number;
}

/**
 * Suggest the best meeting slots: generate candidates, score each by free
 * members, and return the top `limit` (ties broken by earliest start).
 */
export function suggestSlots(options: SuggestSlotsOptions): SlotSuggestion[] {
  const { members, limit = 5, minFree = 1, ...genOptions } = options;
  const candidates = generateCandidateSlots(genOptions);
  return candidates
    .map((slot) => evaluateSlot(slot, members))
    .filter((s) => s.freeCount >= minFree)
    .sort((a, b) => {
      if (b.freeCount !== a.freeCount) return b.freeCount - a.freeCount;
      return toMs(a.option.start) - toMs(b.option.start);
    })
    .slice(0, limit);
}
