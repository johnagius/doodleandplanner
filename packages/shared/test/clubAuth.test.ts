import { describe, expect, it } from 'vitest';
import {
  authorizeClubWrite,
  changedClubPredictorIds,
  seedClubLeague,
  setClubPrediction,
  stampClaimedClub,
  syncClubFeed,
  removeFixture,
  type ClubFeedFixture,
  type ClubLeagueState,
} from '../src/index.js';

const NOW = () => new Date('2026-08-10T00:00:00.000Z');

function boardWithFixture(): { state: ClubLeagueState; fixtureId: string } {
  const feed: ClubFeedFixture = {
    externalId: 'espn:1',
    competitionId: 'epl',
    kickoff: '2999-01-01T00:00:00.000Z',
    home: { name: 'MUN', short: 'MUN', teamId: 'MUN' },
    away: { name: 'ARS', short: 'ARS', teamId: 'ARS' },
    status: 'scheduled',
  };
  const state = syncClubFeed(seedClubLeague(NOW), [feed], { now: NOW });
  return { state, fixtureId: state.fixtures[0]!.id };
}

describe('authorizeClubWrite', () => {
  it('lets an unclaimed name be edited by anyone', () => {
    const { state, fixtureId } = boardWithFixture();
    const me = state.predictors[0]!.id;
    const next = setClubPrediction(
      state,
      { fixtureId, predictorId: me, outcome: '1' },
      { now: NOW },
    );
    expect(authorizeClubWrite(state, next, new Set(), null).ok).toBe(true);
  });

  it('blocks editing a claimed name unless the owner is making the change', () => {
    const { state, fixtureId } = boardWithFixture();
    const me = state.predictors[0]!.id;
    const claimed = new Set([me]);
    const next = setClubPrediction(
      state,
      { fixtureId, predictorId: me, outcome: '1' },
      { now: NOW },
    );
    // A stranger (no owner token) is rejected…
    const denied = authorizeClubWrite(state, next, claimed, null);
    expect(denied.ok).toBe(false);
    expect(denied.lockedId).toBe(me);
    // …but the verified owner is allowed.
    expect(authorizeClubWrite(state, next, claimed, me).ok).toBe(true);
  });

  it('never blocks a feed sync that prunes a claimed player’s fixture', () => {
    const { state, fixtureId } = boardWithFixture();
    const me = state.predictors[0]!.id;
    const withPick = setClubPrediction(
      state,
      { fixtureId, predictorId: me, outcome: '1', totals: 'over', btts: 'yes' },
      { now: NOW },
    );
    // The fixture vanishes (as an automatic prune would do), dropping the pick.
    const pruned = removeFixture(withPick, fixtureId);
    // A stranger applying that prune must NOT be blocked, even though the claimed
    // player's pick disappeared with the fixture.
    expect(authorizeClubWrite(withPick, pruned, new Set([me]), null).ok).toBe(true);
    expect(changedClubPredictorIds(withPick, pruned).has(me)).toBe(false);
  });

  it('still blocks removing a claimed player’s pick while the fixture remains', () => {
    const { state, fixtureId } = boardWithFixture();
    const me = state.predictors[0]!.id;
    const withPick = setClubPrediction(
      state,
      { fixtureId, predictorId: me, outcome: '1' },
      { now: NOW },
    );
    const cleared = { ...withPick, predictions: [] }; // fixture kept, pick stripped
    expect(authorizeClubWrite(withPick, cleared, new Set([me]), null).ok).toBe(false);
  });
});

describe('stampClaimedClub', () => {
  it('sets/clears the claimed flag from the authoritative set', () => {
    const state = seedClubLeague(NOW);
    const me = state.predictors[0]!.id;
    const stamped = stampClaimedClub(state, new Set([me]));
    expect(stamped.predictors.find((p) => p.id === me)!.claimed).toBe(true);
    expect(stamped.predictors[1]!.claimed).toBeFalsy();
    // Idempotent: no change → same reference.
    expect(stampClaimedClub(stamped, new Set([me]))).toBe(stamped);
  });
});
