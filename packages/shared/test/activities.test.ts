import { describe, expect, it } from 'vitest';
import {
  createActivity,
  rankActivities,
  scheduleActivity,
  toggleInterest,
  updateActivity,
} from '../src/activities.js';

describe('createActivity', () => {
  it('creates an activity with no interest yet', () => {
    const act = createActivity({ roomId: 'r', title: '  Hike  ', proposedBy: 'm1' });
    expect(act.title).toBe('Hike');
    expect(act.interested).toEqual([]);
    expect(act.proposedBy).toBe('m1');
  });

  it('validates the title', () => {
    expect(() => createActivity({ roomId: 'r', title: ' ', proposedBy: 'm1' })).toThrow(/title/);
  });
});

describe('toggleInterest', () => {
  it('adds then removes interest', () => {
    let act = createActivity({ roomId: 'r', title: 'Hike', proposedBy: 'm1' });
    act = toggleInterest(act, 'm2');
    expect(act.interested).toEqual(['m2']);
    act = toggleInterest(act, 'm2');
    expect(act.interested).toEqual([]);
  });
});

describe('scheduleActivity & updateActivity', () => {
  it('sets and clears a scheduled time', () => {
    let act = createActivity({ roomId: 'r', title: 'Hike', proposedBy: 'm1' });
    act = scheduleActivity(act, '2026-06-01T10:00:00Z');
    expect(act.scheduledAt).toBe('2026-06-01T10:00:00Z');
    act = scheduleActivity(act, undefined);
    expect(act.scheduledAt).toBeUndefined();
  });

  it('updates fields with validation', () => {
    const act = createActivity({ roomId: 'r', title: 'Hike', proposedBy: 'm1' });
    const updated = updateActivity(act, { title: 'Trail run', durationMinutes: 90 });
    expect(updated.title).toBe('Trail run');
    expect(updated.durationMinutes).toBe(90);
    expect(() => updateActivity(act, { title: ' ' })).toThrow(/title/);
  });
});

describe('rankActivities', () => {
  it('ranks by interest count then creation order', () => {
    const a = {
      ...createActivity({ roomId: 'r', title: 'A', proposedBy: 'm1' }),
      createdAt: '2026-01-01T00:00:00Z',
      interested: ['x'],
    };
    const b = {
      ...createActivity({ roomId: 'r', title: 'B', proposedBy: 'm1' }),
      createdAt: '2026-01-02T00:00:00Z',
      interested: ['x', 'y', 'z'],
    };
    const c = {
      ...createActivity({ roomId: 'r', title: 'C', proposedBy: 'm1' }),
      createdAt: '2026-01-03T00:00:00Z',
      interested: ['x'],
    };
    const ranked = rankActivities([a, b, c]);
    expect(ranked.map((r) => r.title)).toEqual(['B', 'A', 'C']);
  });
});
