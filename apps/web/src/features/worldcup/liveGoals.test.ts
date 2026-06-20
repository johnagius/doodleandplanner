import { describe, expect, it } from 'vitest';
import { goalDiff } from './liveGoals.js';

describe('goalDiff', () => {
  it('returns null with no real previous sighting (baseline)', () => {
    expect(goalDiff(undefined, { home: 1, away: 0 })).toBeNull();
    expect(goalDiff({ home: null, away: null }, { home: 1, away: 0 })).toBeNull();
  });

  it('returns null when nothing changed', () => {
    expect(goalDiff({ home: 1, away: 1 }, { home: 1, away: 1 })).toBeNull();
  });

  it('detects a home goal with before/after totals', () => {
    expect(goalDiff({ home: 0, away: 0 }, { home: 1, away: 0 })).toEqual({
      side: 'home',
      total: { home: 1, away: 0 },
      prevTotal: { home: 0, away: 0 },
    });
  });

  it('detects an away goal', () => {
    expect(goalDiff({ home: 2, away: 1 }, { home: 2, away: 2 })).toEqual({
      side: 'away',
      total: { home: 2, away: 2 },
      prevTotal: { home: 2, away: 1 },
    });
  });

  it('ignores downward corrections', () => {
    expect(goalDiff({ home: 2, away: 0 }, { home: 1, away: 0 })).toBeNull();
  });

  it('reports the home side when both jump in one tick', () => {
    expect(goalDiff({ home: 0, away: 0 }, { home: 1, away: 1 })?.side).toBe('home');
  });

  it('returns null when the current score is incomplete', () => {
    expect(goalDiff({ home: 0, away: 0 }, { home: null, away: 1 })).toBeNull();
  });
});
