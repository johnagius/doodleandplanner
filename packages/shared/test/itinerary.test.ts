import { describe, expect, it } from 'vitest';
import { createActivity } from '../src/activities.js';
import {
  itineraryEnd,
  itineraryMinutes,
  orderForItinerary,
  planItinerary,
} from '../src/itinerary.js';
import type { Activity } from '../src/types.js';

function activity(title: string, patch: Partial<Activity> = {}): Activity {
  return { ...createActivity({ roomId: 'r', title, proposedBy: 'm1' }), ...patch };
}

describe('planItinerary', () => {
  it('lays loose activities back-to-back from the start', () => {
    const acts = [
      activity('Breakfast', { durationMinutes: 60, createdAt: '2026-01-01T00:00:00Z' }),
      activity('Hike', { durationMinutes: 120, createdAt: '2026-01-01T00:00:01Z' }),
    ];
    const plan = planItinerary(acts, '2026-06-01T09:00:00.000Z');
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({
      title: 'Breakfast',
      start: '2026-06-01T09:00:00.000Z',
      end: '2026-06-01T10:00:00.000Z',
    });
    expect(plan[1]).toMatchObject({
      title: 'Hike',
      start: '2026-06-01T10:00:00.000Z',
      end: '2026-06-01T12:00:00.000Z',
    });
  });

  it('inserts a gap between activities', () => {
    const acts = [
      activity('A', { durationMinutes: 30, createdAt: '2026-01-01T00:00:00Z' }),
      activity('B', { durationMinutes: 30, createdAt: '2026-01-01T00:00:01Z' }),
    ];
    const plan = planItinerary(acts, '2026-06-01T09:00:00.000Z', { gapMinutes: 15 });
    expect(plan[1]!.start).toBe('2026-06-01T09:45:00.000Z');
  });

  it('uses the default duration when none is set', () => {
    const plan = planItinerary([activity('Mystery')], '2026-06-01T09:00:00.000Z', {
      defaultDurationMinutes: 45,
    });
    expect(plan[0]!.durationMinutes).toBe(45);
    expect(plan[0]!.end).toBe('2026-06-01T09:45:00.000Z');
  });

  it('treats scheduledAt as a fixed anchor that can push the cursor forward', () => {
    const acts = [
      activity('Lunch', {
        durationMinutes: 60,
        scheduledAt: '2026-06-01T12:00:00.000Z',
        createdAt: '2026-01-01T00:00:00Z',
      }),
      activity('Walk', { durationMinutes: 30, createdAt: '2026-01-01T00:00:01Z' }),
    ];
    const plan = planItinerary(acts, '2026-06-01T09:00:00.000Z');
    // Pinned lunch is first (12:00), then the loose walk flows after it.
    expect(plan[0]).toMatchObject({ title: 'Lunch', start: '2026-06-01T12:00:00.000Z' });
    expect(plan[1]).toMatchObject({ title: 'Walk', start: '2026-06-01T13:00:00.000Z' });
  });
});

describe('orderForItinerary', () => {
  it('puts scheduled activities first (by time), then loose ones by creation', () => {
    const acts = [
      activity('Loose2', { createdAt: '2026-01-02T00:00:00Z' }),
      activity('Pinned late', { scheduledAt: '2026-06-01T15:00:00Z' }),
      activity('Loose1', { createdAt: '2026-01-01T00:00:00Z' }),
      activity('Pinned early', { scheduledAt: '2026-06-01T10:00:00Z' }),
    ];
    expect(orderForItinerary(acts).map((a) => a.title)).toEqual([
      'Pinned early',
      'Pinned late',
      'Loose1',
      'Loose2',
    ]);
  });
});

describe('helpers', () => {
  it('sums minutes and finds the end', () => {
    const acts = [
      activity('A', { durationMinutes: 30, createdAt: '2026-01-01T00:00:00Z' }),
      activity('B', { durationMinutes: 90, createdAt: '2026-01-01T00:00:01Z' }),
    ];
    const plan = planItinerary(acts, '2026-06-01T09:00:00.000Z');
    expect(itineraryMinutes(plan)).toBe(120);
    expect(itineraryEnd(plan)).toBe('2026-06-01T11:00:00.000Z');
    expect(itineraryEnd([])).toBeNull();
  });
});
