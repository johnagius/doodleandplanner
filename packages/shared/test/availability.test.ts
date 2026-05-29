import { describe, expect, it } from 'vitest';
import {
  evaluateSlot,
  generateCandidateSlots,
  isFreeDuring,
  suggestSlots,
} from '../src/availability.js';
import type { MemberBusy } from '../src/availability.js';

describe('generateCandidateSlots', () => {
  it('generates evenly spaced slots inside the window', () => {
    const slots = generateCandidateSlots({
      windowStart: '2026-06-01T09:00:00Z',
      windowEnd: '2026-06-01T12:00:00Z',
      durationMinutes: 60,
    });
    expect(slots).toHaveLength(3);
    expect(slots[0]).toMatchObject({
      start: '2026-06-01T09:00:00.000Z',
      end: '2026-06-01T10:00:00.000Z',
    });
    expect(slots[2]!.end).toBe('2026-06-01T12:00:00.000Z');
  });

  it('respects a custom step', () => {
    const slots = generateCandidateSlots({
      windowStart: '2026-06-01T09:00:00Z',
      windowEnd: '2026-06-01T11:00:00Z',
      durationMinutes: 60,
      stepMinutes: 30,
    });
    expect(slots.map((s) => s.start)).toEqual([
      '2026-06-01T09:00:00.000Z',
      '2026-06-01T09:30:00.000Z',
      '2026-06-01T10:00:00.000Z',
    ]);
  });

  it('filters by working hours (UTC) so slots stay within the day window', () => {
    const slots = generateCandidateSlots({
      windowStart: '2026-06-01T06:00:00Z',
      windowEnd: '2026-06-02T06:00:00Z',
      durationMinutes: 120,
      stepMinutes: 120,
      workingHours: { startHour: 9, endHour: 17 },
    });
    // Every slot must start at or after 09:00 and end by 17:00 UTC.
    for (const s of slots) {
      const startHour = new Date(s.start).getUTCHours();
      expect(startHour).toBeGreaterThanOrEqual(9);
      expect(new Date(s.end).getUTCHours()).toBeLessThanOrEqual(17);
    }
    expect(slots.length).toBeGreaterThan(0);
  });

  it('validates inputs', () => {
    expect(() =>
      generateCandidateSlots({
        windowStart: '2026-06-01T09:00:00Z',
        windowEnd: '2026-06-01T12:00:00Z',
        durationMinutes: 0,
      }),
    ).toThrow();
  });
});

describe('isFreeDuring / evaluateSlot', () => {
  const slot = {
    id: 'o1',
    start: '2026-06-01T10:00:00Z',
    end: '2026-06-01T11:00:00Z',
  };

  it('detects free vs busy', () => {
    expect(isFreeDuring(slot, [])).toBe(true);
    expect(
      isFreeDuring(slot, [{ start: '2026-06-01T10:30:00Z', end: '2026-06-01T10:45:00Z' }]),
    ).toBe(false);
    // touching the edge is not a conflict (half-open)
    expect(
      isFreeDuring(slot, [{ start: '2026-06-01T11:00:00Z', end: '2026-06-01T12:00:00Z' }]),
    ).toBe(true);
  });

  it('splits members into free and busy', () => {
    const members: MemberBusy[] = [
      { memberId: 'a', busy: [] },
      { memberId: 'b', busy: [{ start: '2026-06-01T10:15:00Z', end: '2026-06-01T10:30:00Z' }] },
    ];
    const result = evaluateSlot(slot, members);
    expect(result.freeMembers).toEqual(['a']);
    expect(result.busyMembers).toEqual(['b']);
    expect(result.freeCount).toBe(1);
  });
});

describe('suggestSlots', () => {
  const members: MemberBusy[] = [
    { memberId: 'a', busy: [{ start: '2026-06-01T09:00:00Z', end: '2026-06-01T10:00:00Z' }] },
    { memberId: 'b', busy: [{ start: '2026-06-01T11:00:00Z', end: '2026-06-01T12:00:00Z' }] },
    { memberId: 'c', busy: [] },
  ];

  it('returns slots ranked by number of free members', () => {
    const suggestions = suggestSlots({
      windowStart: '2026-06-01T09:00:00Z',
      windowEnd: '2026-06-01T12:00:00Z',
      durationMinutes: 60,
      members,
      limit: 3,
    });
    // 10:00-11:00 is free for everyone.
    expect(suggestions[0]!.option.start).toBe('2026-06-01T10:00:00.000Z');
    expect(suggestions[0]!.freeCount).toBe(3);
  });

  it('honours minFree and limit', () => {
    const suggestions = suggestSlots({
      windowStart: '2026-06-01T09:00:00Z',
      windowEnd: '2026-06-01T12:00:00Z',
      durationMinutes: 60,
      members,
      minFree: 3,
      limit: 1,
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.freeCount).toBe(3);
  });
});
