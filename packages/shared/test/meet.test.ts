import { describe, expect, it } from 'vitest';
import { createMeetPoint, directionsUrl, sortMeetPoints, updateMeetPoint } from '../src/meet.js';
import type { MeetPoint } from '../src/types.js';

const now = () => new Date('2026-05-30T12:00:00Z');
const base = { roomId: 'r1', createdBy: 'alice', now };

describe('meet points', () => {
  it('creates a point, trimming the label and normalising coordinates', () => {
    const p = createMeetPoint({ ...base, label: '  The Pier  ', lat: 95, lng: 200 });
    expect(p.label).toBe('The Pier');
    expect(p.lat).toBe(90); // clamped
    expect(p.lng).toBe(-160); // wrapped (200 → -160)
    expect(p.id).toMatch(/^meet/);
  });

  it('rejects an empty label or bad coordinates', () => {
    expect(() => createMeetPoint({ ...base, label: '  ', lat: 1, lng: 2 })).toThrow(/place name/);
    expect(() => createMeetPoint({ ...base, label: 'X', lat: NaN, lng: 2 })).toThrow(/coordinates/);
  });

  it('updates fields immutably', () => {
    const p = createMeetPoint({ ...base, label: 'A', lat: 10, lng: 20 });
    const u = updateMeetPoint(p, { label: 'B', time: '2026-06-01T18:00:00Z', note: ' meet here ' });
    expect(u).not.toBe(p);
    expect(p.label).toBe('A'); // original untouched
    expect(u.label).toBe('B');
    expect(u.time).toBe('2026-06-01T18:00:00Z');
    expect(u.note).toBe('meet here');
  });

  it('sorts timed points chronologically, untimed last', () => {
    const a = createMeetPoint({
      ...base,
      label: 'late',
      lat: 0,
      lng: 0,
      time: '2026-06-02T10:00:00Z',
    });
    const b = createMeetPoint({
      ...base,
      label: 'early',
      lat: 0,
      lng: 0,
      time: '2026-06-01T10:00:00Z',
    });
    const c = createMeetPoint({ ...base, label: 'whenever', lat: 0, lng: 0 });
    const sorted = sortMeetPoints([a, c, b] as MeetPoint[]).map((p) => p.label);
    expect(sorted).toEqual(['early', 'late', 'whenever']);
  });

  it('builds an openable directions URL', () => {
    const p = createMeetPoint({ ...base, label: 'X', lat: 35.9, lng: 14.5 });
    expect(directionsUrl(p)).toBe('https://www.openstreetmap.org/directions?to=35.9%2C14.5');
  });
});
