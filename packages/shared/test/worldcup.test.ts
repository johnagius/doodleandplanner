import { describe, expect, it } from 'vitest';
import {
  WC_POINTS,
  achievements,
  addPredictor,
  adminSetPrediction,
  allGroupsComplete,
  applyLiveResults,
  badgesFor,
  championBonusFor,
  championTeam,
  clearChampionPick,
  climateEdge,
  teamClimate,
  venueClimate,
  clearPrediction,
  clearResult,
  closestPredictors,
  banterAchievements,
  banterPrompt,
  closestToScore,
  consensusScore,
  fifaRankOf,
  formTable,
  isChampionLocked,
  setChampionPick,
  dayChampion,
  headToHead,
  latestResultDay,
  leaderboardWithMovement,
  lockingSoon,
  pendingForMe,
  pendingPredictors,
  playerBreakdown,
  playerForm,
  playerGameLog,
  playerStats,
  predictionCount,
  teamRecord,
  toggleMatchReaction,
  togglePickReaction,
  toggleCardReaction,
  setPickGif,
  cardReactionsFor,
  defaultDay,
  findMatch,
  groupComplete,
  groupOutlook,
  groupStandings,
  teamsOutOfContention,
  isMatchLocked,
  isMatchReady,
  leaderboard,
  loserOf,
  matchDateKey,
  matchOfTheDay,
  matchesOn,
  populateBracket,
  predictionFor,
  removePredictor,
  renamePredictor,
  rivalry,
  roundAwards,
  scenarioBoard,
  scorePrediction,
  seedWorldCup,
  setCardBadge,
  setPrediction,
  setResult,
  slotLabel,
  sourceLabel,
  thirdPlacedRanking,
  tournamentDays,
  tournamentScorers,
  trophyCount,
  wcTimeline,
  winnerOf,
  type WcMatch,
  type WcMatchEvent,
  type WorldCupState,
} from '../src/worldcup.js';
import type { Message } from '../src/types.js';

const NOW = () => new Date('2026-06-01T00:00:00Z');

function seed(): WorldCupState {
  return seedWorldCup(NOW);
}

/** The four teams of a group in their seeded (drawn) order. */
function seedOrder(state: WorldCupState, group: string): string[] {
  return state.teams.filter((t) => t.group === group).map((t) => t.id);
}

/** Play every group so the higher-seeded team (earlier in the drawn order) wins
 * 2-0. Each group then finishes in seeded order: 1st = winner, 2nd = runner-up,
 * 3rd = the group's third-placed team — regardless of the real fixture pairings. */
function playAllGroups(state: WorldCupState): WorldCupState {
  const rank = new Map<string, number>();
  for (const g of new Set(state.teams.map((t) => t.group))) {
    seedOrder(state, g).forEach((id, i) => rank.set(id, i));
  }
  let s = state;
  for (const m of state.matches) {
    if (m.stage !== 'group') continue;
    const homeWins = (rank.get(m.homeId!) ?? 9) < (rank.get(m.awayId!) ?? 9);
    s = setResult(s, { matchId: m.id, home: homeWins ? 2 : 0, away: homeWins ? 0 : 2 });
  }
  return s;
}

describe('seedWorldCup', () => {
  it('builds 48 teams in 12 groups of four', () => {
    const s = seed();
    expect(s.teams).toHaveLength(48);
    const groups = new Set(s.teams.map((t) => t.group));
    expect(groups.size).toBe(12);
    for (const g of groups) {
      expect(s.teams.filter((t) => t.group === g)).toHaveLength(4);
    }
    // Team ids are unique.
    expect(new Set(s.teams.map((t) => t.id)).size).toBe(48);
  });

  it('creates 104 matches with the right stage breakdown', () => {
    const s = seed();
    const count = (stage: string) => s.matches.filter((m) => m.stage === stage).length;
    expect(s.matches).toHaveLength(104);
    expect(count('group')).toBe(72);
    expect(count('r32')).toBe(16);
    expect(count('r16')).toBe(8);
    expect(count('qf')).toBe(4);
    expect(count('sf')).toBe(2);
    expect(count('third')).toBe(1);
    expect(count('final')).toBe(1);
  });

  it('gives every group match two known teams and every knockout match sources', () => {
    const s = seed();
    for (const m of s.matches) {
      if (m.stage === 'group') {
        expect(isMatchReady(m)).toBe(true);
        expect(m.homeId).not.toBe(m.awayId);
      } else {
        expect(m.homeSource).toBeTruthy();
        expect(m.awaySource).toBeTruthy();
        expect(isMatchReady(m)).toBe(false);
      }
    }
  });

  it('schedules group matches first and the final last', () => {
    const s = seed();
    const days = tournamentDays(s);
    expect(days[0]).toBe('2026-06-11');
    const final = findMatch(s, 'final-1')!;
    expect(matchDateKey(final)).toBe('2026-07-19');
  });

  it('starts with the four default predictors', () => {
    const s = seed();
    expect(s.predictors.map((p) => p.name)).toEqual(['John', 'Daniel', 'Noel', 'Saviour']);
  });
});

describe('scenarioBoard', () => {
  // Ann leads after m0 (exact 1-0 = 5) over Bob (right result = 3). m1 is unplayed.
  const base: WorldCupState = {
    season: '2026',
    title: 'T',
    teams: [],
    matches: [
      {
        id: 'm0',
        stage: 'group',
        order: 0,
        kickoff: '2026-06-11T00:00:00Z',
        homeId: 'AAA',
        awayId: 'BBB',
        result: { home: 1, away: 0 },
      },
      {
        id: 'm1',
        stage: 'group',
        order: 1,
        kickoff: '2026-06-12T00:00:00Z',
        homeId: 'CCC',
        awayId: 'DDD',
      },
    ],
    predictors: [
      { id: 'A', name: 'Ann' },
      { id: 'B', name: 'Bob' },
    ],
    predictions: [
      { predictorId: 'A', matchId: 'm0', home: 1, away: 0, updatedAt: 'x' },
      { predictorId: 'B', matchId: 'm0', home: 3, away: 0, updatedAt: 'x' },
      { predictorId: 'A', matchId: 'm1', home: 0, away: 0, updatedAt: 'x' },
      { predictorId: 'B', matchId: 'm1', home: 2, away: 1, updatedAt: 'x' },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('shows who pips whom: a 2-1 hands Bob the exact and the lead', () => {
    const rows = scenarioBoard(base, 'm1', 2, 1);
    expect(rows[0]!.predictorId).toBe('B'); // Bob climbs to 1st
    expect(rows[0]!.gain).toBe(WC_POINTS.exact); // +5 from nailing 2-1
    expect(rows[0]!.movement).toBe(1); // up one place
    const ann = rows.find((r) => r.predictorId === 'A')!;
    expect(ann.gain).toBe(0); // 0-0 pick misses a 2-1
    expect(ann.movement).toBe(-1); // slips to 2nd
  });

  it('leaves the order unchanged when the leader also scores', () => {
    const rows = scenarioBoard(base, 'm1', 0, 0); // Ann nailed 0-0
    expect(rows[0]!.predictorId).toBe('A');
    expect(rows[0]!.gain).toBe(WC_POINTS.exact);
    expect(rows.every((r) => r.movement === 0)).toBe(true);
  });
});

describe('scorePrediction', () => {
  const cases: Array<[[number, number], [number, number], number, string]> = [
    [[2, 1], [2, 1], WC_POINTS.exact, 'exact'],
    [[0, 0], [0, 0], WC_POINTS.exact, 'exact'],
    [[2, 1], [3, 2], WC_POINTS.goalDiff, 'goalDiff'], // same +1 margin
    [[1, 1], [2, 2], WC_POINTS.goalDiff, 'goalDiff'], // correct draw, wrong score
    [[2, 0], [1, 0], WC_POINTS.outcome, 'outcome'], // home win, wrong margin
    [[0, 3], [1, 2], WC_POINTS.outcome, 'outcome'], // away win, wrong margin
    [[1, 1], [1, 0], WC_POINTS.close1, 'close'], // predicted draw, 1 goal off
    [[2, 1], [1, 2], WC_POINTS.close2, 'close'], // wrong winner, 2 goals off
    [[5, 0], [0, 3], WC_POINTS.miss, 'miss'], // way off
  ];
  it.each(cases)('%j vs %j → %i pts (%s)', (pred, actual, points, category) => {
    const r = scorePrediction(
      { home: pred[0], away: pred[1] },
      { home: actual[0], away: actual[1] },
    );
    expect(r.points).toBe(points);
    expect(r.category).toBe(category);
  });

  it('ranks closeness monotonically for a 2-1 actual', () => {
    const actual = { home: 2, away: 1 };
    const p = (h: number, a: number) => scorePrediction({ home: h, away: a }, actual).points;
    expect(p(2, 1)).toBe(5); // exact
    expect(p(3, 2)).toBe(4); // right margin
    expect(p(1, 0)).toBe(4); // right margin
    expect(p(5, 0)).toBe(3); // right winner
    expect(p(1, 1)).toBe(2); // draw, one off
    expect(p(0, 1)).toBe(1); // wrong winner, two off
    expect(p(0, 5)).toBe(0); // miss
  });
});

describe('predictions', () => {
  it('casts, upserts and reads a prediction', () => {
    let s = seed();
    const p = s.predictors[0]!;
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: p.id, home: 1, away: 0, now: NOW });
    expect(predictionFor(s, 'g-A-1', p.id)).toMatchObject({ home: 1, away: 0 });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: p.id, home: 3, away: 2, now: NOW });
    expect(
      s.predictions.filter((x) => x.matchId === 'g-A-1' && x.predictorId === p.id),
    ).toHaveLength(1);
    expect(predictionFor(s, 'g-A-1', p.id)).toMatchObject({ home: 3, away: 2 });
  });

  it('clears a pick before kickoff, but never once the match has started', () => {
    let s = seed();
    const p = s.predictors[0]!;
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: p.id, home: 0, away: 0, now: NOW });
    expect(predictionFor(s, 'g-A-1', p.id)).toBeTruthy();
    // Before kickoff (NOW = 2026-06-01) a mistaken pick can be removed.
    s = clearPrediction(s, 'g-A-1', p.id, NOW);
    expect(predictionFor(s, 'g-A-1', p.id)).toBeUndefined();
    // Clearing an absent pick is a harmless no-op.
    expect(clearPrediction(s, 'g-A-1', p.id, NOW).predictions).toHaveLength(0);
    // Re-predict; once the match has kicked off the pick is locked forever.
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: p.id, home: 1, away: 1, now: NOW });
    const afterKickoff = () => new Date('2026-07-01T00:00:00Z');
    expect(() => clearPrediction(s, 'g-A-1', p.id, afterKickoff)).toThrow(/kicked off/);
    // And of course once a result is in.
    const played = setResult(s, { matchId: 'g-A-1', home: 1, away: 0 });
    expect(() => clearPrediction(played, 'g-A-1', p.id)).toThrow(/locked/);
  });

  it('lets the organiser restore a pick after kickoff', () => {
    let s = seed();
    const p = s.predictors[0]!;
    const afterKickoff = () => new Date('2026-07-01T00:00:00Z');
    // Normal predicting is locked once the match has started.
    expect(() =>
      setPrediction(s, {
        matchId: 'g-A-1',
        predictorId: p.id,
        home: 1,
        away: 0,
        now: afterKickoff,
      }),
    ).toThrow(/locked/);
    // But the organiser can set/restore a pick to fix a glitch.
    s = adminSetPrediction(s, {
      matchId: 'g-A-1',
      predictorId: p.id,
      home: 1,
      away: 0,
      now: afterKickoff,
    });
    expect(predictionFor(s, 'g-A-1', p.id)).toMatchObject({ home: 1, away: 0 });
    // Upserts rather than duplicating.
    s = adminSetPrediction(s, {
      matchId: 'g-A-1',
      predictorId: p.id,
      home: 2,
      away: 2,
      now: afterKickoff,
    });
    expect(
      s.predictions.filter((x) => x.matchId === 'g-A-1' && x.predictorId === p.id),
    ).toHaveLength(1);
    expect(predictionFor(s, 'g-A-1', p.id)).toMatchObject({ home: 2, away: 2 });
  });

  it('clamps silly goal inputs', () => {
    let s = seed();
    const p = s.predictors[0]!;
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: p.id, home: -4, away: 250, now: NOW });
    expect(predictionFor(s, 'g-A-1', p.id)).toMatchObject({ home: 0, away: 99 });
  });

  it('rejects locked matches, unready knockouts and unknown ids', () => {
    const s = seed();
    const p = s.predictors[0]!;
    const played = setResult(s, { matchId: 'g-A-1', home: 1, away: 0 });
    expect(() =>
      setPrediction(played, { matchId: 'g-A-1', predictorId: p.id, home: 1, away: 0, now: NOW }),
    ).toThrow(/locked/);
    expect(() =>
      setPrediction(s, { matchId: 'r32-1', predictorId: p.id, home: 1, away: 0, now: NOW }),
    ).toThrow(/teams must be known/);
    expect(() =>
      setPrediction(s, { matchId: 'nope', predictorId: p.id, home: 1, away: 0, now: NOW }),
    ).toThrow(/Unknown match/);
    expect(() =>
      setPrediction(s, { matchId: 'g-A-1', predictorId: 'nope', home: 1, away: 0, now: NOW }),
    ).toThrow(/Unknown predictor/);
  });
});

describe('group standings', () => {
  it('orders by points, then goal difference, then goals for', () => {
    const s = playAllGroups(seed());
    const table = groupStandings(s, 'A');
    expect(table.map((r) => r.teamId)).toEqual(['MEX', 'RSA', 'KOR', 'CZE']);
    expect(table[0]).toMatchObject({
      points: 9,
      won: 3,
      goalsFor: 6,
      goalsAgainst: 0,
      goalDiff: 6,
    });
    expect(table[3]).toMatchObject({ points: 0, lost: 3, goalDiff: -6 });
    expect(groupComplete(s, 'A')).toBe(true);
    expect(allGroupsComplete(s)).toBe(true);
  });

  it('is incomplete until all six matches are played', () => {
    let s = seed();
    s = setResult(s, { matchId: 'g-A-1', home: 1, away: 0 });
    expect(groupComplete(s, 'A')).toBe(false);
    expect(allGroupsComplete(s)).toBe(false);
  });
});

describe('bracket population', () => {
  it('fills the Round of 32 from final group standings', () => {
    const s = playAllGroups(seed());
    const r32_1 = findMatch(s, 'r32-1')!;
    // W:A vs T:1 → group A winner vs the best third-placed team.
    expect(r32_1.homeId).toBe(seedOrder(s, 'A')[0]); // MEX
    expect(r32_1.awayId).toBe(thirdPlacedRanking(s)[0]!.teamId);
    // r32-9 is W:I vs R:J → group I winner vs group J runner-up.
    const r32_9 = findMatch(s, 'r32-9')!;
    expect(r32_9.homeId).toBe(seedOrder(s, 'I')[0]); // FRA
    expect(r32_9.awayId).toBe(seedOrder(s, 'J')[1]); // ALG
    // Every R32 slot is filled with a distinct team.
    const r32 = s.matches.filter((m) => m.stage === 'r32');
    const ids = r32.flatMap((m) => [m.homeId, m.awayId]);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(32);
  });

  it('takes exactly the eight best third-placed teams', () => {
    const s = playAllGroups(seed());
    const ranking = thirdPlacedRanking(s);
    expect(ranking).toHaveLength(12);
    const used = s.matches.filter((m) => m.awaySource?.kind === 'best-third').map((m) => m.awayId);
    expect(used).toHaveLength(8);
    expect(new Set(used)).toEqual(new Set(ranking.slice(0, 8).map((r) => r.teamId)));
  });

  it('advances winners through every round to the final', () => {
    let s = playAllGroups(seed());
    // Play each knockout round as a 1-0 home win, repopulating as we go.
    const playRound = (stage: string) => {
      for (const m of s.matches.filter((x) => x.stage === stage)) {
        s = setResult(s, { matchId: m.id, home: 1, away: 0 });
      }
    };
    playRound('r32');
    expect(findMatch(s, 'r16-1')!.homeId).toBe(findMatch(s, 'r32-1')!.homeId);
    playRound('r16');
    playRound('qf');
    playRound('sf');
    const final = findMatch(s, 'final-1')!;
    const third = findMatch(s, 'third-1')!;
    expect(isMatchReady(final)).toBe(true);
    expect(isMatchReady(third)).toBe(true);
    // Third-place play-off is contested by the beaten semi-finalists.
    expect(third.homeId).toBe(loserOf(findMatch(s, 'sf-1')!));
    expect(third.awayId).toBe(loserOf(findMatch(s, 'sf-2')!));
    s = setResult(s, { matchId: 'final-1', home: 2, away: 1 });
    expect(winnerOf(findMatch(s, 'final-1')!)).toBe(final.homeId);
  });

  it('requires an advancing team for a knockout draw', () => {
    const s = playAllGroups(seed());
    expect(() => setResult(s, { matchId: 'r32-1', home: 1, away: 1 })).toThrow(/advance/);
    const home = findMatch(s, 'r32-1')!.homeId!;
    const advanced = setResult(s, { matchId: 'r32-1', home: 1, away: 1, advancesId: home });
    expect(winnerOf(findMatch(advanced, 'r32-1')!)).toBe(home);
  });

  it('cascades when an upstream result is cleared', () => {
    let s = playAllGroups(seed());
    s = setResult(s, { matchId: 'r32-1', home: 3, away: 0 });
    expect(findMatch(s, 'r16-1')!.homeId).toBeTruthy();
    // Clearing a group A match unseats the group A winner → R32-1 empties, and
    // its now-orphaned result is dropped, which empties R16-1 too.
    s = clearResult(s, 'g-A-1');
    expect(groupComplete(s, 'A')).toBe(false);
    expect(findMatch(s, 'r32-1')!.homeId).toBeUndefined();
    expect(findMatch(s, 'r32-1')!.result).toBeUndefined();
    expect(findMatch(s, 'r16-1')!.homeId).toBeUndefined();
  });

  it('populateBracket is idempotent', () => {
    const s = playAllGroups(seed());
    expect(populateBracket(s)).toEqual(s);
  });
});

describe('leaderboard', () => {
  it('totals points and tallies exacts / correct results', () => {
    let s = seed();
    const [john, daniel] = s.predictors;
    // John nails it, Daniel gets the winner only.
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john!.id, home: 2, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: daniel!.id, home: 1, away: 0, now: NOW });
    s = setResult(s, { matchId: 'g-A-1', home: 2, away: 0 });

    const board = leaderboard(s);
    const johnRow = board.find((r) => r.predictorId === john!.id)!;
    const danielRow = board.find((r) => r.predictorId === daniel!.id)!;
    expect(johnRow).toMatchObject({
      points: WC_POINTS.exact,
      scored: 1,
      exact: 1,
      correctResults: 1,
    });
    expect(danielRow).toMatchObject({ points: WC_POINTS.outcome, exact: 0, correctResults: 1 });
    expect(board[0]!.predictorId).toBe(john!.id); // highest points first
  });

  it('ignores predictions for matches without a result', () => {
    let s = seed();
    const john = s.predictors[0]!;
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 1, away: 1, now: NOW });
    expect(leaderboard(s).every((r) => r.points === 0 && r.scored === 0)).toBe(true);
  });
});

describe('predictors', () => {
  it('adds, renames and removes (dropping their predictions)', () => {
    let s = seed();
    s = addPredictor(s, 'Mark');
    const mark = s.predictors.find((p) => p.name === 'Mark')!;
    expect(s.predictors).toHaveLength(5);
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: mark.id, home: 1, away: 0, now: NOW });
    s = renamePredictor(s, mark.id, 'Marky');
    expect(s.predictors.find((p) => p.id === mark.id)!.name).toBe('Marky');
    s = removePredictor(s, mark.id);
    expect(s.predictors).toHaveLength(4);
    expect(s.predictions.some((p) => p.predictorId === mark.id)).toBe(false);
  });

  it('rejects blank and duplicate names', () => {
    const s = seed();
    expect(() => addPredictor(s, '  ')).toThrow(/required/);
    expect(() => addPredictor(s, 'john')).toThrow(/already/i);
  });
});

describe('leaderboard stats', () => {
  /** Day 1: John nails g-A-1 (2-0), Daniel way off (0-0). */
  function afterDay1() {
    let s = seed();
    const [john, daniel] = s.predictors as [(typeof s.predictors)[0], (typeof s.predictors)[0]];
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 2, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: daniel.id, home: 0, away: 0, now: NOW });
    s = setResult(s, { matchId: 'g-A-1', home: 2, away: 0 });
    return { s, john, daniel };
  }

  it('finds the day champion and rank movement', () => {
    const day1 = afterDay1();
    let s = day1.s;
    const { john, daniel } = day1;
    expect(latestResultDay(s)).toBe('2026-06-11');
    expect(dayChampion(s)).toMatchObject({ day: '2026-06-11', name: 'John', points: 5 });
    let lb = leaderboardWithMovement(s);
    expect(lb[0]!.predictorId).toBe(john.id);
    expect(lb.every((r) => r.movement === 0)).toBe(true); // nothing to move from yet

    // Day 2 (g-A-2, next Malta day): Daniel exact 1-1, John misses → Daniel overtakes.
    s = setPrediction(s, { matchId: 'g-A-2', predictorId: daniel.id, home: 1, away: 1, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-2', predictorId: john.id, home: 4, away: 0, now: NOW });
    s = setResult(s, { matchId: 'g-A-2', home: 1, away: 1 });
    lb = leaderboardWithMovement(s);
    expect(lb[0]!.name).toBe('Daniel'); // 1 + 5 = 6 vs John 5 + 0 = 5
    expect(lb.find((r) => r.name === 'Daniel')!.movement).toBe(1); // climbed one
    expect(lb.find((r) => r.name === 'John')!.movement).toBe(-1);
    expect(dayChampion(s)).toMatchObject({ name: 'Daniel', points: 5 });
  });

  it('computes form, best/worst stats and badges', () => {
    const { s, john } = afterDay1();
    expect(playerForm(s, john.id)).toEqual(['exact']);
    expect(playerStats(s, john.id)).toMatchObject({
      points: 5,
      scored: 1,
      exact: 1,
      correctResults: 1,
      best: { matchId: 'g-A-1', points: 5 },
    });
    expect(badgesFor(s, john.id)).toEqual([]); // not enough yet

    // Three exact hits → eagle-eye + on-form + all-in.
    let t = seed();
    const j = t.predictors[0]!;
    for (const id of ['g-A-1', 'g-A-2', 'g-A-3']) {
      t = setPrediction(t, { matchId: id, predictorId: j.id, home: 2, away: 0, now: NOW });
      t = setResult(t, { matchId: id, home: 2, away: 0 });
    }
    const ids = badgesFor(t, j.id).map((b) => b.id);
    expect(ids).toContain('eagle-eye');
    expect(ids).toContain('on-form');
    expect(ids).toContain('all-in');
    expect(playerForm(t, j.id, 3)).toEqual(['exact', 'exact', 'exact']);
  });

  it('compares two predictors head-to-head', () => {
    const { s, john, daniel } = afterDay1();
    const h2h = headToHead(s, john.id, daniel.id);
    expect(h2h.rows).toHaveLength(1);
    expect(h2h).toMatchObject({ aTotal: 5, bTotal: 1 });
  });
});

describe('wcTimeline', () => {
  it('is empty until the first result lands', () => {
    const t = wcTimeline(seed());
    expect(t.days).toEqual([]);
    expect(t.players.every((p) => p.daysWon === 0 && p.total === 0 && p.streak === 0)).toBe(true);
  });

  it('tells the race day by day with winners, totals, ranks and movement', () => {
    let s = seed();
    const [john, daniel] = s.predictors as [(typeof s.predictors)[0], (typeof s.predictors)[0]];
    // Day 1 (g-A-1): John exact 2-0 (+5), Daniel right result 1-0 (+3). John wins.
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 2, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: daniel.id, home: 1, away: 0, now: NOW });
    s = setResult(s, { matchId: 'g-A-1', home: 2, away: 0 });
    // Day 2 (g-A-2): Daniel exact 1-1 (+5), John miss 4-0 (0). Daniel wins + overtakes.
    s = setPrediction(s, { matchId: 'g-A-2', predictorId: daniel.id, home: 1, away: 1, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-2', predictorId: john.id, home: 4, away: 0, now: NOW });
    s = setResult(s, { matchId: 'g-A-2', home: 1, away: 1 });

    const t = wcTimeline(s);
    expect(t.days.map((d) => d.day)).toEqual(['2026-06-11', '2026-06-12']);

    const day1 = t.days[0]!;
    expect(day1.winners).toEqual([john.id]);
    expect(day1.topPoints).toBe(5);
    expect(day1.matches).toBe(1);
    const j1 = day1.rows.find((r) => r.predictorId === john.id)!;
    expect(j1).toMatchObject({ total: 5, rank: 1, prevRank: null, movement: 0, wonDay: true });

    const day2 = t.days[1]!;
    expect(day2.winners).toEqual([daniel.id]);
    const d2 = day2.rows.find((r) => r.predictorId === daniel.id)!;
    expect(d2).toMatchObject({ dayPoints: 5, total: 8, rank: 1, movement: 1, wonDay: true });
    const j2 = day2.rows.find((r) => r.predictorId === john.id)!;
    expect(j2).toMatchObject({ dayPoints: 0, total: 5, rank: 2, movement: -1, wonDay: false });

    // Aggregate: a day each, Daniel ahead on total so leads the "days won" board.
    const players = Object.fromEntries(t.players.map((p) => [p.predictorId, p]));
    expect(players[john.id]).toMatchObject({ daysWon: 1, total: 5, streak: 0 });
    expect(players[daniel.id]).toMatchObject({
      daysWon: 1,
      total: 8,
      rank: 1,
      streak: 1, // won the most recent day
      bestDay: { day: '2026-06-12', points: 5 },
    });
    expect(t.players[0]!.predictorId).toBe(daniel.id);
  });

  it('hands every joint top scorer the day', () => {
    let s = seed();
    const [a, b] = s.predictors as [(typeof s.predictors)[0], (typeof s.predictors)[0]];
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: a.id, home: 2, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: b.id, home: 2, away: 0, now: NOW });
    s = setResult(s, { matchId: 'g-A-1', home: 2, away: 0 });
    const day = wcTimeline(s).days[0]!;
    expect(new Set(day.winners)).toEqual(new Set([a.id, b.id]));
    expect(day.topPoints).toBe(5);
  });
});

describe('playerGameLog + playerBreakdown', () => {
  it('logs every pick chronologically with its result, points and category', () => {
    let s = seed();
    const john = s.predictors[0]!;
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 2, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-2', predictorId: john.id, home: 4, away: 0, now: NOW });
    s = setResult(s, { matchId: 'g-A-1', home: 2, away: 0 }); // exact (+5)
    s = setResult(s, { matchId: 'g-A-2', home: 1, away: 1 }); // way off (miss)

    const log = playerGameLog(s, john.id);
    expect(log.map((e) => e.matchId)).toEqual(['g-A-1', 'g-A-2']); // chronological
    expect(log[0]).toMatchObject({ points: 5, category: 'exact' });
    expect(log[0]!.result).toEqual({ home: 2, away: 0 });
    expect(log[0]!.pred).toEqual({ home: 2, away: 0 });
    expect(log[1]).toMatchObject({ points: 0, category: 'miss' });
  });

  it('keeps an unresolved pick with a null result and zero points', () => {
    let s = seed();
    const john = s.predictors[0]!;
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 1, away: 0, now: NOW });
    const log = playerGameLog(s, john.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ result: null, points: 0, category: null });
  });

  it('summarises the accuracy distribution by category', () => {
    let s = seed();
    const john = s.predictors[0]!;
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 2, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-2', predictorId: john.id, home: 3, away: 1, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-3', predictorId: john.id, home: 0, away: 4, now: NOW });
    s = setResult(s, { matchId: 'g-A-1', home: 2, away: 0 }); // exact
    s = setResult(s, { matchId: 'g-A-2', home: 2, away: 0 }); // 3-1 → same +2 margin → goalDiff
    s = setResult(s, { matchId: 'g-A-3', home: 2, away: 0 }); // 0-4 → miss
    expect(playerBreakdown(s, john.id)).toEqual({
      exact: 1,
      goalDiff: 1,
      outcome: 0,
      close: 0,
      miss: 1,
    });
  });
});

describe('round awards', () => {
  /** Result every still-unplayed group match on matchday `md` (default 1-0), so a
   * whole matchday round completes. Explicitly-set results are left untouched. */
  function playMatchday(s: WorldCupState, md: number, home = 1, away = 0): WorldCupState {
    let next = s;
    for (const m of s.matches) {
      if (m.stage === 'group' && m.matchday === md && !m.result) {
        next = setResult(next, { matchId: m.id, home, away });
      }
    }
    return next;
  }

  it('gives no awards until a whole round completes', () => {
    let s = seed();
    const john = s.predictors[0]!;
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 2, away: 0, now: NOW });
    s = setResult(s, { matchId: 'g-A-1', home: 2, away: 0 });
    // Matchday 1 has 24 games across all groups; one result isn't a round.
    expect(roundAwards(s)).toEqual([]);
  });

  it('crowns the Player of the Round and the Wooden Spoon', () => {
    let s = seed();
    const [john, daniel] = s.predictors as [(typeof s.predictors)[0], (typeof s.predictors)[0]];
    // John nails both his matchday-1 picks (+5, +5); Daniel is a goal off on one (+1).
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 2, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-2', predictorId: john.id, home: 1, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: daniel.id, home: 0, away: 0, now: NOW });
    s = setResult(s, { matchId: 'g-A-1', home: 2, away: 0 });
    s = setResult(s, { matchId: 'g-A-2', home: 1, away: 0 });
    s = playMatchday(s, 1); // finish the rest of matchday 1

    const awards = roundAwards(s);
    expect(awards).toHaveLength(1); // only matchday 1 is complete
    const md1 = awards[0]!;
    expect(md1).toMatchObject({
      key: 'group-1',
      label: 'Group Matchday 1',
      stage: 'group',
      matchday: 1,
      matches: 24,
      participants: 2,
      topPoints: 10,
      lowPoints: 1,
    });
    expect(md1.winners).toEqual([john.id]);
    expect(md1.spoon).toEqual([daniel.id]);
  });

  it('awards no Wooden Spoon when participants tie', () => {
    let s = seed();
    const [a, b] = s.predictors as [(typeof s.predictors)[0], (typeof s.predictors)[0]];
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: a.id, home: 2, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: b.id, home: 2, away: 0, now: NOW });
    s = setResult(s, { matchId: 'g-A-1', home: 2, away: 0 });
    s = playMatchday(s, 1);
    const md1 = roundAwards(s)[0]!;
    expect(new Set(md1.winners)).toEqual(new Set([a.id, b.id])); // joint top
    expect(md1.spoon).toEqual([]); // level on points → no booby prize
  });

  it('returns completed rounds newest first', () => {
    let s = seed();
    const john = s.predictors[0]!;
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 1, away: 0, now: NOW });
    s = playMatchday(s, 1);
    s = playMatchday(s, 2);
    const awards = roundAwards(s);
    expect(awards.map((a) => a.key)).toEqual(['group-2', 'group-1']);
  });
});

describe('rivalry', () => {
  /** g-A-1 (2-0): John exact +5, Daniel result +3, Noel a goal off +1, Saviour out. */
  function spread() {
    let s = seed();
    const [john, daniel, noel, saviour] = s.predictors as [
      (typeof s.predictors)[0],
      (typeof s.predictors)[0],
      (typeof s.predictors)[0],
      (typeof s.predictors)[0],
    ];
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 2, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: daniel.id, home: 1, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: noel.id, home: 1, away: 1, now: NOW });
    s = setResult(s, { matchId: 'g-A-1', home: 2, away: 0 });
    return { s, john, daniel, noel, saviour };
  }

  it('reads the gap to the player above and below', () => {
    const { s, john, daniel, noel } = spread();
    const r = rivalry(s, daniel.id)!;
    expect(r).toMatchObject({ rank: 2, of: 4, points: 3 });
    expect(r.ahead).toEqual({ predictorId: john.id, name: 'John', gap: 2 });
    expect(r.behind).toEqual({ predictorId: noel.id, name: 'Noel', gap: 2 });
  });

  it('has no one ahead of the leader, no one behind the tail', () => {
    const { s, john, daniel, saviour } = spread();
    const leader = rivalry(s, john.id)!;
    expect(leader.ahead).toBeNull();
    expect(leader.behind).toMatchObject({ predictorId: daniel.id, gap: 2 });

    const tail = rivalry(s, saviour.id)!; // 0 pts, last
    expect(tail.behind).toBeNull();
    expect(tail.ahead!.gap).toBe(1); // Noel on 1
  });

  it('returns null for an unknown predictor', () => {
    expect(rivalry(seed(), 'nope')).toBeNull();
  });
});

describe('achievements', () => {
  const find = (s: WorldCupState, id: string, ach: string) =>
    achievements(s, id).find((a) => a.id === ach)!;

  it('starts every trophy locked, with a full cabinet count', () => {
    const s = seed();
    const john = s.predictors[0]!;
    expect(achievements(s, john.id).every((a) => !a.earned && a.have === 0)).toBe(true);
    expect(trophyCount(s, john.id)).toEqual({ earned: 0, total: 14 });
  });

  it('unlocks the basics: first points, then the exact-score tiers', () => {
    let s = seed();
    const john = s.predictors[0]!;
    for (const id of ['g-A-1', 'g-A-2', 'g-A-3']) {
      s = setPrediction(s, { matchId: id, predictorId: john.id, home: 2, away: 0, now: NOW });
      s = setResult(s, { matchId: id, home: 2, away: 0 }); // three exacts in a row
    }
    expect(find(s, john.id, 'off-the-mark').earned).toBe(true);
    expect(find(s, john.id, 'eagle-eye')).toMatchObject({ earned: true, have: 3, need: 3 });
    expect(find(s, john.id, 'oracle')).toMatchObject({ earned: false, have: 3, need: 5 });
    expect(find(s, john.id, 'on-form').earned).toBe(true); // 3 results right running
    expect(find(s, john.id, 'red-hot').earned).toBe(false); // needs 5
  });

  it('awards Giant killer for backing a ranked underdog winner', () => {
    let s = seed();
    const john = s.predictors[0]!;
    // g-A-1 is MEX (FIFA 14) v RSA (FIFA 60). John backs RSA; RSA win is an upset.
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 0, away: 2, now: NOW });
    s = setResult(s, { matchId: 'g-A-1', home: 0, away: 2 });
    expect(find(s, john.id, 'giant-killer')).toMatchObject({ earned: true, have: 1 });
  });

  it('awards Maverick only for an exact nobody else called', () => {
    let s = seed();
    const [john, daniel] = s.predictors as [(typeof s.predictors)[0], (typeof s.predictors)[0]];
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 3, away: 1, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: daniel.id, home: 2, away: 0, now: NOW });
    s = setResult(s, { matchId: 'g-A-1', home: 3, away: 1 });
    expect(find(s, john.id, 'maverick').earned).toBe(true);

    // Same scoreline shared with someone else → not a maverick.
    let t = seed();
    const [a, b] = t.predictors as [(typeof t.predictors)[0], (typeof t.predictors)[0]];
    t = setPrediction(t, { matchId: 'g-A-1', predictorId: a.id, home: 2, away: 0, now: NOW });
    t = setPrediction(t, { matchId: 'g-A-1', predictorId: b.id, home: 2, away: 0, now: NOW });
    t = setResult(t, { matchId: 'g-A-1', home: 2, away: 0 });
    expect(find(t, a.id, 'maverick').earned).toBe(false);
  });

  it('tracks Globetrotter progress across the 12 groups', () => {
    let s = seed();
    const john = s.predictors[0]!;
    const groups = [...new Set(s.teams.map((t) => t.group))]; // A..L
    groups.forEach((g, i) => {
      // The first match of each group is g-<G>-1.
      if (i < 11) {
        s = setPrediction(s, {
          matchId: `g-${g}-1`,
          predictorId: john.id,
          home: 1,
          away: 0,
          now: NOW,
        });
      }
    });
    expect(find(s, john.id, 'globetrotter')).toMatchObject({ earned: false, have: 11, need: 12 });
    s = setPrediction(s, {
      matchId: `g-${groups[11]}-1`,
      predictorId: john.id,
      home: 1,
      away: 0,
      now: NOW,
    });
    expect(find(s, john.id, 'globetrotter')).toMatchObject({ earned: true, have: 12 });
  });

  it('awards Crowd favourite once 10 reactions land on your picks', () => {
    let s = seed();
    const john = s.predictors[0]!;
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 1, away: 0, now: NOW });
    for (let i = 0; i < 10; i++) {
      s = togglePickReaction(s, 'g-A-1', john.id, '🔥', `fan-${i}`);
    }
    expect(find(s, john.id, 'crowd-favourite')).toMatchObject({ earned: true, have: 10 });
  });
});

describe('formTable (momentum)', () => {
  it('ranks by recent points and flags who is heating up', () => {
    let s = seed();
    const john = s.predictors[0]!;
    // g-A-1 (earlier kickoff) is a miss; g-A-2 (later) is exact.
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 0, away: 5, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-2', predictorId: john.id, home: 2, away: 0, now: NOW });
    s = setResult(s, { matchId: 'g-A-1', home: 2, away: 0 }); // miss (0)
    s = setResult(s, { matchId: 'g-A-2', home: 2, away: 0 }); // exact (5)

    const last1 = formTable(s, 1).find((r) => r.predictorId === john.id)!;
    expect(last1).toMatchObject({ points: 5, games: 1, form: ['exact'], trend: 'up' });

    const last5 = formTable(s, 5).find((r) => r.predictorId === john.id)!;
    expect(last5).toMatchObject({ points: 5, games: 2, form: ['exact', 'miss'], trend: 'flat' });
    expect(formTable(s, 5)[0]!.predictorId).toBe(john.id); // tops the form table
  });
});

describe('matchOfTheDay', () => {
  const mk = (
    id: string,
    homeId: string | undefined,
    awayId: string | undefined,
    kickoff: string,
    order: number,
    extra: Partial<WcMatch> = {},
  ): WcMatch => ({ id, stage: 'group', matchday: 1, order, kickoff, homeId, awayId, ...extra });

  const stateOf = (matches: WcMatch[]): WorldCupState => ({
    season: '2026',
    title: 'T',
    teams: [],
    matches,
    predictors: [],
    predictions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  it('hypes the biggest clash among the day’s fixtures, with reasons', () => {
    const s = stateOf([
      mk('past', 'ESP', 'FRA', '2026-06-09T00:00:00Z', 0), // already kicked off — ignored
      mk('big', 'BRA', 'MAR', '2026-06-11T00:00:00Z', 1), // FIFA 6 v 7 — heavyweight + even
      mk('small', 'RSA', 'KOR', '2026-06-11T03:00:00Z', 2), // FIFA 60 v 25
      mk('final', undefined, undefined, '2026-06-11T01:00:00Z', 3, {
        stage: 'final',
        homeSource: { kind: 'winner-match', matchId: 'sf-1' },
        awaySource: { kind: 'winner-match', matchId: 'sf-2' },
      }), // not ready — ignored despite the stage
    ]);
    const motd = matchOfTheDay(s, new Date('2026-06-10T00:00:00Z'))!;
    expect(motd.matchId).toBe('big');
    expect(motd.reasons).toContain('Top-10 heavyweight clash');
    expect(motd.reasons).toContain('Evenly matched');
    expect(motd.reasons).toContain('FIFA #6 vs #7');
  });

  it('stays on the soonest day, not a flashier match days out', () => {
    const s = stateOf([
      mk('today', 'RSA', 'KOR', '2026-06-19T18:00:00Z', 1), // minnows, but it kicks off today
      mk('later', 'BRA', 'MAR', '2026-06-21T18:00:00Z', 2), // heavyweight, two days away
    ]);
    // The heavyweight outscores today's tie on hype and sits inside the old 60h
    // window — but "Match of the Day" must headline today's fixture regardless.
    expect(matchOfTheDay(s, new Date('2026-06-19T08:00:00Z'))!.matchId).toBe('today');
  });

  it('looks ahead to the next match day when today has none', () => {
    const s = stateOf([
      mk('soonest', 'RSA', 'KOR', '2026-06-20T00:00:00Z', 1), // minnows, next match day
      mk('flashier', 'BRA', 'MAR', '2026-06-22T00:00:00Z', 2), // heavyweight, further out
    ]);
    // Nothing today → anchor on the soonest day with a match (06-20), not the
    // bigger fixture two days later.
    expect(matchOfTheDay(s, new Date('2026-06-01T00:00:00Z'))!.matchId).toBe('soonest');
  });

  it('returns null when nothing is upcoming', () => {
    const s = stateOf([mk('past', 'BRA', 'MAR', '2026-06-09T00:00:00Z', 0)]);
    expect(matchOfTheDay(s, new Date('2026-06-10T00:00:00Z'))).toBeNull();
  });
});

describe('setPickGif', () => {
  it('sets, replaces and clears one GIF per reactor on a pick', () => {
    let s = seed();
    const m = 'g-A-1';
    const owner = s.predictors[0]!.id;
    s = setPrediction(s, {
      matchId: m,
      predictorId: owner,
      home: 1,
      away: 0,
      now: () => new Date('2026-06-01T00:00:00Z'),
    });
    const gif = (id: string) => `https://media.giphy.com/media/${id}/giphy.gif`;

    s = setPickGif(s, m, owner, 'r1', gif('a'));
    s = setPickGif(s, m, owner, 'r2', gif('b'));
    let pick = s.predictions.find((p) => p.matchId === m && p.predictorId === owner)!;
    expect(pick.gifReactions).toEqual({ r1: gif('a'), r2: gif('b') });

    // Same reactor reacting again replaces (still one each).
    s = setPickGif(s, m, owner, 'r1', gif('c'));
    pick = s.predictions.find((p) => p.matchId === m && p.predictorId === owner)!;
    expect(pick.gifReactions!.r1).toBe(gif('c'));

    // Clearing removes the reactor, and the last one drops the key entirely.
    s = setPickGif(s, m, owner, 'r1', null);
    s = setPickGif(s, m, owner, 'r2', null);
    pick = s.predictions.find((p) => p.matchId === m && p.predictorId === owner)!;
    expect(pick.gifReactions).toBeUndefined();
  });

  it('is a no-op for a missing prediction', () => {
    const s = seed();
    expect(setPickGif(s, 'g-A-1', 'nobody', 'r1', 'x')).toBe(s);
  });
});

describe('toggleCardReaction', () => {
  it('adds then removes a reactor, keyed by match + winner, cleaning up', () => {
    let s = seed();
    expect(cardReactionsFor(s, 'g-A-1', 'p1')).toEqual({});
    s = toggleCardReaction(s, 'g-A-1', 'p1', '🔥', 'r1');
    s = toggleCardReaction(s, 'g-A-1', 'p1', '🔥', 'r2');
    expect(cardReactionsFor(s, 'g-A-1', 'p1')['🔥']).toEqual(['r1', 'r2']);
    // A different winner's card is independent.
    expect(cardReactionsFor(s, 'g-A-1', 'p2')).toEqual({});
    // Toggling the same reactor off empties the emoji, then the whole card key.
    s = toggleCardReaction(s, 'g-A-1', 'p1', '🔥', 'r1');
    s = toggleCardReaction(s, 'g-A-1', 'p1', '🔥', 'r2');
    expect(cardReactionsFor(s, 'g-A-1', 'p1')).toEqual({});
    expect(s.cardReactions).toEqual({});
  });
});

describe('banterAchievements', () => {
  const msg = (authorId: string, extra: Partial<Message> = {}): Message => ({
    id: `m${Math.random()}`,
    roomId: 'r',
    authorId,
    text: 'hi',
    createdAt: '2026-06-01T00:00:00.000Z',
    ...extra,
  });

  it('tracks comments, GIFs and the best-reacted comment for the right person', () => {
    const messages: Message[] = [
      msg('me', { reactions: { '🔥': ['a', 'b', 'c'] } }), // 3 reactions → Comedian earned
      msg('me', { text: '', gifUrl: 'https://media.giphy.com/media/x/giphy.gif' }),
      msg('me'),
      msg('other', { gifUrl: 'https://media.giphy.com/media/y/giphy.gif' }), // not mine
    ];
    const a = banterAchievements(messages, 'me');
    const by = (id: string) => a.find((x) => x.id === id)!;
    expect(by('chatterbox').have).toBe(3);
    expect(by('gif-lord').have).toBe(1);
    expect(by('comedian')).toMatchObject({ have: 3, need: 3, earned: true });
    expect(by('chatterbox').earned).toBe(false); // 3 < 15
  });

  it('is safe with no messages', () => {
    const a = banterAchievements(undefined, 'me');
    expect(a).toHaveLength(3);
    expect(a.every((x) => !x.earned && x.have === 0)).toBe(true);
  });
});

describe('banterPrompt', () => {
  const KICK = '2026-06-15T18:00:00Z';
  const before = new Date('2026-06-15T10:00:00Z');
  const after = new Date('2026-06-15T20:00:00Z');
  const mk = (extra: Partial<WcMatch> = {}): WcMatch => ({
    id: 'm1',
    stage: 'group',
    matchday: 1,
    order: 1,
    kickoff: KICK,
    homeId: 'BRA',
    awayId: 'ARG',
    ...extra,
  });
  const stateWith = (m: WcMatch, predictions: WorldCupState['predictions']): WorldCupState => ({
    season: '2026',
    title: 'T',
    teams: [],
    matches: [m],
    predictors: [
      { id: 'p1', name: 'Ada' },
      { id: 'p2', name: 'Bo' },
    ],
    predictions,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  const pick = (
    predictorId: string,
    home: number,
    away: number,
  ): WorldCupState['predictions'][number] => ({
    matchId: 'm1',
    predictorId,
    home,
    away,
    updatedAt: KICK,
  });

  it('salutes the exact callers at full-time', () => {
    const s = stateWith(mk({ result: { home: 2, away: 1 } }), [pick('p1', 2, 1), pick('p2', 0, 0)]);
    expect(banterPrompt(s, 'm1', after)).toBe('🎯 Ada called the 2–1!');
  });

  it('marvels at the chaos when nobody nailed it', () => {
    const s = stateWith(mk({ result: { home: 2, away: 1 } }), [pick('p1', 0, 0)]);
    expect(banterPrompt(s, 'm1', after)).toBe('🙈 Nobody saw 2–1 coming.');
  });

  it('ribs a bold pick once the match has kicked off', () => {
    const s = stateWith(mk(), [pick('p1', 4, 3)]);
    expect(banterPrompt(s, 'm1', after)).toBe('😅 Ada went 4–3 here — brave.');
  });

  it('never reveals picks before kickoff — nudges stragglers instead', () => {
    const s = stateWith(mk(), [pick('p1', 4, 3)]);
    // Bo still hasn't picked; Ada's bold 4-3 must NOT leak pre-kickoff.
    const prompt = banterPrompt(s, 'm1', before);
    expect(prompt).toBe('⏳ Still waiting on Bo to call it…');
    expect(prompt).not.toContain('4');
  });
});

describe('setCardBadge', () => {
  it('sets and clears a predictor’s badge without touching others', () => {
    let s = seed();
    const a = s.predictors[0]!;
    const b = s.predictors[1]!;
    s = setCardBadge(s, a.id, 12345);
    expect(s.predictors.find((p) => p.id === a.id)!.cardBadge).toBe(12345);
    expect(s.predictors.find((p) => p.id === b.id)!.cardBadge).toBeUndefined();
    s = setCardBadge(s, a.id, undefined);
    expect(s.predictors.find((p) => p.id === a.id)!.cardBadge).toBeUndefined();
  });
});

describe('nudges', () => {
  it('lists who still needs to predict and what locks soon', () => {
    let s = seed();
    const p = s.predictors[0]!;
    const early = new Date('2026-06-01T00:00:00Z');
    expect(pendingPredictors(s, 'g-A-1', early)).toHaveLength(4); // nobody picked yet
    expect(pendingForMe(s, p.id, early)).toHaveLength(72); // every group match is open

    s = setPrediction(s, {
      matchId: 'g-A-1',
      predictorId: p.id,
      home: 1,
      away: 0,
      now: () => early,
    });
    expect(pendingForMe(s, p.id, early)).toHaveLength(71);
    expect(pendingPredictors(s, 'g-A-1', early).map((x) => x.id)).not.toContain(p.id);

    // Locking soon = unpicked matches within 6h of now (opener kicks off 19:00Z).
    const justBefore = new Date('2026-06-11T15:00:00Z');
    expect(lockingSoon(s, s.predictors[1]!.id, justBefore).map((m) => m.id)).toContain('g-A-1');

    // Once a match has kicked off it drops off the pending lists.
    const after = new Date('2026-06-12T00:00:00Z');
    expect(pendingPredictors(s, 'g-A-1', after)).toHaveLength(0);
  });
});

describe('live results', () => {
  it('auto-fills finished feed scores into empty matches', () => {
    let s = seed();
    s = applyLiveResults(s, [
      { homeTla: 'MEX', awayTla: 'RSA', status: 'FINISHED', home: 2, away: 1, winner: 'HOME_TEAM' },
      { homeTla: 'KOR', awayTla: 'CZE', status: 'TIMED', home: null, away: null }, // ignored
    ]);
    expect(findMatch(s, 'g-A-1')!.result).toMatchObject({ home: 2, away: 1 });
    expect(findMatch(s, 'g-A-2')!.result).toBeUndefined();
  });

  it('never overwrites an existing result and is idempotent', () => {
    const base = setResult(seed(), { matchId: 'g-A-1', home: 0, away: 0 });
    const scores = [
      { homeTla: 'MEX', awayTla: 'RSA', status: 'FINISHED', home: 2, away: 1, winner: 'HOME_TEAM' },
    ];
    expect(applyLiveResults(base, scores)).toEqual(base); // existing result kept
    const once = applyLiveResults(seed(), scores);
    expect(applyLiveResults(once, scores)).toEqual(once); // idempotent
  });
});

describe('calendar + labels', () => {
  it('groups matches by day and finds the default day', () => {
    const s = seed();
    const day = tournamentDays(s)[0]!;
    expect(matchesOn(s, day).length).toBeGreaterThan(0);
    // Mid-tournament "now" lands on the soonest day with matches.
    expect(defaultDay(s, new Date('2026-06-15T00:00:00Z'))).toBe('2026-06-15');
    // After everything, fall back to the last day.
    expect(defaultDay(s, new Date('2027-01-01T00:00:00Z'))).toBe('2026-07-19');
  });

  it('labels unresolved knockout slots helpfully', () => {
    const s = seed();
    const r32_1 = findMatch(s, 'r32-1')!;
    expect(sourceLabel(r32_1.homeSource)).toBe('Winner Group A');
    expect(slotLabel(s, undefined, r32_1.homeSource)).toBe('Winner Group A');
    expect(sourceLabel(findMatch(s, 'r32-9')!.awaySource)).toBe('Runner-up Group J');
    expect(sourceLabel(findMatch(s, 'final-1')!.homeSource)).toBe('Winner of SF 1');
  });

  it('locks a match at kickoff, and once it has a result', () => {
    let s = seed();
    const early = new Date('2026-06-01T00:00:00Z');
    const late = new Date('2026-07-01T00:00:00Z');
    expect(isMatchLocked(findMatch(s, 'g-A-1')!, early)).toBe(false); // before kickoff
    expect(isMatchLocked(findMatch(s, 'g-A-1')!, late)).toBe(true); // after kickoff
    s = setResult(s, { matchId: 'g-A-1', home: 1, away: 1 });
    expect(isMatchLocked(findMatch(s, 'g-A-1')!, early)).toBe(true); // result locks regardless
  });
});

describe('match reactions', () => {
  it('adds, then removes a match reaction for the same predictor (immutably)', () => {
    const s = seed();
    const added = toggleMatchReaction(s, 'g-A-1', '🔥', 'p1');
    expect(added).not.toBe(s);
    expect(added.matchReactions!['g-A-1']).toEqual({ '🔥': ['p1'] });
    expect(s.matchReactions).toBeUndefined(); // original untouched

    const removed = toggleMatchReaction(added, 'g-A-1', '🔥', 'p1');
    expect(removed.matchReactions!['g-A-1']).toBeUndefined(); // emptied match dropped
  });

  it('accumulates distinct predictors under one emoji', () => {
    let s = toggleMatchReaction(seed(), 'g-A-1', '🎉', 'p1');
    s = toggleMatchReaction(s, 'g-A-1', '🎉', 'p2');
    expect(s.matchReactions!['g-A-1']!['🎉']).toEqual(['p1', 'p2']);
  });
});

describe('pick reactions', () => {
  it('toggles a reaction on the right prediction only, immutably', () => {
    let s = seed();
    const [john, daniel] = s.predictors as [(typeof s.predictors)[0], (typeof s.predictors)[0]];
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 2, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-2', predictorId: john.id, home: 1, away: 1, now: NOW });

    const reacted = togglePickReaction(s, 'g-A-1', john.id, '🔥', daniel.id);
    expect(reacted).not.toBe(s);
    const onA1 = reacted.predictions.find(
      (p) => p.matchId === 'g-A-1' && p.predictorId === john.id,
    );
    const onA2 = reacted.predictions.find(
      (p) => p.matchId === 'g-A-2' && p.predictorId === john.id,
    );
    expect(onA1!.reactions).toEqual({ '🔥': [daniel.id] });
    expect(onA2!.reactions).toBeUndefined(); // other pick untouched

    const off = togglePickReaction(reacted, 'g-A-1', john.id, '🔥', daniel.id);
    expect(
      off.predictions.find((p) => p.matchId === 'g-A-1' && p.predictorId === john.id)!.reactions,
    ).toBeUndefined();
  });

  it('is a no-op when the prediction does not exist', () => {
    const s = seed();
    expect(togglePickReaction(s, 'g-A-1', s.predictors[0]!.id, '🔥', s.predictors[1]!.id)).toBe(s);
  });
});

describe('crowd pulse', () => {
  it('counts predictions and finds the consensus scoreline', () => {
    let s = seed();
    const [a, b, c, d] = s.predictors as [
      (typeof s.predictors)[0],
      (typeof s.predictors)[0],
      (typeof s.predictors)[0],
      (typeof s.predictors)[0],
    ];
    expect(predictionCount(s, 'g-A-1')).toBe(0);
    expect(consensusScore(s, 'g-A-1')).toBeNull();

    // Two pick 2-0, two pick 1-1 → a tie; tie-break favours the lower scoreline.
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: a.id, home: 2, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: b.id, home: 2, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: c.id, home: 1, away: 1, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: d.id, home: 1, away: 1, now: NOW });
    expect(predictionCount(s, 'g-A-1')).toBe(4);
    expect(consensusScore(s, 'g-A-1')).toEqual({ home: 1, away: 1, count: 2 });

    // A clear favourite wins outright.
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: c.id, home: 2, away: 0, now: NOW });
    expect(consensusScore(s, 'g-A-1')).toEqual({ home: 2, away: 0, count: 3 });
  });

  it('finds the closest pick against any (live) score', () => {
    let s = seed();
    const [a, b] = s.predictors as [(typeof s.predictors)[0], (typeof s.predictors)[0]];
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: a.id, home: 1, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: b.id, home: 3, away: 0, now: NOW });
    // Live 1-0 → a is spot on; b only has the right winner.
    expect(closestToScore(s, 'g-A-1', 1, 0)).toEqual([a.id]);
    // A 0-5 turnaround → both miss by miles, nobody is "closest".
    expect(closestToScore(s, 'g-A-1', 0, 5)).toEqual([]);
  });

  it('crowns the closest predictor(s), and nobody on a whole-squad miss', () => {
    let s = seed();
    const [a, b] = s.predictors as [(typeof s.predictors)[0], (typeof s.predictors)[0]];
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: a.id, home: 2, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: b.id, home: 2, away: 0, now: NOW });
    expect(closestPredictors(s, 'g-A-1')).toEqual([]); // no result yet

    s = setResult(s, { matchId: 'g-A-1', home: 2, away: 0 });
    expect(closestPredictors(s, 'g-A-1').sort()).toEqual([a.id, b.id].sort()); // both exact

    // A scoreline nobody got within scoring range of → no crown.
    let miss = seed();
    const m = miss.predictors[0]!;
    miss = setPrediction(miss, { matchId: 'g-A-1', predictorId: m.id, home: 0, away: 5, now: NOW });
    miss = setResult(miss, { matchId: 'g-A-1', home: 5, away: 0 });
    expect(closestPredictors(miss, 'g-A-1')).toEqual([]);
  });
});

describe('team context', () => {
  it('has no position before any game and reports position + form after', () => {
    const fresh = seed();
    const winnerId = seedOrder(fresh, 'A')[0]!; // MEX tops Group A in playAllGroups
    // A known team pre-play: a record with no position yet (UI hides it).
    expect(teamRecord(fresh, winnerId)).toMatchObject({ position: null, played: 0, form: [] });

    const s = playAllGroups(fresh);
    const top = teamRecord(s, winnerId)!;
    expect(top).toMatchObject({ group: 'A', position: 1, played: 3, won: 3, lost: 0 });
    // Won all three 2-0 → goals, diff, points and clean sheets all follow.
    expect(top).toMatchObject({
      goalsFor: 6,
      goalsAgainst: 0,
      goalDiff: 6,
      points: 9,
      cleanSheets: 3,
    });
    expect(top.form).toEqual(['W', 'W', 'W']);

    const thirdId = seedOrder(fresh, 'A')[2]!;
    expect(teamRecord(s, thirdId)!.position).toBe(3);
    expect(teamRecord(s, undefined)).toBeNull();
  });
});

describe('group outlook (permutations)', () => {
  it('is wide open before any game and exact once decided', () => {
    const fresh = seed();
    const open = groupOutlook(fresh, 'A');
    expect(open).toHaveLength(4);
    // Anyone can still finish anywhere; nobody is through or out yet.
    expect(open.every((r) => r.bestPosition === 1 && r.worstPosition === 4)).toBe(true);
    expect(open.every((r) => r.canFinishTop2 && !r.guaranteedTop2 && !r.decided)).toBe(true);

    const done = groupOutlook(playAllGroups(fresh), 'A');
    expect(done.every((r) => r.decided)).toBe(true);
    expect(done.filter((r) => r.guaranteedTop2)).toHaveLength(2);
    const winner = seedOrder(fresh, 'A')[0]!; // MEX tops the group
    const last = seedOrder(fresh, 'A')[3]!; // CZE props it up
    expect(done.find((r) => r.teamId === winner)).toMatchObject({
      bestPosition: 1,
      worstPosition: 1,
      guaranteedTop2: true,
    });
    expect(done.find((r) => r.teamId === last)).toMatchObject({
      bestPosition: 4,
      worstPosition: 4,
      canFinishTop2: false,
    });
  });

  it('narrows the range as a game is played', () => {
    const state: WorldCupState = {
      season: '2026',
      title: 't',
      teams: [
        { id: 'X', name: 'X', flag: '', group: 'Z' },
        { id: 'Y', name: 'Y', flag: '', group: 'Z' },
      ],
      matches: [
        {
          id: 'z1',
          stage: 'group',
          group: 'Z',
          matchday: 1,
          order: 0,
          kickoff: '2026-06-11T00:00:00Z',
          homeId: 'X',
          awayId: 'Y',
        },
      ],
      predictors: [],
      predictions: [],
      createdAt: '2026-01-01T00:00:00Z',
    };
    expect(groupOutlook(state, 'Z').find((r) => r.teamId === 'X')).toMatchObject({
      bestPosition: 1,
      worstPosition: 2,
      decided: false,
    });
    const played = setResult(state, { matchId: 'z1', home: 1, away: 0 });
    expect(groupOutlook(played, 'Z').find((r) => r.teamId === 'X')).toMatchObject({
      bestPosition: 1,
      worstPosition: 1,
      guaranteedTop2: true,
      decided: true,
    });
  });
});

describe('third-place contention (teamsOutOfContention)', () => {
  const ISO = '2026-06-01T00:00:00Z';

  /** numStrong groups whose third-placed team sits on 3 pts / 0 GD, plus one
   * target group where two leaders win twice and two trailers lose twice (GD −4)
   * with a game left — so a trailer's best case is 3 pts with a poor GD. */
  function mkContention(numStrong: number): WorldCupState {
    const teams: WorldCupState['teams'] = [];
    const matches: WorldCupState['matches'] = [];
    let mid = 0;
    const add = (group: string, home: string, away: string, hg?: number, ag?: number) => {
      matches.push({
        id: `m${mid++}`,
        stage: 'group',
        group,
        matchday: 1,
        order: mid,
        kickoff: ISO,
        homeId: home,
        awayId: away,
        ...(hg === undefined ? {} : { result: { home: hg, away: ag! } }),
      });
    };
    // Strong groups: three teams in a 1–0 cycle → each finishes on 3 pts, GD 0.
    for (let i = 0; i < numStrong; i++) {
      const g = `S${i}`;
      const [p, q, r] = [`${g}p`, `${g}q`, `${g}r`];
      teams.push({ id: p, name: p, flag: '', group: g });
      teams.push({ id: q, name: q, flag: '', group: g });
      teams.push({ id: r, name: r, flag: '', group: g });
      add(g, p, q, 1, 0);
      add(g, q, r, 1, 0);
      add(g, r, p, 1, 0);
    }
    // Target group A.
    for (const id of ['A1', 'A2', 'A3', 'TT']) teams.push({ id, name: id, flag: '', group: 'A' });
    add('A', 'A1', 'A3', 2, 0);
    add('A', 'A2', 'TT', 2, 0);
    add('A', 'A1', 'TT', 2, 0);
    add('A', 'A2', 'A3', 2, 0);
    add('A', 'A1', 'A2'); // unplayed
    add('A', 'A3', 'TT'); // unplayed
    return {
      season: '2026',
      title: 't',
      teams,
      matches,
      predictors: [],
      predictions: [],
      createdAt: ISO,
    };
  }

  it('writes off a side that can still reach 3 points but trails 8 better thirds on GD', () => {
    const out = teamsOutOfContention(mkContention(8));
    // Both trailers can mathematically reach 3 pts (win their last game) yet are
    // a worse third than the eight strong groups → eliminated, not "hopeful".
    expect(out.has('TT')).toBe(true);
    expect(out.has('A3')).toBe(true);
    // Group leaders can still finish top two — never out.
    expect(out.has('A1')).toBe(false);
    expect(out.has('A2')).toBe(false);
    // The qualifying thirds themselves survive.
    expect(out.has('S0r')).toBe(false);
  });

  it('keeps them alive when only 7 better thirds exist (8 thirds still advance)', () => {
    const out = teamsOutOfContention(mkContention(7));
    expect(out.has('TT')).toBe(false);
    expect(out.has('A3')).toBe(false);
  });

  it('writes off nobody before any game is played', () => {
    expect(teamsOutOfContention(seed()).size).toBe(0);
  });
});

describe('fifa ranking', () => {
  it('looks up known team codes, omitting unconfirmed ones', () => {
    expect(fifaRankOf('ARG')).toBe(1);
    expect(fifaRankOf('BRA')).toBe(6);
    expect(fifaRankOf('AUS')).toBeUndefined();
    expect(fifaRankOf(undefined)).toBeUndefined();
  });
});

describe('live leaderboard', () => {
  it('folds in-play games into the totals as it stands', () => {
    let s = seed();
    const [a, b] = s.predictors as [(typeof s.predictors)[0], (typeof s.predictors)[0]];
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: a.id, home: 1, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: b.id, home: 0, away: 2, now: NOW });
    // No result yet → everyone on zero.
    expect(leaderboard(s).find((r) => r.predictorId === a.id)!.points).toBe(0);
    // Live 1-0 → a is spot on (5), b is miles off (0).
    const lb = leaderboard(s, { liveScores: { 'g-A-1': { home: 1, away: 0 } } });
    expect(lb.find((r) => r.predictorId === a.id)!.points).toBe(5);
    expect(lb.find((r) => r.predictorId === b.id)!.points).toBe(0);
  });
});

describe('altitude & climate', () => {
  it('looks up nation and venue climate', () => {
    expect(teamClimate('ECU')!.altitude).toBeGreaterThan(2000); // Quito
    expect(teamClimate('MEX')!.altitude).toBeGreaterThan(2000);
    expect(venueClimate('Mexico City')!.altitude).toBeGreaterThan(2000);
    expect(venueClimate('Houston')!.tempC).toBeGreaterThanOrEqual(30);
    expect(teamClimate('XXX')).toBeUndefined();
    expect(venueClimate(undefined)).toBeUndefined();
  });

  it('awards altitude/heat edges only where the venue stresses them', () => {
    const mountain = { altitude: 2640, tempC: 14 };
    const lowland = { altitude: 20, tempC: 12 };
    const desert = { altitude: 600, tempC: 28 };
    const cold = { altitude: 20, tempC: 8 };
    const high = venueClimate('Mexico City')!; // 2240 m
    const hot = venueClimate('Monterrey')!; // 35 °C
    const mild = venueClimate('Vancouver')!; // low + ~22 °C

    // High venue → the side used to altitude.
    expect(climateEdge(mountain, lowland, high).altitude).toBe('home');
    expect(climateEdge(lowland, mountain, high).altitude).toBe('away');
    // Hot venue → the hotter-climate side.
    expect(climateEdge(desert, cold, hot).heat).toBe('home');
    // Mild venue → neither axis is decisive.
    expect(climateEdge(mountain, desert, mild)).toEqual({ altitude: null, heat: null });
    // Two lowland sides at a high venue → nobody is "built for altitude".
    expect(climateEdge(lowland, { altitude: 200, tempC: 9 }, high).altitude).toBeNull();
  });
});

describe('champion pick (predict the winner)', () => {
  function withKo(stage: string, result?: { home: number; away: number }): WorldCupState {
    return {
      season: '2026',
      title: 't',
      teams: [
        { id: 'BRA', name: 'Brazil', flag: '', group: 'A' },
        { id: 'OPP', name: 'Opp', flag: '', group: 'B' },
      ],
      matches: [
        {
          id: `${stage}-1`,
          stage: stage as WorldCupState['matches'][number]['stage'],
          order: 0,
          kickoff: '2026-07-01T00:00:00Z',
          homeId: 'BRA',
          awayId: 'OPP',
          result,
        },
      ],
      predictors: [{ id: 'p1', name: 'A' }],
      predictions: [],
      createdAt: '2026-01-01T00:00:00Z',
    };
  }

  it('scores a champion pick by how far the team runs', () => {
    expect(championBonusFor(withKo('r16'), 'BRA')).toBe(0);
    expect(championBonusFor(withKo('qf'), 'BRA')).toBe(3);
    expect(championBonusFor(withKo('sf'), 'BRA')).toBe(6);
    expect(championBonusFor(withKo('final'), 'BRA')).toBe(12); // finalist, not yet played
    expect(championBonusFor(withKo('final', { home: 2, away: 0 }), 'BRA')).toBe(30); // won it
    expect(championBonusFor(withKo('final', { home: 0, away: 2 }), 'BRA')).toBe(12); // lost it
    expect(championTeam(withKo('final', { home: 2, away: 0 }))).toBe('BRA');
  });

  it('folds the bonus into the leaderboard total', () => {
    const s = withKo('final', { home: 1, away: 0 });
    const lb = leaderboard({ ...s, championPicks: { p1: 'BRA' } });
    expect(lb[0]).toMatchObject({ predictorId: 'p1', bonus: 30, points: 30 });
  });

  it('sets, changes and clears a pick until the knockouts start', () => {
    let s = seed();
    const p = s.predictors[0]!;
    const before = () => new Date('2026-06-01T00:00:00Z');
    s = setChampionPick(s, p.id, 'BRA', before);
    expect(s.championPicks![p.id]).toBe('BRA');
    s = setChampionPick(s, p.id, 'ARG', before); // change
    expect(s.championPicks![p.id]).toBe('ARG');
    s = clearChampionPick(s, p.id);
    expect(s.championPicks![p.id]).toBeUndefined();
    expect(() => setChampionPick(s, p.id, 'XYZ', before)).toThrow(/team/i);
  });

  it('locks once the knockouts kick off', () => {
    const s = seed();
    expect(isChampionLocked(s, new Date('2026-06-01T00:00:00Z'))).toBe(false);
    expect(isChampionLocked(s, new Date('2026-07-15T00:00:00Z'))).toBe(true);
    expect(() =>
      setChampionPick(s, s.predictors[0]!.id, 'BRA', () => new Date('2026-07-15')),
    ).toThrow(/locked/);
  });
});

describe('removePredictor scrubbing', () => {
  it('removes the predictor and scrubs their reactions everywhere', () => {
    let s = seed();
    const [john, daniel] = s.predictors as [(typeof s.predictors)[0], (typeof s.predictors)[0]];
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 1, away: 0, now: NOW });
    // Daniel reacts to John's pick and to the match itself, then leaves.
    s = togglePickReaction(s, 'g-A-1', john.id, '🔥', daniel.id);
    s = toggleMatchReaction(s, 'g-A-1', '😱', daniel.id);

    s = removePredictor(s, daniel.id);
    expect(s.predictors.some((p) => p.id === daniel.id)).toBe(false);
    const johnsPick = s.predictions.find((p) => p.predictorId === john.id)!;
    expect(johnsPick.reactions).toBeUndefined(); // Daniel's reaction scrubbed
    expect(s.matchReactions!['g-A-1']).toBeUndefined(); // emptied tally dropped
  });
});

describe('tournamentScorers', () => {
  const ev = (
    kind: WcMatchEvent['kind'],
    teamTla: string,
    player: string,
    assist?: string,
  ): WcMatchEvent => ({
    minute: "1'",
    kind,
    teamTla,
    player,
    assist,
  });

  it('ranks by goals, then assists, then name; penalties count, own goals do not', () => {
    const events: WcMatchEvent[] = [
      ev('goal', 'FRA', 'Mbappé', 'Griezmann'),
      ev('pen-goal', 'FRA', 'Mbappé'),
      ev('goal', 'ARG', 'Messi', 'Mbappé'), // Mbappé also picks up an assist
      ev('goal', 'ARG', 'Messi'),
      ev('own-goal', 'ENG', 'Maguire'), // own goal credits nobody a goal
      ev('yellow', 'FRA', 'Kanté'), // cards are irrelevant here
    ];
    const table = tournamentScorers(events);
    // Messi & Mbappé both on 2 goals; Mbappé has an assist so he ranks first.
    expect(table.map((s) => s.name)).toEqual(['Mbappé', 'Messi', 'Griezmann']);
    expect(table[0]).toMatchObject({ name: 'Mbappé', teamTla: 'FRA', goals: 2, assists: 1 });
    expect(table[1]).toMatchObject({ name: 'Messi', teamTla: 'ARG', goals: 2, assists: 0 });
    expect(table[2]).toMatchObject({ name: 'Griezmann', goals: 0, assists: 1 });
    // Maguire's own goal didn't put him on the board.
    expect(table.some((s) => s.name === 'Maguire')).toBe(false);
  });

  it('is empty when there are no goals or assists', () => {
    expect(tournamentScorers([ev('yellow', 'FRA', 'Kanté')])).toEqual([]);
    expect(tournamentScorers([])).toEqual([]);
  });
});
