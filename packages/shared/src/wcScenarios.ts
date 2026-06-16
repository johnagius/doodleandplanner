/**
 * Narrative leaderboard scenarios for a single upcoming/in-play match: given who
 * predicted what and the market odds, what are the odds each player climbs, takes
 * top spot, or slips — so the card can say "Daniel has a 38% shot at 1st" in
 * words rather than making you fiddle a score stepper.
 *
 * Pure: it weights every plausible scoreline by the Poisson model
 * ({@link scorelineChance}) and rolls the resulting standings into per-player
 * probabilities. Lives apart from worldcup.ts to avoid an import cycle (it pulls
 * in both the scoring core and the odds model).
 */
import { leaderboard, scorePrediction, type WcMatchOdds, type WorldCupState } from './worldcup.js';
import { expectedGoals, scorelineChance, type WcLiveSnapshot } from './wcOdds.js';

export interface WcScenarioOutlook {
  predictorId: string;
  name: string;
  /** Current position (1-based), this match still unplayed. */
  currentRank: number;
  points: number;
  /** Probability they finish this match in 1st. */
  pTop: number;
  /** Probability they climb at least one place. */
  pUp: number;
  /** Probability they drop at least one place. */
  pDown: number;
  /** Best position reachable from any result, and an example result. */
  bestRank: number;
  bestExample: { home: number; away: number } | null;
  /** Most points obtainable from this match. */
  maxGain: number;
}

export interface WcMatchScenarios {
  outlooks: WcScenarioOutlook[];
  leaderName: string | null;
  /** True if any result would reorder the table. */
  volatile: boolean;
  /** How many predictors have a pick in for this match. */
  predicted: number;
}

const GRID = 6; // model scorelines 0..6 more goals per side — covers ~all realistic

/**
 * Per-player leaderboard odds for a match. Weighs each candidate scoreline by its
 * live probability (conditioned on the current score + minutes left), so the
 * numbers move as the match plays.
 */
export function matchScenarios(
  state: WorldCupState,
  matchId: string,
  odds: WcMatchOdds | null | undefined,
  live?: WcLiveSnapshot | null,
): WcMatchScenarios {
  const model = expectedGoals(odds);
  const base = leaderboard(state);
  const basePoints = new Map(base.map((r) => [r.predictorId, r.points]));
  const baseExact = new Map(base.map((r) => [r.predictorId, r.exact]));
  const baseRank = new Map(base.map((r, i) => [r.predictorId, i + 1]));
  const picks = new Map(
    state.predictions.filter((p) => p.matchId === matchId).map((p) => [p.predictorId, p]),
  );

  type Acc = {
    pTop: number;
    pUp: number;
    pDown: number;
    bestRank: number;
    bestExample: { home: number; away: number } | null;
    bestExampleW: number;
    maxGain: number;
  };
  const acc = new Map<string, Acc>(
    base.map((r) => [
      r.predictorId,
      {
        pTop: 0,
        pUp: 0,
        pDown: 0,
        bestRank: baseRank.get(r.predictorId)!,
        bestExample: null,
        bestExampleW: -1,
        maxGain: 0,
      },
    ]),
  );

  const h0 = live?.home ?? 0;
  const a0 = live?.away ?? 0;
  let totalW = 0;
  for (let H = h0; H <= h0 + GRID; H++) {
    for (let A = a0; A <= a0 + GRID; A++) {
      const w = scorelineChance(model, { home: H, away: A }, live);
      if (w <= 0) continue;
      totalW += w;
      const rows = base.map((r) => {
        const pick = picks.get(r.predictorId);
        const sp = pick ? scorePrediction(pick, { home: H, away: A }) : null;
        const gain = sp ? sp.points : 0;
        return {
          id: r.predictorId,
          name: r.name,
          pts: (basePoints.get(r.predictorId) ?? 0) + gain,
          exact: (baseExact.get(r.predictorId) ?? 0) + (sp?.category === 'exact' ? 1 : 0),
          gain,
        };
      });
      // Mirror leaderboard's ordering: points, then exact count, then name.
      rows.sort((x, y) => y.pts - x.pts || y.exact - x.exact || x.name.localeCompare(y.name));
      rows.forEach((row, i) => {
        const rank = i + 1;
        const a = acc.get(row.id)!;
        const prev = baseRank.get(row.id)!;
        if (rank === 1) a.pTop += w;
        if (rank < prev) a.pUp += w;
        else if (rank > prev) a.pDown += w;
        if (rank < a.bestRank || (rank === a.bestRank && w > a.bestExampleW)) {
          a.bestRank = rank;
          a.bestExample = { home: H, away: A };
          a.bestExampleW = w;
        }
        if (row.gain > a.maxGain) a.maxGain = row.gain;
      });
    }
  }

  const norm = totalW > 0 ? totalW : 1;
  const outlooks: WcScenarioOutlook[] = base.map((r, i) => {
    const a = acc.get(r.predictorId)!;
    return {
      predictorId: r.predictorId,
      name: r.name,
      currentRank: i + 1,
      points: r.points,
      pTop: a.pTop / norm,
      pUp: a.pUp / norm,
      pDown: a.pDown / norm,
      bestRank: a.bestRank,
      bestExample: a.bestExample,
      maxGain: a.maxGain,
    };
  });

  return {
    outlooks,
    leaderName: base[0]?.name ?? null,
    volatile: outlooks.some((o) => o.bestRank < o.currentRank),
    predicted: picks.size,
  };
}
