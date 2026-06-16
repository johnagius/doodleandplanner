import { describe, expect, it } from 'vitest';
import {
  authorizeWcWrite,
  changedPredictorIds,
  createSessionToken,
  isValidEmail,
  normalizeEmail,
  randomOtp,
  readSessionToken,
  sha256Hex,
  stampClaimed,
} from '../src/wcAuth.js';
import type { WorldCupState } from '../src/worldcup.js';

function state(over: Partial<WorldCupState> = {}): WorldCupState {
  return {
    season: '2026',
    title: 'T',
    teams: [],
    matches: [],
    predictors: [
      { id: 'john', name: 'John' },
      { id: 'dan', name: 'Daniel' },
    ],
    predictions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const pick = (predictorId: string, matchId: string, home: number, away: number) => ({
  predictorId,
  matchId,
  home,
  away,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('email helpers', () => {
  it('normalises and validates', () => {
    expect(normalizeEmail('  John@Example.COM ')).toBe('john@example.com');
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidEmail('no@domain')).toBe(false);
  });
});

describe('one-time codes', () => {
  it('are 6 digits and hash deterministically', async () => {
    expect(randomOtp()).toMatch(/^\d{6}$/);
    expect(await sha256Hex('123456')).toBe(await sha256Hex('123456'));
    expect(await sha256Hex('123456')).not.toBe(await sha256Hex('654321'));
  });
});

describe('session tokens', () => {
  it('round-trips the predictor id and rejects tampering/expiry/wrong secret', async () => {
    const now = 1_000_000;
    const tok = await createSessionToken('john', 60_000, 'secret', now);
    expect(await readSessionToken(tok, 'secret', now + 1)).toBe('john');
    // wrong secret
    expect(await readSessionToken(tok, 'other', now + 1)).toBeNull();
    // expired
    expect(await readSessionToken(tok, 'secret', now + 60_001)).toBeNull();
    // tampered signature
    expect(await readSessionToken(tok.slice(0, -2) + 'xy', 'secret', now + 1)).toBeNull();
    // garbage
    expect(await readSessionToken('garbage', 'secret', now)).toBeNull();
  });
});

describe('changedPredictorIds', () => {
  it('flags only predictors whose picks/champion/name/presence changed', () => {
    const prev = state({ predictions: [pick('john', 'm1', 1, 0), pick('dan', 'm1', 2, 2)] });
    // John changes his own pick.
    const next = state({ predictions: [pick('john', 'm1', 3, 0), pick('dan', 'm1', 2, 2)] });
    expect([...changedPredictorIds(prev, next)]).toEqual(['john']);

    // Champion pick change.
    const champ = state({
      predictions: prev.predictions,
      championPicks: { dan: 'BRA' },
    });
    expect(changedPredictorIds(prev, champ).has('dan')).toBe(true);
    expect(changedPredictorIds(prev, champ).has('john')).toBe(false);

    // Adding a new predictor flags only the new id; removing flags the removed.
    const added = state({
      predictors: [...prev.predictors, { id: 'noel', name: 'Noel' }],
      predictions: prev.predictions,
    });
    expect([...changedPredictorIds(prev, added)]).toEqual(['noel']);
  });
});

describe('authorizeWcWrite', () => {
  const prev = state({ predictions: [pick('john', 'm1', 1, 0), pick('dan', 'm1', 2, 2)] });

  it('allows changes to unclaimed predictors with no session', () => {
    const next = state({ predictions: [pick('john', 'm1', 5, 0), pick('dan', 'm1', 2, 2)] });
    expect(authorizeWcWrite(prev, next, new Set(), null).ok).toBe(true);
  });

  it('blocks editing a claimed predictor without its session', () => {
    const next = state({ predictions: [pick('john', 'm1', 5, 0), pick('dan', 'm1', 2, 2)] });
    const res = authorizeWcWrite(prev, next, new Set(['john']), null);
    expect(res.ok).toBe(false);
    expect(res.lockedId).toBe('john');
    // Someone else's verified session can't edit John either.
    expect(authorizeWcWrite(prev, next, new Set(['john']), 'dan').ok).toBe(false);
  });

  it("lets a claimed predictor's owner edit their own picks", () => {
    const next = state({ predictions: [pick('john', 'm1', 5, 0), pick('dan', 'm1', 2, 2)] });
    expect(authorizeWcWrite(prev, next, new Set(['john']), 'john').ok).toBe(true);
  });

  it('does not block organiser-style changes that touch no predictor picks', () => {
    // Same predictions, but a match result was entered (matches differ).
    const next = state({
      predictions: prev.predictions,
      matches: [
        { id: 'm1', stage: 'group', order: 0, kickoff: 'x', result: { home: 1, away: 0 } },
      ] as never,
    });
    expect(authorizeWcWrite(prev, next, new Set(['john', 'dan']), null).ok).toBe(true);
  });
});

describe('stampClaimed', () => {
  it('sets the claimed flag from the server set and is identity-stable', () => {
    const s = state();
    const stamped = stampClaimed(s, new Set(['john']));
    expect(stamped.predictors.find((p) => p.id === 'john')?.claimed).toBe(true);
    // Never-claimed names stay falsy (undefined) — the UI treats that as unlocked.
    expect(stamped.predictors.find((p) => p.id === 'dan')?.claimed).toBeFalsy();
    // But a previously-claimed name that's released is explicitly set back to false.
    const released = stampClaimed(
      { ...s, predictors: [{ id: 'john', name: 'John', claimed: true }] },
      new Set(),
    );
    expect(released.predictors[0]!.claimed).toBe(false);
    // No change ⇒ same reference (lets the caller skip a needless write).
    expect(stampClaimed(stamped, new Set(['john']))).toBe(stamped);
  });
});
