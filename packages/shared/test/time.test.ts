import { describe, expect, it } from 'vitest';
import {
  addMinutes,
  durationMinutes,
  formatSlot,
  freeGaps,
  intervalsOverlap,
  mergeBusyIntervals,
  toMs,
} from '../src/time.js';

describe('basic conversions', () => {
  it('adds minutes', () => {
    expect(addMinutes('2026-06-01T10:00:00.000Z', 90)).toBe('2026-06-01T11:30:00.000Z');
  });
  it('computes duration', () => {
    expect(durationMinutes('2026-06-01T10:00:00Z', '2026-06-01T11:30:00Z')).toBe(90);
  });
  it('throws on invalid input', () => {
    expect(() => toMs('not-a-date')).toThrow();
  });
});

describe('intervalsOverlap (half-open)', () => {
  const a = ['2026-06-01T10:00:00Z', '2026-06-01T11:00:00Z'] as const;
  it('detects overlap', () => {
    expect(intervalsOverlap(...a, '2026-06-01T10:30:00Z', '2026-06-01T11:30:00Z')).toBe(true);
  });
  it('treats touching intervals as non-overlapping', () => {
    expect(intervalsOverlap(...a, '2026-06-01T11:00:00Z', '2026-06-01T12:00:00Z')).toBe(false);
  });
});

describe('mergeBusyIntervals', () => {
  it('merges overlapping and adjacent intervals', () => {
    const merged = mergeBusyIntervals([
      { start: '2026-06-01T09:00:00Z', end: '2026-06-01T10:00:00Z' },
      { start: '2026-06-01T09:30:00Z', end: '2026-06-01T11:00:00Z' },
      { start: '2026-06-01T11:00:00Z', end: '2026-06-01T12:00:00Z' },
    ]);
    expect(merged).toEqual([{ start: '2026-06-01T09:00:00.000Z', end: '2026-06-01T12:00:00.000Z' }]);
  });

  it('drops zero/negative-length intervals and keeps disjoint ones', () => {
    const merged = mergeBusyIntervals([
      { start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:00:00Z' },
      { start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z' },
      { start: '2026-06-01T09:00:00Z', end: '2026-06-01T10:00:00Z' },
    ]);
    expect(merged).toHaveLength(2);
  });

  it('returns empty for empty input', () => {
    expect(mergeBusyIntervals([])).toEqual([]);
  });
});

describe('freeGaps', () => {
  it('returns the whole window when nothing is busy', () => {
    const gaps = freeGaps('2026-06-01T09:00:00Z', '2026-06-01T17:00:00Z', []);
    expect(gaps).toEqual([
      { start: '2026-06-01T09:00:00.000Z', end: '2026-06-01T17:00:00.000Z' },
    ]);
  });

  it('subtracts busy intervals to leave the gaps', () => {
    const gaps = freeGaps('2026-06-01T09:00:00Z', '2026-06-01T17:00:00Z', [
      { start: '2026-06-01T10:00:00Z', end: '2026-06-01T11:00:00Z' },
      { start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z' },
    ]);
    expect(gaps).toEqual([
      { start: '2026-06-01T09:00:00.000Z', end: '2026-06-01T10:00:00.000Z' },
      { start: '2026-06-01T11:00:00.000Z', end: '2026-06-01T13:00:00.000Z' },
      { start: '2026-06-01T14:00:00.000Z', end: '2026-06-01T17:00:00.000Z' },
    ]);
  });

  it('handles busy intervals spilling past the window edges', () => {
    const gaps = freeGaps('2026-06-01T09:00:00Z', '2026-06-01T17:00:00Z', [
      { start: '2026-06-01T08:00:00Z', end: '2026-06-01T10:00:00Z' },
      { start: '2026-06-01T16:00:00Z', end: '2026-06-01T18:00:00Z' },
    ]);
    expect(gaps).toEqual([
      { start: '2026-06-01T10:00:00.000Z', end: '2026-06-01T16:00:00.000Z' },
    ]);
  });

  it('returns nothing when fully busy', () => {
    const gaps = freeGaps('2026-06-01T09:00:00Z', '2026-06-01T17:00:00Z', [
      { start: '2026-06-01T08:00:00Z', end: '2026-06-01T18:00:00Z' },
    ]);
    expect(gaps).toEqual([]);
  });
});

describe('formatSlot', () => {
  it('formats a slot in 24h time', () => {
    const text = formatSlot('2026-06-01T14:00:00Z', '2026-06-01T15:30:00Z', 'en-GB');
    expect(text).toContain('14:00');
    expect(text).toContain('15:30');
  });
});
