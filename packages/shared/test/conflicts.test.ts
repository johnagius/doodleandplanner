import { describe, expect, it } from 'vitest';
import { explainConflict, summarizeSlotConflicts } from '../src/conflicts.js';
import type { BusyInterval, TimeOption } from '../src/types.js';

const slot: TimeOption = {
  id: 'o1',
  start: '2026-06-01T10:00:00.000Z',
  end: '2026-06-01T12:00:00.000Z', // 2-hour slot
};

describe('explainConflict', () => {
  it('is clear when nothing overlaps', () => {
    const c = explainConflict(slot, [
      { start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z', title: 'Later' },
    ]);
    expect(c.severity).toBe('clear');
    expect(c.reasons).toHaveLength(0);
    expect(c.busyFraction).toBe(0);
  });

  it('is hard for a substantial busy overlap and names the event', () => {
    const c = explainConflict(slot, [
      { start: '2026-06-01T10:30:00Z', end: '2026-06-01T11:30:00Z', title: 'Dentist' },
    ]);
    expect(c.severity).toBe('hard');
    expect(c.reasons[0]!.title).toBe('Dentist');
    expect(c.reasons[0]!.overlapFraction).toBeCloseTo(0.5, 5); // 1h of 2h
    expect(c.busyFraction).toBeCloseTo(0.5, 5);
  });

  it('downgrades a tiny incidental overlap to soft', () => {
    // 6 minutes of a 120-minute slot = 0.05 < 0.15 threshold
    const c = explainConflict(slot, [
      { start: '2026-06-01T09:00:00Z', end: '2026-06-01T10:06:00Z', title: 'Standup' },
    ]);
    expect(c.severity).toBe('soft');
    expect(c.reasons[0]!.title).toBe('Standup');
  });

  it('treats tentative events as soft regardless of size', () => {
    const c = explainConflict(slot, [
      {
        start: '2026-06-01T10:00:00Z',
        end: '2026-06-01T12:00:00Z',
        title: 'Maybe lunch',
        status: 'tentative',
      },
    ]);
    expect(c.severity).toBe('soft');
    expect(c.reasons[0]!.status).toBe('tentative');
  });

  it('orders multiple reasons by overlap and labels all-day / untitled blocks', () => {
    const busy: BusyInterval[] = [
      { start: '2026-06-01T11:50:00Z', end: '2026-06-01T12:30:00Z' }, // 10 min, untitled
      { start: '2026-06-01T10:00:00Z', end: '2026-06-01T11:00:00Z', title: 'Big meeting' }, // 60 min
      { start: '2026-06-01T00:00:00Z', end: '2026-06-02T00:00:00Z', allDay: true }, // covers all
    ];
    const c = explainConflict(slot, busy);
    expect(c.severity).toBe('hard');
    expect(c.reasons[0]!.overlapFraction).toBeGreaterThanOrEqual(c.reasons[1]!.overlapFraction);
    expect(c.reasons.map((r) => r.title)).toContain('Big meeting');
    expect(c.reasons.map((r) => r.title)).toContain('All-day event');
    expect(c.reasons.find((r) => r.start === '2026-06-01T11:50:00Z')!.title).toBe('Busy');
  });

  it('treats edge-touching intervals as no conflict (half-open)', () => {
    const c = explainConflict(slot, [
      { start: '2026-06-01T12:00:00Z', end: '2026-06-01T13:00:00Z', title: 'After' },
    ]);
    expect(c.severity).toBe('clear');
  });
});

describe('summarizeSlotConflicts', () => {
  it('buckets members into free / soft / hard / unknown', () => {
    const byMember = new Map<string, BusyInterval[]>([
      ['free', []],
      ['hard', [{ start: '2026-06-01T10:00:00Z', end: '2026-06-01T11:30:00Z', title: 'Work' }]],
      [
        'soft',
        [
          {
            start: '2026-06-01T10:00:00Z',
            end: '2026-06-01T12:00:00Z',
            title: 'Tentative',
            status: 'tentative',
          },
        ],
      ],
      // 'mystery' intentionally absent -> unknown
    ]);
    const s = summarizeSlotConflicts(slot, ['free', 'hard', 'soft', 'mystery'], byMember);
    expect(s.free).toEqual(['free']);
    expect(s.hard).toEqual(['hard']);
    expect(s.soft).toEqual(['soft']);
    expect(s.unknown).toEqual(['mystery']);
    expect(s.severity).toBe('hard');
  });

  it('is soft overall when only soft conflicts exist, clear when none', () => {
    const byMember = new Map<string, BusyInterval[]>([
      ['a', []],
      ['b', [{ start: '2026-06-01T10:00:00Z', end: '2026-06-01T12:00:00Z', status: 'tentative' }]],
    ]);
    expect(summarizeSlotConflicts(slot, ['a', 'b'], byMember).severity).toBe('soft');
    expect(summarizeSlotConflicts(slot, ['a'], byMember).severity).toBe('clear');
  });
});
