/**
 * Conflict engine — the "smart" layer over raw free/busy.
 *
 * Given a candidate time slot and a member's busy intervals (typically from
 * Google Calendar), it explains *why* a slot is blocked, how hard, and by which
 * event(s). Soft (tentative) conflicts and tiny edge overlaps are distinguished
 * from hard, substantial clashes so the UI can nudge rather than veto.
 */
import { intervalsOverlap, toMs } from './time.js';
import type { BusyInterval, ISODateTime, TimeOption } from './types.js';

export type ConflictSeverity = 'clear' | 'soft' | 'hard';

export interface ConflictReason {
  title: string;
  start: ISODateTime;
  end: ISODateTime;
  status: 'busy' | 'tentative';
  /** Fraction of the slot (0..1) that this event covers. */
  overlapFraction: number;
}

export interface SlotConflict {
  severity: ConflictSeverity;
  /** Events overlapping the slot, worst (largest overlap) first. */
  reasons: ConflictReason[];
  /** Fraction of the slot covered by any hard busy block (0..1). */
  busyFraction: number;
}

export interface ConflictOptions {
  /**
   * Overlaps shorter than this fraction of the slot are treated as incidental
   * (e.g. a meeting ending 5 min into a 2-hour window) and downgraded to soft.
   */
  softThreshold?: number;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

function overlapMs(
  aStart: ISODateTime,
  aEnd: ISODateTime,
  bStart: ISODateTime,
  bEnd: ISODateTime,
): number {
  return Math.max(0, Math.min(toMs(aEnd), toMs(bEnd)) - Math.max(toMs(aStart), toMs(bStart)));
}

/**
 * Explain how a single member's calendar conflicts with a slot.
 *
 * - tentative events → soft.
 * - hard events covering less than `softThreshold` of the slot → soft.
 * - otherwise → hard.
 */
export function explainConflict(
  slot: TimeOption,
  busy: BusyInterval[],
  options: ConflictOptions = {},
): SlotConflict {
  const softThreshold = options.softThreshold ?? 0.15;
  const slotMs = Math.max(1, toMs(slot.end) - toMs(slot.start));

  const reasons: ConflictReason[] = [];
  let hardBusyMs = 0;
  for (const b of busy) {
    if (!intervalsOverlap(slot.start, slot.end, b.start, b.end)) continue;
    const ov = overlapMs(slot.start, slot.end, b.start, b.end);
    const fraction = clamp01(ov / slotMs);
    const status = b.status ?? 'busy';
    reasons.push({
      title: b.title?.trim() || (b.allDay ? 'All-day event' : 'Busy'),
      start: b.start,
      end: b.end,
      status,
      overlapFraction: fraction,
    });
    if (status === 'busy') hardBusyMs += ov;
  }

  reasons.sort((a, b) => b.overlapFraction - a.overlapFraction);
  const busyFraction = clamp01(hardBusyMs / slotMs);

  let severity: ConflictSeverity = 'clear';
  if (reasons.length > 0) {
    const hasSubstantialHard = reasons.some(
      (r) => r.status === 'busy' && r.overlapFraction >= softThreshold,
    );
    severity = hasSubstantialHard ? 'hard' : 'soft';
  }
  return { severity, reasons, busyFraction };
}

export interface MemberConflict {
  memberId: string;
  conflict: SlotConflict;
}

export interface SlotConflictSummary {
  /** Members with no overlap at all. */
  free: string[];
  /** Members with only soft (tentative / incidental) conflicts. */
  soft: string[];
  /** Members with a hard clash. */
  hard: string[];
  /** Members whose availability is unknown (no calendar shared). */
  unknown: string[];
  perMember: MemberConflict[];
  /** Overall: 'clear' if nobody hard-conflicts, else 'hard'; 'soft' in between. */
  severity: ConflictSeverity;
}

/** Summarise conflicts for a slot across members who have shared availability. */
export function summarizeSlotConflicts(
  slot: TimeOption,
  memberIds: string[],
  availabilityByMember: Map<string, BusyInterval[]>,
  options: ConflictOptions = {},
): SlotConflictSummary {
  const free: string[] = [];
  const soft: string[] = [];
  const hard: string[] = [];
  const unknown: string[] = [];
  const perMember: MemberConflict[] = [];

  for (const id of memberIds) {
    const busy = availabilityByMember.get(id);
    if (!busy) {
      unknown.push(id);
      continue;
    }
    const conflict = explainConflict(slot, busy, options);
    perMember.push({ memberId: id, conflict });
    if (conflict.severity === 'clear') free.push(id);
    else if (conflict.severity === 'soft') soft.push(id);
    else hard.push(id);
  }

  const severity: ConflictSeverity = hard.length > 0 ? 'hard' : soft.length > 0 ? 'soft' : 'clear';
  return { free, soft, hard, unknown, perMember, severity };
}
