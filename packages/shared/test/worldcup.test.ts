import { describe, expect, it } from 'vitest';
import {
  WC_POINTS,
  addPredictor,
  allGroupsComplete,
  clearPrediction,
  clearResult,
  defaultDay,
  findMatch,
  groupComplete,
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
