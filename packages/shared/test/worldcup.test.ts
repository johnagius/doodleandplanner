import { describe, expect, it } from 'vitest';
import {
  WC_POINTS,
  addPredictor,
  allGroupsComplete,
  applyLiveResults,
  badgesFor,
  championBonusFor,
  championTeam,
  clearChampionPick,
  clearPrediction,
  clearResult,
  closestPredictors,
  consensusScore,
  isChampionLocked,
  setChampionPick,
  dayChampion,
  headToHead,
  latestResultDay,
  leaderboardWithMovement,
  lockingSoon,
  pendingForMe,
  pendingPredictors,
  playerForm,
  playerStats,
  predictionCount,
  teamRecord,
  toggleMatchReaction,
  togglePickReaction,
  defaultDay,
  findMatch,
  groupComplete,
  groupOutlook,
  groupStandings,
  isMatchLocked,
  isMatchReady,
  leaderboard,
  loserOf,
  matchDateKey,
  matchesOn,
  populateBracket,
  predictionFor,
  removePredictor,
  renamePredictor,
  scorePrediction,
  seedWorldCup,
  setPrediction,
  setResult,
  slotLabel,
  sourceLabel,
  thirdPlacedRanking,
  tournamentDays,
  winnerOf,
  type WorldCupState,
} from '../src/worldcup.js';

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

  it('clears a pick (mistaken entry) until the result is in', () => {
    let s = seed();
    const p = s.predictors[0]!;
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: p.id, home: 0, away: 0, now: NOW });
    expect(predictionFor(s, 'g-A-1', p.id)).toBeTruthy();
    s = clearPrediction(s, 'g-A-1', p.id);
    expect(predictionFor(s, 'g-A-1', p.id)).toBeUndefined();
    // Clearing an absent pick is a harmless no-op.
    expect(clearPrediction(s, 'g-A-1', p.id).predictions).toHaveLength(0);
    // Once the score is recorded the pick is locked.
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: p.id, home: 1, away: 1, now: NOW });
    const played = setResult(s, { matchId: 'g-A-1', home: 1, away: 0 });
    expect(() => clearPrediction(played, 'g-A-1', p.id)).toThrow(/locked/);
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
    // Won all three 2-0 → goals, diff and points all follow.
    expect(top).toMatchObject({ goalsFor: 6, goalsAgainst: 0, goalDiff: 6, points: 9 });
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
