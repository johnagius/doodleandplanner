/**
 * Live leaderboard flips during a match.
 *
 * As goals go in, everyone's *provisional* points (their pick scored against the
 * running score) shift — and so the standings can reshuffle mid-game. This walks
 * the goals in order, rebuilds the provisional table after each one, and reports
 * the moments someone overtakes someone, tied to the minute it happened — so the
 * match timeline can show "👑 Manuel back to 1st (pips Saviour)" right next to
 * the scorers and cards.
 *
 * Pure: derived entirely from the board + the live event list. Own goals (like
 * all goals) are credited to `teamTla`, the side the feed already attributes them
 * to, so the running score is just a tally of goal events per side.
 */
import {
  findMatch,
  leaderboard,
  scorePrediction,
  type WcMatchEvent,
  type WorldCupState,
} from './worldcup.js';

const GOAL_KINDS = new Set<WcMatchEvent['kind']>(['goal', 'pen-goal', 'own-goal']);

/** Parse a feed minute ("23'", "45'+2'") into a sortable number. */
export function minuteValue(m: string): number {
  const main = /(\d+)/.exec(m);
  const add = /\+\s*(\d+)/.exec(m);
  return (main ? Number(main[1]) : 0) + (add ? Number(add[1]) / 100 : 0);
}

export interface WcLiveFlip {
  /** Minute label of the goal that caused it (e.g. "23'"). */
  minute: string;
  /** Running score after that goal. */
  home: number;
  away: number;
  /** The headline climber (the one reaching the highest new position). */
  predictorId: string;
  name: string;
  toRank: number;
  fromRank: number;
  /** Names the headline climber leapfrogged. */
  passed: string[];
  /** Other predictors who also climbed on this goal. */
  alsoMoved: number;
  /** Whether the headline climber took over 1st. */
  topChange: boolean;
}

/**
 * The order-changing moments during a match, oldest first. One entry per goal
 * that reshuffled the provisional standings (goals that change nobody's order —
 * e.g. the favourite extending a lead everyone predicted — produce nothing).
 */
export function liveRankFlips(
  state: WorldCupState,
  matchId: string,
  events: WcMatchEvent[] | undefined,
): WcLiveFlip[] {
  const match = findMatch(state, matchId);
  if (!match || !events || events.length === 0) return [];

  const base = leaderboard(state);
  if (base.length < 2) return [];
  const basePts = new Map(base.map((r) => [r.predictorId, r.points]));
  const baseExact = new Map(base.map((r) => [r.predictorId, r.exact]));
  const nameOf = new Map(base.map((r) => [r.predictorId, r.name]));
  const ids = base.map((r) => r.predictorId);
  const pickOf = new Map(
    state.predictions.filter((p) => p.matchId === matchId).map((p) => [p.predictorId, p]),
  );

  /** Provisional order (best→worst predictorId) at a running score. */
  function orderAt(home: number, away: number): string[] {
    const pts = new Map<string, number>();
    const exa = new Map<string, number>();
    for (const id of ids) {
      const pick = pickOf.get(id);
      const sp = pick ? scorePrediction(pick, { home, away }) : null;
      pts.set(id, (basePts.get(id) ?? 0) + (sp?.points ?? 0));
      exa.set(id, (baseExact.get(id) ?? 0) + (sp?.category === 'exact' ? 1 : 0));
    }
    return ids
      .slice()
      .sort(
        (x, y) =>
          pts.get(y)! - pts.get(x)! ||
          exa.get(y)! - exa.get(x)! ||
          (nameOf.get(x) ?? '').localeCompare(nameOf.get(y) ?? ''),
      );
  }
  const indexOf = (order: string[]) => new Map(order.map((id, i) => [id, i]));

  const goals = events
    .filter((e) => GOAL_KINDS.has(e.kind))
    .slice()
    .sort((a, b) => minuteValue(a.minute) - minuteValue(b.minute));

  let home = 0;
  let away = 0;
  let prev = indexOf(orderAt(0, 0)); // kickoff / 0–0 baseline
  const flips: WcLiveFlip[] = [];

  for (const g of goals) {
    if (g.teamTla === match.homeId) home++;
    else if (g.teamTla === match.awayId) away++;
    else continue; // unattributable goal — leave the score as-is

    const now = indexOf(orderAt(home, away));
    const climbers = ids
      .filter((id) => now.get(id)! < prev.get(id)!) // moved up
      .map((id) => ({
        id,
        fromRank: prev.get(id)! + 1,
        toRank: now.get(id)! + 1,
        // Those they were below before and are above now.
        passed: ids
          .filter((o) => o !== id && prev.get(o)! < prev.get(id)! && now.get(o)! > now.get(id)!)
          .map((o) => nameOf.get(o) ?? '?'),
      }))
      .filter((c) => c.passed.length > 0)
      .sort((a, b) => a.toRank - b.toRank || b.fromRank - b.toRank - (a.fromRank - a.toRank));

    prev = now;
    if (climbers.length === 0) continue;

    const head = climbers[0]!;
    flips.push({
      minute: g.minute,
      home,
      away,
      predictorId: head.id,
      name: nameOf.get(head.id) ?? '?',
      toRank: head.toRank,
      fromRank: head.fromRank,
      passed: head.passed,
      alsoMoved: climbers.length - 1,
      topChange: head.toRank === 1,
    });
  }
  return flips;
}
