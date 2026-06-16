import { describe, expect, it } from 'vitest';
import {
  expectedGoals,
  impliedOutcome,
  outcomeChances,
  scorelineChance,
  timeLeftFraction,
} from '../src/wcOdds.js';

describe('impliedOutcome', () => {
  it('de-vigs the moneyline to probabilities that sum to 1', () => {
    const p = impliedOutcome({ homeML: -200, drawML: 300, awayML: 600 })!;
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 6);
    expect(p.home).toBeGreaterThan(p.away); // favourite
  });
  it('is null when odds are incomplete', () => {
    expect(impliedOutcome({ homeML: -200 })).toBeNull();
    expect(impliedOutcome(null)).toBeNull();
  });
});

describe('expectedGoals', () => {
  it('uses the over/under as the total and tilts to the favourite', () => {
    const m = expectedGoals({ homeML: -250, drawML: 320, awayML: 700, overUnder: 2.5 });
    expect(m.home + m.away).toBeCloseTo(2.5, 6);
    expect(m.home).toBeGreaterThan(m.away);
  });
  it('falls back to an even ~2.6 total with no odds', () => {
    const m = expectedGoals(null);
    expect(m.home).toBeCloseTo(1.3, 6);
    expect(m.away).toBeCloseTo(1.3, 6);
  });
});

describe('scorelineChance', () => {
  const model = { home: 1.4, away: 1.1 };

  it('is a valid probability and peaks near the expected score', () => {
    const p = scorelineChance(model, { home: 1, away: 1 });
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
    // A 1-1 (near the means) beats a lopsided 4-0.
    expect(p).toBeGreaterThan(scorelineChance(model, { home: 4, away: 0 }));
  });

  it('conditions on the live score + time: a 2-0 with 1 minute left is near-certain to end 2-0', () => {
    const live = { minute: 89, home: 2, away: 0 };
    const stay = scorelineChance(model, { home: 2, away: 0 }, live);
    expect(stay).toBeGreaterThan(0.85);
    // Can't finish below the current score.
    expect(scorelineChance(model, { home: 1, away: 0 }, live)).toBe(0);
  });

  it('pre-match (no live) leaves the full match to play', () => {
    expect(timeLeftFraction(null)).toBe(1);
    expect(timeLeftFraction(45)).toBeCloseTo(0.5, 6);
    expect(timeLeftFraction(95)).toBe(0);
  });
});

describe('outcomeChances', () => {
  it('sums to ~1 and favours the stronger side', () => {
    const o = outcomeChances({ home: 1.8, away: 0.9 });
    expect(o.home + o.draw + o.away).toBeCloseTo(1, 4);
    expect(o.home).toBeGreaterThan(o.away);
  });
  it('a late lead makes that win overwhelmingly likely', () => {
    const o = outcomeChances({ home: 1.3, away: 1.3 }, { minute: 88, home: 1, away: 0 });
    expect(o.home).toBeGreaterThan(0.9);
  });
});
