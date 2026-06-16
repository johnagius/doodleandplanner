/**
 * Forward leaderboard projection for an upcoming match.
 *
 * Where {@link matchScenarios} (wcScenarios.ts) asks only "if *this* match ends
 * X, who moves?" off the table as it stands, this asks the fuller question the
 * card actually implies: **by the time this match is done, who's on top?** — and
 * so it simulates *every* unplayed match from now up to and including the target
 * one, sampling each scoreline from its odds (the same Poisson model as
 * wcOdds.ts) and banking the points each predictor's pick earns along the way.
 *
 * The upshot: the probability someone stays top now decays the further out a
 * match sits, because all the games in between can reshuffle the board — no more
 * "100% three rounds early".
 *
 * Pure + deterministic: a seeded RNG (FNV-1a → mulberry32) means the same board
 * yields the same numbers on every device and in tests. Matches with no captured
 * odds fall back to the model's neutral prior, so a far-off game just reads as
 * genuinely uncertain rather than certain.
 */
import { toMs } from './time.js';
import { expectedGoals } from './wcOdds.js';
import {
  findMatch,
  leaderboard,
  scorePrediction,
  type WcMatch,
  type WcMatchOdds,
  type WorldCupState,
} from './worldcup.js';

export interface WcForwardOutlook {
  predictorId: string;
  name: string;
  /** Current position (1-based), before any of the simulated matches. */
  currentRank: number;
  /** Current points (the simulation's starting line). */
  points: number;
  /** Probability they're top once every match through this one is played. */
  pTop: number;
  /** Probability they climb at least one place versus now. */
  pUp: number;
  /** Probability they slip at least one place versus now. */
  pDown: number;
  /** Mean finishing rank across the simulations. */
  expectedRank: number;
  /** Most-frequent finishing rank across the simulations. */
  likelyRank: number;
}

export interface WcForwardScenarios {
  /** Per-predictor outlook, ordered by current rank. */
  outlooks: WcForwardOutlook[];
  /** Unplayed, team-known matches strictly *before* the target that were folded in. */
  matchesBefore: number;
  /** Predictions in for the target match itself. */
  predicted: number;
  /** Predictions in across every simulated match (target + the ones before). */
  predictedAll: number;
  leaderName: string | null;
  /** Monte-Carlo iterations run (exposed for callers/tests). */
  trials: number;
}

/** Chronological key for a match: kickoff first, then the stable display order. */
function keyOf(m: WcMatch): [number, number] {
  return [toMs(m.kickoff), m.order];
}

function keyLeq(a: [number, number], b: [number, number]): boolean {
  return a[0] !== b[0] ? a[0] < b[0] : a[1] <= b[1];
}

/**
 * Unplayed, team-known matches that kick off strictly before `matchId`, oldest
 * first — the games whose results land before the target one and so move the
 * board underneath it. Excludes the target itself.
 */
export function unplayedBefore(state: WorldCupState, matchId: string): WcMatch[] {
  const target = findMatch(state, matchId);
  if (!target) return [];
  const tk = keyOf(target);
  return state.matches
    .filter(
      (m) =>
        m.id !== matchId &&
        !m.result &&
        !!m.homeId &&
        !!m.awayId &&
        keyLeq(keyOf(m), tk) &&
        !(keyOf(m)[0] === tk[0] && keyOf(m)[1] === tk[1]),
    )
    .sort((a, b) => toMs(a.kickoff) - toMs(b.kickoff) || a.order - b.order);
}

/** FNV-1a 32-bit hash → a stable numeric seed from a string. */
function seedHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — a tiny, fast, deterministic [0,1) PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Knuth's Poisson sampler with the given uniform RNG (capped for safety). */
function samplePoisson(lambda: number, rng: () => number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L && k < 40);
  return k - 1;
}

export interface WcForwardOptions {
  /** Monte-Carlo iterations (default 2000 — plenty for stable headline percents). */
  trials?: number;
  /** Per-match odds overrides (e.g. the live line for the target); falls back to
   * `state.odds` then the neutral prior. */
  oddsByMatch?: Record<string, WcMatchOdds | null | undefined>;
  /** Extra seed salt, if a caller wants an independent stream. */
  salt?: string;
}

/**
 * Project the leaderboard forward to the moment `matchId` finishes, folding in
 * every unplayed match before it. Returns each predictor's odds of being top
 * (and of climbing/slipping) once all those games are played.
 */
export function forwardScenarios(
  state: WorldCupState,
  matchId: string,
  opts?: WcForwardOptions,
): WcForwardScenarios {
  const trials = Math.max(1, Math.floor(opts?.trials ?? 2000));
  const before = unplayedBefore(state, matchId);
  const target = findMatch(state, matchId);
  // Simulate the earlier games then the target itself.
  const sims = target ? [...before, target] : before;

  const base = leaderboard(state);
  const basePts = new Map(base.map((r) => [r.predictorId, r.points]));
  const baseExact = new Map(base.map((r) => [r.predictorId, r.exact]));
  const baseRank = new Map(base.map((r, i) => [r.predictorId, i + 1]));
  const ids = base.map((r) => r.predictorId);
  const nameOf = new Map(base.map((r) => [r.predictorId, r.name]));
  const n = ids.length;

  const oddsFor = (m: WcMatch): WcMatchOdds | null | undefined =>
    opts?.oddsByMatch?.[m.id] ?? state.odds?.[m.id];

  // Per simulated match: its goal model and the picks riding on it.
  const simData = sims.map((m) => ({
    model: expectedGoals(oddsFor(m)),
    picks: state.predictions.filter((p) => p.matchId === m.id),
  }));
  const predictedAll = simData.reduce((s, d) => s + d.picks.length, 0);
  const predicted = state.predictions.filter((p) => p.matchId === matchId).length;

  const top = new Map(ids.map((id) => [id, 0]));
  const up = new Map(ids.map((id) => [id, 0]));
  const down = new Map(ids.map((id) => [id, 0]));
  const rankSum = new Map(ids.map((id) => [id, 0]));
  // rankCounts[id][rank-1] — for the modal finishing position.
  const rankCounts = new Map(ids.map((id) => [id, new Array<number>(n).fill(0)]));

  const rng = mulberry32(seedHash(`wcfwd|${matchId}|${opts?.salt ?? ''}`));

  for (let t = 0; t < trials; t++) {
    const pts = new Map(basePts);
    const exact = new Map(baseExact);
    for (const sm of simData) {
      if (sm.picks.length === 0) continue;
      const h = samplePoisson(sm.model.home, rng);
      const a = samplePoisson(sm.model.away, rng);
      for (const pick of sm.picks) {
        const sp = scorePrediction(pick, { home: h, away: a });
        pts.set(pick.predictorId, (pts.get(pick.predictorId) ?? 0) + sp.points);
        if (sp.category === 'exact') {
          exact.set(pick.predictorId, (exact.get(pick.predictorId) ?? 0) + 1);
        }
      }
    }
    // Same ordering as leaderboard(): points, then exact count, then name.
    const ranked = ids
      .slice()
      .sort(
        (x, y) =>
          (pts.get(y) ?? 0) - (pts.get(x) ?? 0) ||
          (exact.get(y) ?? 0) - (exact.get(x) ?? 0) ||
          (nameOf.get(x) ?? '').localeCompare(nameOf.get(y) ?? ''),
      );
    for (let i = 0; i < ranked.length; i++) {
      const id = ranked[i]!;
      const rank = i + 1;
      rankSum.set(id, (rankSum.get(id) ?? 0) + rank);
      rankCounts.get(id)![i]! += 1;
      if (rank === 1) top.set(id, (top.get(id) ?? 0) + 1);
      const prev = baseRank.get(id)!;
      if (rank < prev) up.set(id, (up.get(id) ?? 0) + 1);
      else if (rank > prev) down.set(id, (down.get(id) ?? 0) + 1);
    }
  }

  const outlooks: WcForwardOutlook[] = base.map((r, i) => {
    const counts = rankCounts.get(r.predictorId)!;
    let likely = 0;
    for (let k = 1; k < counts.length; k++) if (counts[k]! > counts[likely]!) likely = k;
    return {
      predictorId: r.predictorId,
      name: r.name,
      currentRank: i + 1,
      points: r.points,
      pTop: (top.get(r.predictorId) ?? 0) / trials,
      pUp: (up.get(r.predictorId) ?? 0) / trials,
      pDown: (down.get(r.predictorId) ?? 0) / trials,
      expectedRank: (rankSum.get(r.predictorId) ?? 0) / trials,
      likelyRank: likely + 1,
    };
  });

  return {
    outlooks,
    matchesBefore: before.length,
    predicted,
    predictedAll,
    leaderName: base[0]?.name ?? null,
    trials,
  };
}
