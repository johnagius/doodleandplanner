import { describe, expect, it } from 'vitest';
import {
  clubLeaderboard,
  clubLeaderboardWithMovement,
  clubLiveSwings,
  clubRivalry,
  seedClubLeague,
  setClubPrediction,
  syncClubFeed,
  type ClubFeedFixture,
  type ClubLeagueState,
} from '../src/index.js';

const NOW = () => new Date('2026-08-10T00:00:00.000Z');

function board(): { state: ClubLeagueState; fixtureId: string } {
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

describe('live "as it stands" scoring', () => {
  it('folds a live score into the leaderboard without a final result', () => {
    const { state: base, fixtureId } = board();
    let state = base;
    const me = state.predictors[0]!.id;
    state = setClubPrediction(
      state,
      { fixtureId, predictorId: me, outcome: '1', totals: 'over', btts: 'yes' },
      { now: NOW },
    );
    // No result yet, but a live 3-1 → all three markets right as it stands.
    const rows = clubLeaderboard(state, { liveScores: { [fixtureId]: { home: 3, away: 1 } } });
    expect(rows.find((r) => r.predictorId === me)!.points).toBe(7);
    // Without the live score, it's 0.
    expect(clubLeaderboard(state).find((r) => r.predictorId === me)!.points).toBe(0);
  });

  it('reports movement when a live game lifts someone', () => {
    const { state: base, fixtureId } = board();
    let state = base;
    const [a, b] = [state.predictors[0]!.id, state.predictors[1]!.id];
    state = setClubPrediction(state, { fixtureId, predictorId: a, outcome: '1' }, { now: NOW });
    const moved = clubLeaderboardWithMovement(state, { [fixtureId]: { home: 2, away: 0 } });
    const rowA = moved.find((r) => r.predictorId === a)!;
    expect(rowA.points).toBe(3);
    // `a` climbs above the pack once the live points land.
    expect(rowA.movement).toBeGreaterThan(0);
    expect(moved.find((r) => r.predictorId === b)!.points).toBe(0);
  });

  it('rivalry shows who you have to catch / hold off', () => {
    const { state: base, fixtureId } = board();
    let state = base;
    const leader = state.predictors[0]!; // John, will lead on live points
    // Daniel tops the still-goalless pack (alphabetically first at 0 points).
    const daniel = state.predictors[2]!;
    state = setClubPrediction(
      state,
      { fixtureId, predictorId: leader.id, outcome: '1' },
      { now: NOW },
    );
    const live = { [fixtureId]: { home: 2, away: 0 } };
    expect(clubRivalry(state, leader.id, live)!.rank).toBe(1);
    expect(clubRivalry(state, daniel.id, live)!.ahead?.name).toBe(leader.name); // John ahead
  });
});

describe('clubLiveSwings', () => {
  it('notes the market swing when a goal changes the picture', () => {
    const { state: base, fixtureId } = board();
    let state = base;
    const daniel = state.predictors[2]!; // "Daniel"
    state = setClubPrediction(
      state,
      { fixtureId, predictorId: daniel.id, outcome: 'X' },
      { now: NOW },
    );
    // Was 1-0 (home win), now 1-1 (draw) — favours Daniel's X.
    const notes = clubLiveSwings(state, fixtureId, { home: 1, away: 0 }, { home: 1, away: 1 });
    expect(notes.some((n) => /draw/i.test(n) && n.includes('Daniel'))).toBe(true);
  });

  it('flags Over 2.5 going live on the third goal', () => {
    const { state, fixtureId } = board();
    const notes = clubLiveSwings(state, fixtureId, { home: 1, away: 1 }, { home: 2, away: 1 });
    expect(notes.some((n) => /Over 2\.5/.test(n))).toBe(true);
  });
});
