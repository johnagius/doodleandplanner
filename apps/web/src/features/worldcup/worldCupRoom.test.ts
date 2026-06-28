import { describe, expect, it } from 'vitest';
import {
  authorizeWcWrite,
  seedWorldCup,
  setPrediction,
  setResult,
  WC_SEED_VERSION,
  type WorldCupState,
} from '@dap/shared';
import { reseed } from './worldCupRoom.js';

const NOW = () => new Date('2026-06-01T00:00:00Z');

/** A board that predates the current seed: an older version with people who have
 * group predictions, a champion pick, an entered group result — and a stray
 * knockout pick made against the old bracket that the migration should drop. */
function staleBoard(): WorldCupState {
  let s = seedWorldCup(NOW);
  s = { ...s, version: WC_SEED_VERSION - 1 };
  const [john, dan] = s.predictors;
  s = setPrediction(s, { matchId: 'g-A-1', predictorId: john!.id, home: 2, away: 1, now: NOW });
  s = setPrediction(s, { matchId: 'g-B-1', predictorId: dan!.id, home: 0, away: 0, now: NOW });
  s = { ...s, championPicks: { [john!.id]: 'BRA' } };
  s = setResult(s, { matchId: 'g-A-1', home: 3, away: 0 });
  // A knockout pick on the old bracket (inject directly — knockout slots aren't
  // ready to predict through the normal path until groups finish).
  s = {
    ...s,
    predictions: [
      ...s.predictions,
      { predictorId: john!.id, matchId: 'r32-1', home: 1, away: 0, updatedAt: 'x' },
    ],
  };
  return s;
}

describe('reseed (board migration)', () => {
  it('upgrades to the current seed version', () => {
    expect(reseed(staleBoard()).version).toBe(WC_SEED_VERSION);
  });

  it('keeps group picks + results and champion picks, but clears knockout picks', () => {
    const old = staleBoard();
    const next = reseed(old);
    // Group predictions survive untouched; the knockout pick is gone.
    expect(next.predictions.every((p) => p.matchId.startsWith('g-'))).toBe(true);
    expect(next.predictions).toEqual(old.predictions.filter((p) => p.matchId.startsWith('g-')));
    expect(next.predictions.some((p) => p.matchId === 'r32-1')).toBe(false);
    // People, champion picks and the entered group result are preserved.
    expect(next.predictors.map((p) => p.id)).toEqual(old.predictors.map((p) => p.id));
    expect(next.championPicks).toEqual(old.championPicks);
    expect(next.matches.find((m) => m.id === 'g-A-1')?.result).toEqual({ home: 3, away: 0 });
  });

  it('keepKnockoutPicks keeps the knockout picks (the older-Worker fallback)', () => {
    const next = reseed(staleBoard(), { keepKnockoutPicks: true });
    expect(next.predictions.some((p) => p.matchId === 'r32-1')).toBe(true);
  });

  it('the clearing migration is authorised even for a claimed predictor', () => {
    const old = staleBoard();
    const next = reseed(old);
    const johnId = old.predictors[0]!.id; // the claimed predictor whose KO pick we drop
    // The version upgrade may clear a claimed name's knockout picks without a token.
    expect(authorizeWcWrite(old, next, new Set([johnId]), null).ok).toBe(true);
    // But the same change without a version bump stays locked.
    const sameVersion = { ...next, version: old.version };
    expect(authorizeWcWrite(old, sameVersion, new Set([johnId]), null).ok).toBe(false);
  });

  it('adopts the corrected knockout structure from the fresh seed', () => {
    const next = reseed(staleBoard());
    // r32-1 is the first tie of the official bracket: winner Group E vs a best third.
    const r32_1 = next.matches.find((m) => m.id === 'r32-1');
    expect(r32_1?.homeSource).toEqual({ kind: 'winner-group', group: 'E' });
    expect(r32_1?.awaySource?.kind).toBe('best-third');
  });
});
