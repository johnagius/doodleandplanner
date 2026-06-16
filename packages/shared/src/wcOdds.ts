/**
 * A light Poisson scoreline model for the World Cup "scenarios" tab. It turns the
 * market (ESPN) odds into expected goals, then gives the probability of any final
 * score — and, crucially, conditions on the LIVE score + minutes left so the
 * numbers update as a match plays out (a 2–0 with 10 minutes left is far likelier
 * to finish 2–0 than at kick-off).
 *
 * It's an estimate, not a sportsbook: expected goals come from the over/under
 * line (total) split by the moneyline (who's favoured). Pure + serialisable.
 */
import type { WcMatchOdds } from './worldcup.js';

/** Expected goals (λ) for each side over the full match. */
export interface WcGoalModel {
  home: number;
  away: number;
}

/** Live snapshot used to condition the model mid-match. */
export interface WcLiveSnapshot {
  /** Minutes played (0–90+). */
  minute: number | null;
  home: number;
  away: number;
}

/** American moneyline → implied win probability (with the vig still in). */
function impliedFromAmerican(ml: number): number {
  return ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100);
}

/** De-vigged home/draw/away probabilities from the moneyline, or null if the
 * odds are incomplete. */
export function impliedOutcome(
  odds: WcMatchOdds | null | undefined,
): { home: number; draw: number; away: number } | null {
  const home = odds?.homeML;
  const draw = odds?.drawML;
  const away = odds?.awayML;
  if (home == null || draw == null || away == null) return null;
  const raw = {
    home: impliedFromAmerican(home),
    draw: impliedFromAmerican(draw),
    away: impliedFromAmerican(away),
  };
  const sum = raw.home + raw.draw + raw.away;
  if (sum <= 0) return null;
  return { home: raw.home / sum, draw: raw.draw / sum, away: raw.away / sum };
}

const DEFAULT_TOTAL = 2.6; // a sensible average World Cup goals total

/** Expected goals per side from the odds: the over/under sets the total, the
 * moneyline tilts it toward the favourite. Falls back to an even ~2.6 total. */
export function expectedGoals(odds: WcMatchOdds | null | undefined): WcGoalModel {
  const total = odds?.overUnder && odds.overUnder > 0 ? odds.overUnder : DEFAULT_TOTAL;
  const imp = impliedOutcome(odds);
  let supremacy = imp ? (imp.home - imp.away) * 1.7 : 0; // goal-ish per prob point
  const cap = total * 0.8;
  supremacy = Math.max(-cap, Math.min(cap, supremacy));
  return {
    home: Math.max(0.15, (total + supremacy) / 2),
    away: Math.max(0.15, (total - supremacy) / 2),
  };
}

/** Poisson P(exactly k events | mean λ). */
function poissonPmf(k: number, lambda: number): number {
  if (k < 0) return 0;
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

/** Fraction of the match still to play (0–1) from the live minute (90' game). */
export function timeLeftFraction(minute: number | null | undefined): number {
  if (minute == null) return 1;
  return Math.max(0, Math.min(1, (90 - minute) / 90));
}

/**
 * Probability a match finishes exactly `target`, given the model and an optional
 * live snapshot. Goals already scored can't be un-scored, so only the *remaining*
 * goals are modelled (scaled by the time left). 0 if the target is below the
 * current score.
 */
export function scorelineChance(
  model: WcGoalModel,
  target: { home: number; away: number },
  live?: WcLiveSnapshot | null,
): number {
  const f = live ? timeLeftFraction(live.minute) : 1;
  const h0 = live?.home ?? 0;
  const a0 = live?.away ?? 0;
  const dh = target.home - h0;
  const da = target.away - a0;
  if (dh < 0 || da < 0) return 0;
  return poissonPmf(dh, model.home * f) * poissonPmf(da, model.away * f);
}

/** Win/draw/win probabilities given the model and optional live state, summed
 * over remaining-goal combinations. */
export function outcomeChances(
  model: WcGoalModel,
  live?: WcLiveSnapshot | null,
): { home: number; draw: number; away: number } {
  const f = live ? timeLeftFraction(live.minute) : 1;
  const h0 = live?.home ?? 0;
  const a0 = live?.away ?? 0;
  const N = 10; // remaining goals each side — plenty for convergence
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let hi = 0; hi <= N; hi++) {
    const ph = poissonPmf(hi, model.home * f);
    for (let ai = 0; ai <= N; ai++) {
      const p = ph * poissonPmf(ai, model.away * f);
      const fh = h0 + hi;
      const fa = a0 + ai;
      if (fh > fa) home += p;
      else if (fh < fa) away += p;
      else draw += p;
    }
  }
  return { home, draw, away };
}
