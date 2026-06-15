import { describe, expect, it } from 'vitest';
import {
  WC_STAKE,
  americanToDecimal,
  bankroll,
  bankrollLeaderboard,
  betsFor,
  outcomeOf,
} from '../src/betting.js';
import {
  captureOdds,
  seedWorldCup,
  setPrediction,
  setResult,
  type WcLiveScore,
  type WorldCupState,
} from '../src/worldcup.js';

const NOW = () => new Date('2026-06-01T00:00:00Z');

/** A live-feed row carrying odds for a board match, keyed by team code. */
function oddsRow(homeTla: string, awayTla: string, odds: WcLiveScore['odds']): WcLiveScore {
  return { homeTla, awayTla, status: 'SCHEDULED', home: null, away: null, odds };
}

describe('odds maths', () => {
  it('converts american moneyline to decimal', () => {
    expect(americanToDecimal(100)).toBeCloseTo(2);
    expect(americanToDecimal(260)).toBeCloseTo(3.6);
    expect(americanToDecimal(-150)).toBeCloseTo(1.6667, 3);
    expect(americanToDecimal(-1400)).toBeCloseTo(1.0714, 3);
  });

  it('reads the 1X2 outcome of a scoreline', () => {
    expect(outcomeOf(2, 0)).toBe('home');
    expect(outcomeOf(1, 1)).toBe('draw');
    expect(outcomeOf(0, 3)).toBe('away');
  });
});

describe('captureOdds', () => {
  it('freezes a line once and never overwrites it', () => {
    let s = seedWorldCup(NOW);
    const home = s.matches[0]!.homeId!;
    const away = s.matches[0]!.awayId!;
    s = captureOdds(s, [oddsRow(home, away, { homeML: -150, drawML: 260, awayML: 400 })]);
    expect(s.odds?.['g-A-1']).toEqual({ homeML: -150, drawML: 260, awayML: 400 });

    // A later, different line is ignored (the first snapshot stands).
    const s2 = captureOdds(s, [oddsRow(home, away, { homeML: -200, drawML: 300, awayML: 500 })]);
    expect(s2).toBe(s); // unchanged reference — nothing captured
    expect(s2.odds?.['g-A-1']?.homeML).toBe(-150);
  });

  it('skips lines that cannot price any 1X2 outcome', () => {
    let s = seedWorldCup(NOW);
    const home = s.matches[0]!.homeId!;
    const away = s.matches[0]!.awayId!;
    s = captureOdds(s, [oddsRow(home, away, { overUnder: 3.5 })]); // no moneylines
    expect(s.odds).toBeUndefined();
  });
});

describe('betsFor + bankroll', () => {
  function staked(): { s: WorldCupState; john: string; daniel: string } {
    let s = seedWorldCup(NOW);
    const [john, daniel] = s.predictors as [{ id: string }, { id: string }];
    // Both predict g-A-1; John backs home (2-0), Daniel backs the draw (1-1).
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john.id, home: 2, away: 0, now: NOW });
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: daniel.id, home: 1, away: 1, now: NOW });
    const h = s.matches[0]!.homeId!;
    const a = s.matches[0]!.awayId!;
    s = captureOdds(s, [oddsRow(h, a, { homeML: 100, drawML: 200, awayML: 400 })]);
    return { s, john: john.id, daniel: daniel.id };
  }

  it('stakes the predicted outcome at its moneyline, pending until the result', () => {
    const { s, john } = staked();
    const [bet] = betsFor(s, john);
    expect(bet).toMatchObject({
      matchId: 'g-A-1',
      outcome: 'home',
      americanOdds: 100,
      decimalOdds: 2,
      stake: WC_STAKE,
      status: 'pending',
      profit: 0,
    });
  });

  it('settles winners and losers on the result', () => {
    const { s: initial, john, daniel } = staked();
    const s = setResult(initial, { matchId: 'g-A-1', home: 2, away: 0 }); // home win

    const jb = betsFor(s, john)[0]!;
    expect(jb.status).toBe('won');
    expect(jb.profit).toBeCloseTo(5); // €5 at evens
    expect(jb.returned).toBeCloseTo(10);

    const db = betsFor(s, daniel)[0]!;
    expect(db.status).toBe('lost');
    expect(db.profit).toBe(-WC_STAKE);

    expect(bankroll(s, john)).toMatchObject({
      profit: 5,
      won: 1,
      lost: 0,
      staked: 5,
      returned: 10,
    });
    expect(bankroll(s, daniel)).toMatchObject({ profit: -5, won: 0, lost: 1 });

    const lb = bankrollLeaderboard(s);
    expect(lb[0]!.predictorId).toBe(john); // richest first
    expect(lb[lb.length - 1]!.predictorId).toBe(daniel);
  });

  it('places no bet when there is no odds line, or none for that outcome', () => {
    // No snapshot at all → no bets.
    let s = seedWorldCup(NOW);
    const john = s.predictors[0]!.id;
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john, home: 2, away: 0, now: NOW });
    expect(betsFor(s, john)).toHaveLength(0);

    // A line that can't price the predicted away win → skipped.
    const h = s.matches[0]!.homeId!;
    const a = s.matches[0]!.awayId!;
    s = setPrediction(s, { matchId: 'g-A-1', predictorId: john, home: 0, away: 2, now: NOW });
    s = captureOdds(s, [oddsRow(h, a, { homeML: -150 })]); // only a home line
    expect(betsFor(s, john)).toHaveLength(0);
  });
});
