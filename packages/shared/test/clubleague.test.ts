import { describe, expect, it } from 'vitest';
import {
  CLUB_ESPN_TEAM_IDS,
  CLUB_MAX_FIXTURE_POINTS,
  CLUB_POINTS,
  CLUB_TEAM_BY_ESPN_ID,
  addClubPredictor,
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
  rankedLeaderboard,
  scoreClubPrediction,
  seedClubLeague,
  setClubPrediction,
  setFixtureResult,
  syncClubFeed,
  type ClubFeedFixture,
  type ClubLeagueState,
  type ClubResult,
  type ClubSide,
} from '../src/clubleague.js';

const FIXED = () => new Date('2026-08-01T00:00:00.000Z');

function seed(): ClubLeagueState {
  return seedClubLeague(FIXED);
}

let extCounter = 0;
function feedFixture(
  home: ClubSide,
  away: ClubSide,
  kickoff: string,
  extra: Partial<ClubFeedFixture> = {},
): ClubFeedFixture {
  return {
    externalId: `espn:${(extCounter++).toString()}`,
    competitionId: 'epl',
    kickoff,
    home,
    away,
    status: 'scheduled',
    ...extra,
  };
}
const tracked = (id: string): ClubSide => ({ name: id, short: id, teamId: id });
const opp = (name: string): ClubSide => ({ name, short: name.slice(0, 3).toUpperCase() });

/** Add fixtures to a board via the feed (the only way fixtures enter now). */
function withFixtures(s: ClubLeagueState, feed: ClubFeedFixture[]): ClubLeagueState {
  return syncClubFeed(s, feed, { now: FIXED });
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
    expect(marketsForResult({ home: 1, away: 1 }).totals).toBe('under');
    expect(marketsForResult({ home: 2, away: 1 }).totals).toBe('over');
  });
});

describe('scoreClubPrediction', () => {
  const actual: ClubResult = { home: 3, away: 1 }; // 1 / over / yes

  it('awards each market independently and sums, no doubling', () => {
    const s = scoreClubPrediction({ outcome: '1', totals: 'over', btts: 'yes' }, actual);
    expect(s.points).toBe(CLUB_MAX_FIXTURE_POINTS);
    expect(s.points).toBe(CLUB_POINTS.result + CLUB_POINTS.totals + CLUB_POINTS.btts);
    expect(s.hits).toEqual({ result: true, totals: true, btts: true });
  });

  it('scores partial and blank markets', () => {
    expect(scoreClubPrediction({ outcome: '1', totals: 'under', btts: 'no' }, actual).points).toBe(
      CLUB_POINTS.result,
    );
    expect(scoreClubPrediction({ outcome: '1' }, actual).points).toBe(CLUB_POINTS.result);
  });
});

describe('locking', () => {
  it('locks at kick-off and once a result exists', () => {
    let s = withFixtures(seed(), [
      feedFixture(tracked('MUN'), tracked('ARS'), '2026-08-15T16:30:00.000Z'),
    ]);
    const f = orderedFixtures(s)[0]!;
    expect(isFixtureLocked(f, new Date('2026-08-15T16:29:00.000Z'))).toBe(false);
    expect(isFixtureLocked(f, new Date('2026-08-15T16:30:00.000Z'))).toBe(true);
    s = setFixtureResult(s, f.id, { home: 1, away: 0 });
    expect(isFixtureLocked(findFixture(s, f.id)!, new Date('2000-01-01'))).toBe(true);
  });

  it('setClubPrediction rejects a locked fixture but force overrides', () => {
    const s = withFixtures(seed(), [
      feedFixture(tracked('MUN'), tracked('ARS'), '2026-08-15T16:30:00.000Z'),
    ]);
    const f = orderedFixtures(s)[0]!;
    const me = s.predictors[0]!.id;
    const after = () => new Date('2026-08-16T00:00:00.000Z');
    expect(() =>
      setClubPrediction(s, { fixtureId: f.id, predictorId: me, outcome: '1' }, { now: after }),
    ).toThrow(/locked/i);
    expect(
      setClubPrediction(
        s,
        { fixtureId: f.id, predictorId: me, outcome: '1' },
        { now: after, force: true },
      ).predictions,
    ).toHaveLength(1);
  });
});

describe('predictions', () => {
  const now = () => new Date('2026-08-10T00:00:00.000Z');
  function board() {
    return withFixtures(seed(), [
      feedFixture(tracked('MUN'), tracked('ARS'), '2026-08-15T16:30:00.000Z'),
      feedFixture(tracked('LIV'), opp('Everton'), '2026-08-16T14:00:00.000Z'),
    ]);
  }

  it('merges markets across calls without dropping earlier ones', () => {
    let s = board();
    const f = orderedFixtures(s)[0]!;
    const me = s.predictors[0]!.id;
    s = setClubPrediction(s, { fixtureId: f.id, predictorId: me, outcome: '1' }, { now });
    s = setClubPrediction(s, { fixtureId: f.id, predictorId: me, totals: 'over' }, { now });
    const p = s.predictions[0]!;
    expect(p.outcome).toBe('1');
    expect(p.totals).toBe('over');
    expect(p.btts).toBeUndefined();
  });

  it('clearing removes only that player + fixture', () => {
    let s = board();
    const f = orderedFixtures(s)[0]!;
    const [a, b] = [s.predictors[0]!.id, s.predictors[1]!.id];
    s = setClubPrediction(s, { fixtureId: f.id, predictorId: a, outcome: '1' }, { now });
    s = setClubPrediction(s, { fixtureId: f.id, predictorId: b, outcome: '2' }, { now });
    s = clearClubPrediction(s, f.id, a);
    expect(s.predictions).toHaveLength(1);
    expect(s.predictions[0]!.predictorId).toBe(b);
  });

  it('pending + lockingSoon reflect what is still open', () => {
    let s = board();
    const me = s.predictors[0]!.id;
    const nowD = new Date('2026-08-14T00:00:00.000Z');
    const before = clubPendingForMe(s, me, nowD).length;
    // The MUN fixture (08-15 16:30) is within 6h of an 08-15 12:00 "now" and unpicked.
    expect(clubLockingSoon(s, me, new Date('2026-08-15T12:00:00.000Z')).length).toBeGreaterThan(0);
    const f = orderedFixtures(s)[0]!;
    s = setClubPrediction(
      s,
      { fixtureId: f.id, predictorId: me, outcome: '1', totals: 'over', btts: 'yes' },
      { now: () => nowD },
    );
    expect(clubPendingForMe(s, me, nowD).length).toBe(before - 1);
    // Fully picked now → nothing locking soon.
    expect(clubLockingSoon(s, me, new Date('2026-08-15T12:00:00.000Z')).length).toBe(0);
  });
});

describe('results + leaderboard', () => {
  const now = () => new Date('2026-08-10T00:00:00.000Z');
  function pick(
    s: ClubLeagueState,
    fixtureId: string,
    predictorId: string,
    outcome: '1' | 'X' | '2',
    totals: 'over' | 'under',
    btts: 'yes' | 'no',
  ) {
    return setClubPrediction(s, { fixtureId, predictorId, outcome, totals, btts }, { now });
  }

  it('tallies cumulative points and counts', () => {
    let s = withFixtures(seed(), [
      feedFixture(tracked('MUN'), tracked('ARS'), '2026-08-15T16:30:00.000Z'),
    ]);
    const f = orderedFixtures(s)[0]!;
    const [a, b] = [s.predictors[0]!.id, s.predictors[1]!.id];
    s = pick(s, f.id, a, '1', 'over', 'yes');
    s = pick(s, f.id, b, '2', 'under', 'no');
    s = setFixtureResult(s, f.id, { home: 3, away: 1 });
    const rows = clubLeaderboard(s);
    expect(rows.find((r) => r.predictorId === a)!.points).toBe(7);
    expect(rows.find((r) => r.predictorId === a)!.marketsRight).toBe(3);
    expect(rows.find((r) => r.predictorId === b)!.points).toBe(0);
    expect(clubPlayedCount(s)).toBe(1);
    expect(rankedLeaderboard(s)[0]!.predictorId).toBe(a);
  });

  it('clearing a result removes its points', () => {
    let s = withFixtures(seed(), [
      feedFixture(tracked('MUN'), tracked('ARS'), '2026-08-15T16:30:00.000Z'),
    ]);
    const f = orderedFixtures(s)[0]!;
    const a = s.predictors[0]!.id;
    s = pick(s, f.id, a, '1', 'over', 'yes');
    s = setFixtureResult(s, f.id, { home: 3, away: 1 });
    expect(clubLeaderboard(s).find((r) => r.predictorId === a)!.points).toBe(7);
    s = clearFixtureResult(s, f.id);
    expect(clubLeaderboard(s).find((r) => r.predictorId === a)!.points).toBe(0);
  });
});

describe('automatic fixture feed', () => {
  const now = () => new Date('2026-08-14T00:00:00.000Z');
  const win = { from: '2026-08-12T00:00:00.000Z', to: '2026-08-28T00:00:00.000Z' };

  it('adds new fixtures and enriches tracked-team sides from the seed', () => {
    const s = syncClubFeed(
      seed(),
      [feedFixture(tracked('MUN'), opp('Arsenal FC'), '2026-08-15T16:30:00.000Z')],
      {
        now,
        window: win,
      },
    );
    expect(s.fixtures).toHaveLength(1);
    // The MUN side gets the canonical name/colour from the tracked team.
    expect(s.fixtures[0]!.home.name).toBe('Manchester United');
    expect(s.fixtures[0]!.home.color).toBe('#DA020E');
    expect(s.feedSyncedAt).toBeTruthy();
  });

  it('keeps a fixture id stable across syncs so predictions survive a reschedule', () => {
    const ext = feedFixture(tracked('MUN'), tracked('ARS'), '2026-08-15T16:30:00.000Z');
    let s = syncClubFeed(seed(), [ext], { now, window: win });
    const f = s.fixtures[0]!;
    const me = s.predictors[0]!.id;
    s = setClubPrediction(s, { fixtureId: f.id, predictorId: me, outcome: '1' }, { now });
    // Re-sync with the same event but a moved kick-off.
    s = syncClubFeed(s, [{ ...ext, kickoff: '2026-08-20T18:00:00.000Z' }], { now, window: win });
    expect(s.fixtures).toHaveLength(1);
    expect(s.fixtures[0]!.id).toBe(f.id);
    expect(s.fixtures[0]!.kickoff).toBe('2026-08-20T18:00:00.000Z');
    expect(s.predictions).toHaveLength(1); // prediction preserved
  });

  it('auto-fills a final result but never overwrites a manual (extra-time) correction', () => {
    const ext = feedFixture(tracked('MUN'), tracked('ARS'), '2026-08-15T16:30:00.000Z');
    let s = syncClubFeed(seed(), [ext], { now, window: win });
    const f = s.fixtures[0]!;
    // Feed reports a 2-2 final → auto-filled.
    s = syncClubFeed(s, [{ ...ext, status: 'final', result: { home: 2, away: 2 } }], {
      now,
      window: win,
    });
    expect(findFixture(s, f.id)!.result).toEqual({ home: 2, away: 2 });
    // Organiser corrects to the 90-minute score 1-1 (the game went to ET).
    s = setFixtureResult(s, f.id, { home: 1, away: 1 }, { manual: true });
    // A later feed sync must NOT clobber the manual correction.
    s = syncClubFeed(s, [{ ...ext, status: 'final', result: { home: 2, away: 2 } }], {
      now,
      window: win,
    });
    expect(findFixture(s, f.id)!.result).toEqual({ home: 1, away: 1 });
  });

  it('prunes a cancelled fixture inside the window and drops its predictions', () => {
    const stay = feedFixture(tracked('MUN'), tracked('ARS'), '2026-08-15T16:30:00.000Z');
    const gone = feedFixture(tracked('LIV'), opp('Wolves'), '2026-08-16T14:00:00.000Z');
    let s = syncClubFeed(seed(), [stay, gone], { now, window: win });
    const goneFx = s.fixtures.find((f) => f.externalId === gone.externalId)!;
    const me = s.predictors[0]!.id;
    s = setClubPrediction(s, { fixtureId: goneFx.id, predictorId: me, outcome: '1' }, { now });
    // Next sync no longer lists the cancelled game.
    s = syncClubFeed(s, [stay], { now, window: win });
    expect(s.fixtures.find((f) => f.externalId === gone.externalId)).toBeUndefined();
    expect(s.predictions).toHaveLength(0);
  });

  it('never prunes a fixture scheduled beyond the covered window', () => {
    const near = feedFixture(tracked('MUN'), tracked('ARS'), '2026-08-15T16:30:00.000Z');
    const far = feedFixture(tracked('MCI'), opp('Leeds'), '2026-10-01T16:30:00.000Z');
    let s = syncClubFeed(seed(), [near, far], { now, window: win });
    expect(s.fixtures).toHaveLength(2);
    // A later sync of a nearer window drops `far` from the feed, but it's beyond
    // the window's `to`, so it must be kept.
    s = syncClubFeed(s, [near], { now, window: win });
    expect(s.fixtures.find((f) => f.externalId === far.externalId)).toBeTruthy();
  });

  it('never touches an organiser-added fixture (no external id)', () => {
    // Craft a state with a manual fixture and confirm the feed leaves it alone.
    let s = syncClubFeed(
      seed(),
      [feedFixture(tracked('MUN'), tracked('ARS'), '2026-08-15T16:30:00.000Z')],
      {
        now,
        window: win,
      },
    );
    s = {
      ...s,
      fixtures: [
        ...s.fixtures,
        {
          id: 'manual1',
          competitionId: 'other',
          home: opp('Friendly A'),
          away: opp('Friendly B'),
          kickoff: '2026-08-14T18:00:00.000Z',
          order: 99,
        },
      ],
    };
    s = syncClubFeed(s, [], { now, window: win });
    expect(findFixture(s, 'manual1')).toBeTruthy();
  });
});

describe('ESPN config', () => {
  it('maps all ten clubs to ESPN ids and back', () => {
    expect(Object.keys(CLUB_ESPN_TEAM_IDS)).toHaveLength(10);
    expect(CLUB_TEAM_BY_ESPN_ID['360']).toBe('MUN');
    expect(CLUB_TEAM_BY_ESPN_ID[CLUB_ESPN_TEAM_IDS.ARS!]).toBe('ARS');
  });
});

describe('divisions, promotion/relegation, run-in', () => {
  const now = () => new Date('2026-08-10T00:00:00.000Z');

  // Give a player `points` in a period by adding a feed fixture in that period and
  // resulting it 3-1 (settles 1 / over / yes); markets tune the exact total.
  let seq = 0;
  function scoreInPeriod(
    s: ClubLeagueState,
    predictorId: string,
    kickoff: string,
    points: number,
  ): ClubLeagueState {
    const ext: ClubFeedFixture = {
      externalId: `seq:${(seq++).toString()}`,
      competitionId: 'epl',
      kickoff,
      home: opp('Home'),
      away: opp('Away'),
      status: 'scheduled',
    };
    s = syncClubFeed(s, [ext], { now });
    const f = s.fixtures.find((x) => x.externalId === ext.externalId)!;
    if (points > 0) {
      s = setClubPrediction(
        s,
        {
          fixtureId: f.id,
          predictorId,
          outcome: '1',
          totals: points >= 5 ? 'over' : 'under',
          btts: points >= 7 ? 'yes' : 'no',
        },
        { now },
      );
    }
    return setFixtureResult(s, f.id, { home: 3, away: 1 });
  }

  it('opening period seeds the first split into League 1 / League 2', () => {
    let s = seed();
    const ids = s.predictors.map((p) => p.id);
    ids.slice(0, 6).forEach((id, i) => {
      s = scoreInPeriod(s, id!, `2026-08-${String(10 + i).padStart(2, '0')}T12:00:00.000Z`, 7 - i);
    });
    const divs = computeDivisions(s);
    expect(divs.find((d) => d.period.id === 'p1')!.combined!.length).toBe(7);
    const autumnL1 = new Set(
      divs.find((d) => d.period.id === 'p2')!.league1.map((r) => r.predictorId),
    );
    expect(autumnL1.size).toBe(4);
    expect(autumnL1.has(ids[0]!)).toBe(true);
    expect(autumnL1.has(ids[6]!)).toBe(false);
  });

  it('promotes the top of L2 and relegates the bottom of L1 between periods', () => {
    let s = seed();
    const ids = s.predictors.map((p) => p.id);
    ids.forEach((id, i) => {
      s = scoreInPeriod(s, id!, `2026-08-${String(10 + i).padStart(2, '0')}T12:00:00.000Z`, 7 - i);
    });
    s = scoreInPeriod(s, ids[4]!, '2026-11-10T12:00:00.000Z', 7);
    s = scoreInPeriod(s, ids[0]!, '2026-11-11T12:00:00.000Z', 3);
    const spring = computeDivisions(s).find((d) => d.period.id === 'p3')!;
    const l1 = new Set(spring.league1.map((r) => r.predictorId));
    expect(l1.has(ids[4]!)).toBe(true);
    expect(l1.has(ids[3]!)).toBe(false);
  });

  it('the closing period runs a reset run-in for the top contenders', () => {
    let s = seed();
    const ids = s.predictors.map((p) => p.id);
    s = scoreInPeriod(s, ids[0]!, '2026-08-10T12:00:00.000Z', 7);
    s = scoreInPeriod(s, ids[0]!, '2026-08-11T12:00:00.000Z', 7);
    s = scoreInPeriod(s, ids[1]!, '2026-08-12T12:00:00.000Z', 7);
    s = scoreInPeriod(s, ids[2]!, '2026-08-13T12:00:00.000Z', 5);
    s = scoreInPeriod(s, ids[3]!, '2026-08-14T12:00:00.000Z', 3);
    s = scoreInPeriod(s, ids[2]!, '2027-05-10T12:00:00.000Z', 7); // trailing contender surges
    const runInPeriod = computeDivisions(s).find((d) => d.period.id === 'p4')!;
    expect(runInPeriod.runIn).toBeDefined();
    expect(new Set(runInPeriod.runIn!.contenders.map((r) => r.predictorId))).toEqual(
      new Set([ids[0], ids[1], ids[2]]),
    );
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
