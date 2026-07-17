import { describe, expect, it } from 'vitest';
import {
  CLUB_MAX_FIXTURE_POINTS,
  CLUB_POINTS,
  addClubPredictor,
  addFixture,
  clearClubPrediction,
  clearFixtureResult,
  clubLeaderboard,
  clubLockingSoon,
  clubPendingForMe,
  clubPlayedCount,
  computeDivisions,
  findFixture,
  isFixtureLocked,
  marketsForResult,
  orderedFixtures,
  periodForFixture,
  rankedLeaderboard,
  removeFixture,
  scoreClubPrediction,
  seedClubLeague,
  setBanker,
  setClubPrediction,
  setFixtureResult,
  updateFixture,
  type ClubFixture,
  type ClubLeagueState,
  type ClubResult,
} from '../src/clubleague.js';

const FIXED = () => new Date('2026-08-01T00:00:00.000Z');

function seed(): ClubLeagueState {
  return seedClubLeague(FIXED);
}

describe('marketsForResult', () => {
  it('reads 1 / X / 2, over/under 2.5 and BTTS from a scoreline', () => {
    expect(marketsForResult({ home: 2, away: 1 })).toEqual({
      outcome: '1',
      totals: 'over',
      btts: 'yes',
    });
    expect(marketsForResult({ home: 0, away: 0 })).toEqual({
      outcome: 'X',
      totals: 'under',
      btts: 'no',
    });
    expect(marketsForResult({ home: 0, away: 2 })).toEqual({
      outcome: '2',
      totals: 'under',
      btts: 'no',
    });
    // Exactly on the 2.5 line: 1-1 is two goals → under; 2-1 is three → over.
    expect(marketsForResult({ home: 1, away: 1 }).totals).toBe('under');
    expect(marketsForResult({ home: 2, away: 1 }).totals).toBe('over');
  });
});

describe('scoreClubPrediction', () => {
  const actual: ClubResult = { home: 3, away: 1 }; // 1 / over / yes

  it('awards each market independently', () => {
    const s = scoreClubPrediction({ outcome: '1', totals: 'over', btts: 'yes' }, actual);
    expect(s.points).toBe(CLUB_POINTS.result + CLUB_POINTS.totals + CLUB_POINTS.btts);
    expect(s.hits).toEqual({ result: true, totals: true, btts: true });
  });

  it('scores partial hits', () => {
    const s = scoreClubPrediction({ outcome: '1', totals: 'under', btts: 'no' }, actual);
    expect(s.points).toBe(CLUB_POINTS.result);
    expect(s.hits).toEqual({ result: true, totals: false, btts: false });
  });

  it('unfilled markets score nothing', () => {
    const s = scoreClubPrediction({ outcome: '1' }, actual);
    expect(s.points).toBe(CLUB_POINTS.result);
    expect(s.hits.totals).toBe(false);
    expect(s.hits.btts).toBe(false);
  });

  it('doubles everything on a banker', () => {
    const plain = scoreClubPrediction({ outcome: '1', totals: 'over', btts: 'yes' }, actual);
    const banked = scoreClubPrediction(
      { outcome: '1', totals: 'over', btts: 'yes', banker: true },
      actual,
    );
    expect(banked.points).toBe(plain.points * 2);
    expect(banked.points).toBe(CLUB_MAX_FIXTURE_POINTS);
  });

  it('a banker on a total miss still scores zero', () => {
    const s = scoreClubPrediction(
      { outcome: '2', totals: 'under', btts: 'no', banker: true },
      actual,
    );
    expect(s.points).toBe(0);
  });
});

describe('locking', () => {
  it('locks at kick-off and once a result exists', () => {
    const f: ClubFixture = {
      id: 'x',
      competitionId: 'epl',
      home: { name: 'A', short: 'A' },
      away: { name: 'B', short: 'B' },
      kickoff: '2026-08-15T16:30:00.000Z',
      order: 1,
    };
    expect(isFixtureLocked(f, new Date('2026-08-15T16:29:00.000Z'))).toBe(false);
    expect(isFixtureLocked(f, new Date('2026-08-15T16:30:00.000Z'))).toBe(true);
    expect(isFixtureLocked({ ...f, result: { home: 1, away: 0 } }, new Date('2000-01-01'))).toBe(
      true,
    );
  });

  it('rescheduling a kick-off re-opens predictions', () => {
    let s = seed();
    const f = orderedFixtures(s)[0]!;
    const past = new Date('2026-08-16T00:00:00.000Z'); // after the original kickoff
    expect(isFixtureLocked(findFixture(s, f.id)!, past)).toBe(true);
    s = updateFixture(s, f.id, { kickoff: '2026-09-01T18:00:00.000Z' });
    expect(isFixtureLocked(findFixture(s, f.id)!, past)).toBe(false);
  });

  it('setClubPrediction rejects a locked fixture but force overrides', () => {
    const s = seed();
    const f = orderedFixtures(s)[0]!;
    const me = s.predictors[0]!.id;
    const after = () => new Date('2026-08-16T00:00:00.000Z');
    expect(() =>
      setClubPrediction(s, { fixtureId: f.id, predictorId: me, outcome: '1' }, { now: after }),
    ).toThrow(/locked/i);
    const forced = setClubPrediction(
      s,
      { fixtureId: f.id, predictorId: me, outcome: '1' },
      { now: after, force: true },
    );
    expect(forced.predictions).toHaveLength(1);
  });
});

describe('predictions', () => {
  it('merges markets across calls without dropping earlier ones', () => {
    let s = seed();
    const f = orderedFixtures(s)[0]!;
    const me = s.predictors[0]!.id;
    const now = () => new Date('2026-08-10T00:00:00.000Z');
    s = setClubPrediction(s, { fixtureId: f.id, predictorId: me, outcome: '1' }, { now });
    s = setClubPrediction(s, { fixtureId: f.id, predictorId: me, totals: 'over' }, { now });
    const p = s.predictions[0]!;
    expect(p.outcome).toBe('1');
    expect(p.totals).toBe('over');
    expect(p.btts).toBeUndefined();
  });

  it('clearing removes only that player + fixture', () => {
    let s = seed();
    const f = orderedFixtures(s)[0]!;
    const [a, b] = [s.predictors[0]!.id, s.predictors[1]!.id];
    const now = () => new Date('2026-08-10T00:00:00.000Z');
    s = setClubPrediction(s, { fixtureId: f.id, predictorId: a, outcome: '1' }, { now });
    s = setClubPrediction(s, { fixtureId: f.id, predictorId: b, outcome: '2' }, { now });
    s = clearClubPrediction(s, f.id, a);
    expect(s.predictions).toHaveLength(1);
    expect(s.predictions[0]!.predictorId).toBe(b);
  });

  it('pending + lockingSoon reflect what is still open', () => {
    let s = seed();
    const me = s.predictors[0]!.id;
    const now = new Date('2026-08-14T00:00:00.000Z');
    const before = clubPendingForMe(s, me, now).length;
    const f = orderedFixtures(s).find((x) => new Date(x.kickoff) > now)!;
    s = setClubPrediction(
      s,
      { fixtureId: f.id, predictorId: me, outcome: '1', totals: 'over', btts: 'yes' },
      { now: () => now },
    );
    expect(clubPendingForMe(s, me, now).length).toBe(before - 1);
    // The Aug 15 fixtures are within 6h of an Aug-15 morning "now".
    expect(clubLockingSoon(s, me, new Date('2026-08-15T12:00:00.000Z')).length).toBeGreaterThan(0);
  });
});

describe('banker — one per period', () => {
  it('turning a banker on clears the previous banker in the same period', () => {
    let s = seed();
    const me = s.predictors[0]!.id;
    const now = () => new Date('2026-08-10T00:00:00.000Z');
    const p1 = orderedFixtures(s).filter((f) => periodForFixture(s, f)?.id === 'p1');
    const [f1, f2] = [p1[0]!, p1[1]!];
    expect(periodForFixture(s, f1)!.id).toBe('p1');
    s = setClubPrediction(s, { fixtureId: f1.id, predictorId: me, outcome: '1' }, { now });
    s = setClubPrediction(s, { fixtureId: f2.id, predictorId: me, outcome: '1' }, { now });
    s = setBanker(s, f1.id, me, true, { now });
    s = setBanker(s, f2.id, me, true, { now });
    const banked = s.predictions.filter((p) => p.predictorId === me && p.banker);
    expect(banked).toHaveLength(1);
    expect(banked[0]!.fixtureId).toBe(f2.id);
  });

  it('a banker can be created without an existing prediction', () => {
    let s = seed();
    const me = s.predictors[0]!.id;
    const f = orderedFixtures(s)[0]!;
    s = setBanker(s, f.id, me, true, { now: () => new Date('2026-08-10T00:00:00.000Z') });
    expect(s.predictions.find((p) => p.predictorId === me && p.fixtureId === f.id)?.banker).toBe(
      true,
    );
  });
});

describe('results + leaderboard', () => {
  function play(s: ClubLeagueState, fixtureId: string, r: ClubResult): ClubLeagueState {
    return setFixtureResult(s, fixtureId, r);
  }
  function pick(
    s: ClubLeagueState,
    fixtureId: string,
    predictorId: string,
    outcome: '1' | 'X' | '2',
    totals: 'over' | 'under',
    btts: 'yes' | 'no',
  ): ClubLeagueState {
    return setClubPrediction(
      s,
      { fixtureId, predictorId, outcome, totals, btts },
      { now: () => new Date('2026-08-10T00:00:00.000Z') },
    );
  }

  it('tallies cumulative points and counts', () => {
    let s = seed();
    const f = orderedFixtures(s)[0]!;
    const [a, b] = [s.predictors[0]!.id, s.predictors[1]!.id];
    s = pick(s, f.id, a, '1', 'over', 'yes');
    s = pick(s, f.id, b, '2', 'under', 'no');
    s = play(s, f.id, { home: 3, away: 1 }); // 1 / over / yes → a nails all three
    const rows = clubLeaderboard(s);
    const rowA = rows.find((r) => r.predictorId === a)!;
    const rowB = rows.find((r) => r.predictorId === b)!;
    expect(rowA.points).toBe(7);
    expect(rowA.resultsRight).toBe(1);
    expect(rowA.marketsRight).toBe(3);
    expect(rowB.points).toBe(0);
    expect(clubPlayedCount(s)).toBe(1);
    expect(rankedLeaderboard(s)[0]!.predictorId).toBe(a);
  });

  it('clearing a result removes its points', () => {
    let s = seed();
    const f = orderedFixtures(s)[0]!;
    const a = s.predictors[0]!.id;
    s = pick(s, f.id, a, '1', 'over', 'yes');
    s = play(s, f.id, { home: 3, away: 1 });
    expect(clubLeaderboard(s).find((r) => r.predictorId === a)!.points).toBe(7);
    s = clearFixtureResult(s, f.id);
    expect(clubLeaderboard(s).find((r) => r.predictorId === a)!.points).toBe(0);
  });

  it('banker doubles a fixture in the season total', () => {
    let s = seed();
    const f = orderedFixtures(s)[0]!;
    const a = s.predictors[0]!.id;
    const now = () => new Date('2026-08-10T00:00:00.000Z');
    s = pick(s, f.id, a, '1', 'over', 'yes');
    s = setBanker(s, f.id, a, true, { now });
    s = play(s, f.id, { home: 3, away: 1 });
    const row = clubLeaderboard(s).find((r) => r.predictorId === a)!;
    expect(row.points).toBe(14);
    expect(row.bankersHit).toBe(1);
  });
});

describe('fixtures CRUD', () => {
  it('adds, edits and removes fixtures (dropping their predictions)', () => {
    let s = seed();
    const before = s.fixtures.length;
    s = addFixture(s, {
      competitionId: 'ucl',
      home: { name: 'Arsenal', short: 'ARS', teamId: 'ARS' },
      away: { name: 'Bayern', short: 'BAY' },
      kickoff: '2026-09-16T19:00:00.000Z',
    });
    expect(s.fixtures.length).toBe(before + 1);
    const added = orderedFixtures(s).find((f) => f.competitionId === 'ucl')!;
    s = setClubPrediction(
      s,
      { fixtureId: added.id, predictorId: s.predictors[0]!.id, outcome: '1' },
      { now: () => new Date('2026-09-01T00:00:00.000Z') },
    );
    expect(s.predictions).toHaveLength(1);
    s = removeFixture(s, added.id);
    expect(s.fixtures.length).toBe(before);
    expect(s.predictions).toHaveLength(0);
  });
});

describe('divisions, promotion/relegation, run-in', () => {
  const now = () => new Date('2026-08-10T00:00:00.000Z');

  // Give a player a set of results in a period by resulting a fresh fixture in
  // that period and having them predict it exactly for `n` points.
  function scoreInPeriod(
    s: ClubLeagueState,
    predictorId: string,
    kickoff: string,
    points: number,
  ): ClubLeagueState {
    s = addFixture(s, {
      competitionId: 'epl',
      home: { name: 'H', short: 'H' },
      away: { name: 'A', short: 'A' },
      kickoff,
    });
    const f = orderedFixtures(s).find((x) => x.kickoff === kickoff && !x.result)!;
    if (points > 0) {
      // 3-1 settles 1 / over / yes = 7 pts for a full ticket; use markets to hit
      // exactly `points` (3=result only, 5=result+totals, 7=all three).
      const outcome = '1';
      const totals = points >= 5 ? 'over' : 'under';
      const btts = points >= 7 ? 'yes' : 'no';
      s = setClubPrediction(s, { fixtureId: f.id, predictorId, outcome, totals, btts }, { now });
    }
    s = setFixtureResult(s, f.id, { home: 3, away: 1 });
    return s;
  }

  it('opening period is a single combined table that seeds the first split', () => {
    let s = seed();
    s = removeAllSeedFixtures(s);
    const [p0, p1, p2, p3, p4, p5, p6] = s.predictors.map((p) => p.id);
    // Opening period standings: p0 > p1 > ... in points.
    s = scoreInPeriod(s, p0!, '2026-08-10T12:00:00.000Z', 7);
    s = scoreInPeriod(s, p1!, '2026-08-11T12:00:00.000Z', 7);
    s = scoreInPeriod(s, p2!, '2026-08-12T12:00:00.000Z', 5);
    s = scoreInPeriod(s, p3!, '2026-08-13T12:00:00.000Z', 5);
    s = scoreInPeriod(s, p4!, '2026-08-14T12:00:00.000Z', 3);
    s = scoreInPeriod(s, p5!, '2026-08-15T12:00:00.000Z', 3);
    // p6 scores nothing.
    const divs = computeDivisions(s);
    const opening = divs.find((d) => d.period.id === 'p1')!;
    expect(opening.combined).toBeDefined();
    expect(opening.combined!.length).toBe(7);
    // Next period (Autumn) League 1 is the top 4 from the opening table.
    const autumn = divs.find((d) => d.period.id === 'p2')!;
    const l1 = new Set(autumn.league1.map((r) => r.predictorId));
    expect(l1.size).toBe(4);
    expect(l1.has(p0!)).toBe(true);
    expect(l1.has(p6!)).toBe(false);
  });

  it('promotes the top of L2 and relegates the bottom of L1 between periods', () => {
    let s = seed();
    s = removeAllSeedFixtures(s);
    const ids = s.predictors.map((p) => p.id);
    // Opening: rank ids[0..6] descending so L1 = {0,1,2,3}, L2 = {4,5,6}.
    ids.forEach((id, i) => {
      s = scoreInPeriod(s, id!, `2026-08-${String(10 + i).padStart(2, '0')}T12:00:00.000Z`, 7 - i);
    });
    // Autumn: make the bottom L1 player (ids[3]) score nothing and the top L2
    // player (ids[4]) top the pile, so they swap for Spring.
    s = scoreInPeriod(s, ids[4]!, '2026-11-10T12:00:00.000Z', 7);
    s = scoreInPeriod(s, ids[0]!, '2026-11-11T12:00:00.000Z', 3);
    const divs = computeDivisions(s);
    const spring = divs.find((d) => d.period.id === 'p3')!;
    const l1 = new Set(spring.league1.map((r) => r.predictorId));
    expect(l1.has(ids[4]!)).toBe(true); // promoted
    expect(l1.has(ids[3]!)).toBe(false); // relegated
    // The Autumn view should mark ids[4] as promoted relative to the opening split.
    const autumn = divs.find((d) => d.period.id === 'p2')!;
    expect(autumn.movement.find((m) => m.predictorId === ids[4]!)?.change).toBeDefined();
  });

  it('the closing period runs a reset run-in for the top contenders', () => {
    let s = seed();
    s = removeAllSeedFixtures(s);
    const ids = s.predictors.map((p) => p.id);
    // Build a season lead before the run-in: ids[0] huge, ids[1], ids[2] next.
    s = scoreInPeriod(s, ids[0]!, '2026-08-10T12:00:00.000Z', 7);
    s = scoreInPeriod(s, ids[0]!, '2026-08-11T12:00:00.000Z', 7);
    s = scoreInPeriod(s, ids[1]!, '2026-08-12T12:00:00.000Z', 7);
    s = scoreInPeriod(s, ids[2]!, '2026-08-13T12:00:00.000Z', 5);
    s = scoreInPeriod(s, ids[3]!, '2026-08-14T12:00:00.000Z', 3);
    // Run-in period fixtures (May 2027).
    s = scoreInPeriod(s, ids[2]!, '2027-05-10T12:00:00.000Z', 7); // trailing contender surges
    const divs = computeDivisions(s);
    const runInPeriod = divs.find((d) => d.period.id === 'p4')!;
    expect(runInPeriod.runIn).toBeDefined();
    const contenders = runInPeriod.runIn!.contenders.map((r) => r.predictorId);
    expect(contenders).toHaveLength(3);
    expect(new Set(contenders)).toEqual(new Set([ids[0], ids[1], ids[2]]));
    // Points are reset to the period only: ids[2] leads the run-in despite ids[0]
    // having the bigger season total.
    expect(runInPeriod.runIn!.contenders[0]!.predictorId).toBe(ids[2]);
  });
});

describe('predictors', () => {
  it('adds and de-duplicates by name', () => {
    let s = seed();
    const before = s.predictors.length;
    s = addClubPredictor(s, 'Zoe');
    expect(s.predictors.length).toBe(before + 1);
    expect(() => addClubPredictor(s, 'zoe')).toThrow(/taken/i);
  });
});

// Helper: strip the illustrative seeded fixtures so a test controls the calendar.
function removeAllSeedFixtures(s: ClubLeagueState): ClubLeagueState {
  let next = s;
  for (const f of [...s.fixtures]) next = removeFixture(next, f.id);
  return next;
}
