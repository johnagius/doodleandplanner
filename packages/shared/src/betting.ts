/**
 * Fake-money betting side-game. Each predictor is staked a flat amount per game,
 * automatically backing the result their scoreline implies (home / draw / away)
 * at that side's moneyline from the frozen odds snapshot. Settles on the match
 * result. Pure + derived (no stored bets) — the only persisted input is
 * `state.odds` (see {@link captureOdds}); everything here is computed.
 */
import { findMatch, type WcMatchOdds, type WcResult, type WorldCupState } from './worldcup.js';

/** Flat fake stake handed to every predictor, every game. */
export const WC_STAKE = 5;

export type WcBetOutcome = 'home' | 'draw' | 'away';

export interface WcBet {
  matchId: string;
  predictorId: string;
  /** The 1X2 result this bet backs (from the predictor's scoreline). */
  outcome: WcBetOutcome;
  /** American moneyline used, and its decimal equivalent (for display). */
  americanOdds: number;
  decimalOdds: number;
  stake: number;
  status: 'pending' | 'won' | 'lost';
  /** Net profit/loss once settled (won ⇒ +winnings, lost ⇒ −stake, pending ⇒ 0). */
  profit: number;
  /** Total returned if it won (stake + profit); 0 otherwise. */
  returned: number;
}

/** The 1X2 outcome a scoreline implies. */
export function outcomeOf(home: number, away: number): WcBetOutcome {
  if (home > away) return 'home';
  if (away > home) return 'away';
  return 'draw';
}

/** American (moneyline) odds → decimal. -150 → 1.667, +260 → 3.6. */
export function americanToDecimal(ml: number): number {
  return ml > 0 ? ml / 100 + 1 : 100 / -ml + 1;
}

function moneylineFor(odds: WcMatchOdds, outcome: WcBetOutcome): number | null {
  const ml = outcome === 'home' ? odds.homeML : outcome === 'away' ? odds.awayML : odds.drawML;
  return ml ?? null;
}

/**
 * Every auto-bet a predictor has running, chronological. One per match they
 * predicted that has a frozen odds line able to price their outcome. Settled
 * bets carry win/loss + profit; upcoming/in-play ones are pending.
 */
export function betsFor(state: WorldCupState, predictorId: string): WcBet[] {
  const out: Array<WcBet & { _k: number; _o: number }> = [];
  for (const pred of state.predictions) {
    if (pred.predictorId !== predictorId) continue;
    const odds = state.odds?.[pred.matchId];
    if (!odds) continue;
    const outcome = outcomeOf(pred.home, pred.away);
    const american = moneylineFor(odds, outcome);
    if (american == null) continue; // can't price this side — no bet
    const decimal = americanToDecimal(american);
    const match = findMatch(state, pred.matchId);
    const result: WcResult | undefined = match?.result;
    let status: WcBet['status'] = 'pending';
    let profit = 0;
    let returned = 0;
    if (result) {
      const won = outcomeOf(result.home, result.away) === outcome;
      status = won ? 'won' : 'lost';
      profit = won ? WC_STAKE * (decimal - 1) : -WC_STAKE;
      returned = won ? WC_STAKE * decimal : 0;
    }
    out.push({
      matchId: pred.matchId,
      predictorId,
      outcome,
      americanOdds: american,
      decimalOdds: decimal,
      stake: WC_STAKE,
      status,
      profit,
      returned,
      _k: match ? new Date(match.kickoff || 0).getTime() : 0,
      _o: match?.order ?? 0,
    });
  }
  out.sort((a, b) => a._k - b._k || a._o - b._o);
  return out.map(({ _k, _o, ...bet }) => bet);
}

export interface WcBankroll {
  predictorId: string;
  name: string;
  /** Net profit/loss across settled bets. */
  profit: number;
  staked: number;
  returned: number;
  won: number;
  lost: number;
  pending: number;
}

/** A predictor's betting bankroll (settled net + counts). */
export function bankroll(state: WorldCupState, predictorId: string): WcBankroll {
  const name = state.predictors.find((p) => p.id === predictorId)?.name ?? predictorId;
  const b: WcBankroll = {
    predictorId,
    name,
    profit: 0,
    staked: 0,
    returned: 0,
    won: 0,
    lost: 0,
    pending: 0,
  };
  for (const bet of betsFor(state, predictorId)) {
    if (bet.status === 'pending') {
      b.pending++;
      continue;
    }
    b.staked += bet.stake;
    b.returned += bet.returned;
    b.profit += bet.profit;
    if (bet.status === 'won') b.won++;
    else b.lost++;
  }
  return b;
}

/** Richest-first bankroll standings (settled profit; pending bets don't count). */
export function bankrollLeaderboard(state: WorldCupState): WcBankroll[] {
  return state.predictors
    .map((p) => bankroll(state, p.id))
    .sort((a, b) => b.profit - a.profit || b.won - a.won || a.name.localeCompare(b.name));
}
