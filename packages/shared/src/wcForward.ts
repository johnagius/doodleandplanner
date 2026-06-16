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
 * "Assume everyone plays on": a predictor who hasn't entered a pick for an
 * upcoming game is projected making a plausible scoreline drawn from that game's
 * odds model — an *average* picker, not an optimal one — so the field competes
 * on the standings rather than freezing anyone who simply hasn't filled in the
 * run-in yet, and without handing non-pickers an unfair best-case strategy.
 * Differentiation still comes from the games they *have* picked.
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
  /** Stand-in picks folded in for games a predictor hadn't entered ("assume
   * everyone plays on"). 0 ⇒ every simulated game was actually predicted. */
  assumedPicks: number;
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

  // Per simulated match: its goal model, the picks riding on it, and the
  // predictors yet to pick it — who get a plausible sampled stand-in in the trial
  // loop below ("assume everyone plays on") rather than being frozen at zero.
  const simData = sims.map((m) => {
    const model = expectedGoals(oddsFor(m));
    const picks = state.predictions.filter((p) => p.matchId === m.id);
    const picked = new Set(picks.map((p) => p.predictorId));
    return { model, picks, missing: ids.filter((id) => !picked.has(id)) };
  });
  const predictedAll = simData.reduce((s, d) => s + d.picks.length, 0);
  const assumedPicks = simData.reduce((s, d) => s + d.missing.length, 0);
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
      const h = samplePoisson(sm.model.home, rng);
      const a = samplePoisson(sm.model.away, rng);
      for (const pick of sm.picks) {
        const sp = scorePrediction(pick, { home: h, away: a });
        pts.set(pick.predictorId, (pts.get(pick.predictorId) ?? 0) + sp.points);
        if (sp.category === 'exact') {
          exact.set(pick.predictorId, (exact.get(pick.predictorId) ?? 0) + 1);
        }
      }
      // "Assume everyone plays on": anyone yet to pick is projected making a
      // plausible scoreline drawn from the same odds model (an average, not
      // optimal, picker), scored against this trial's result.
      if (sm.missing.length > 0) {
        const ph = samplePoisson(sm.model.home, rng);
        const pa = samplePoisson(sm.model.away, rng);
        const sp = scorePrediction({ home: ph, away: pa }, { home: h, away: a });
        for (const id of sm.missing) {
          pts.set(id, (pts.get(id) ?? 0) + sp.points);
          if (sp.category === 'exact') exact.set(id, (exact.get(id) ?? 0) + 1);
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
    assumedPicks,
    leaderName: base[0]?.name ?? null,
    trials,
  };
}

export interface WcSweat {
  /** 0..1 — expected share of predictors whose rank still changes by full time. */
  index: number;
  /** Probability the current (provisional) leader is overtaken by full time. */
  pLeadChange: number;
  /** The provisional leader's name right now. */
  leaderName: string | null;
  /** Iterations run (0 ⇒ not enough data to read). */
  trials: number;
}

export interface WcSweatOptions {
  odds?: WcMatchOdds | null;
  /** Current live score + minute; omitted ⇒ treated as 0–0 with the full match ahead. */
  live?: { home: number; away: number; minute?: number | null };
  trials?: number;
  salt?: string;
}

/**
 * "Sweat-o-meter": how much this single match can still reshuffle the overall
 * table before full time. Samples the remaining goals from the match's odds
 * model (scaled by the time left), re-ranks the board for each outcome, and
 * measures how often — and how widely — the standings move from where they sit
 * right now. 0 = settled (no time left, or no result can change anyone's rank);
 * 1 = wide open.
 */
export function liveSweat(state: WorldCupState, matchId: string, opts?: WcSweatOptions): WcSweat {
  const match = findMatch(state, matchId);
  if (!match) return { index: 0, pLeadChange: 0, leaderName: null, trials: 0 };

  const liveState: WorldCupState = match.result
    ? {
        ...state,
        matches: state.matches.map((m) => (m.id === matchId ? { ...m, result: undefined } : m)),
      }
    : state;
  const base = leaderboard(liveState);
  if (base.length < 2) {
    return { index: 0, pLeadChange: 0, leaderName: base[0]?.name ?? null, trials: 0 };
  }

  const basePts = new Map(base.map((r) => [r.predictorId, r.points]));
  const baseExact = new Map(base.map((r) => [r.predictorId, r.exact]));
  const nameOf = new Map(base.map((r) => [r.predictorId, r.name]));
  const ids = base.map((r) => r.predictorId);
  const pickOf = new Map(
    state.predictions.filter((p) => p.matchId === matchId).map((p) => [p.predictorId, p]),
  );

  const orderAt = (home: number, away: number): string[] => {
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
  };

  const curHome = opts?.live?.home ?? 0;
  const curAway = opts?.live?.away ?? 0;
  const minute = opts?.live?.minute ?? 0;
  const remaining = Math.min(1, Math.max(0, (90 - minute) / 90));
  const model = expectedGoals(opts?.odds);
  const lamH = model.home * remaining;
  const lamA = model.away * remaining;

  const nowOrder = orderAt(curHome, curAway);
  const nowRank = new Map(nowOrder.map((id, i) => [id, i]));
  const nowLeader = nowOrder[0]!;

  const trials = Math.max(1, Math.floor(opts?.trials ?? 1500));
  const rng = mulberry32(seedHash(`wcsweat|${matchId}|${curHome}-${curAway}|${opts?.salt ?? ''}`));
  let changeShare = 0;
  let leadChanges = 0;
  for (let t = 0; t < trials; t++) {
    const fh = curHome + samplePoisson(lamH, rng);
    const fa = curAway + samplePoisson(lamA, rng);
    const order = orderAt(fh, fa);
    let moved = 0;
    for (let i = 0; i < order.length; i++) if (nowRank.get(order[i]!) !== i) moved++;
    changeShare += moved / ids.length;
    if (order[0] !== nowLeader) leadChanges++;
  }
  return {
    index: changeShare / trials,
    pLeadChange: leadChanges / trials,
    leaderName: nameOf.get(nowLeader) ?? null,
    trials,
  };
}

export interface WcCrownOdds {
  predictorId: string;
  name: string;
  /** Probability of being closest (bagging this match's 🎯) at full time. */
  p: number;
}

/**
 * Live odds on who'll be closest at full time — the 🎯 "crown" race. Simulates
 * the remaining goals from the match's odds model (scaled by time left), and for
 * each outcome credits whoever scores most on it (ties split the crown). Sorted
 * best→worst; empty when no pick can score. Mirrors {@link closestToScore}'s
 * "best points wins" rule, inlined over the match's picks for speed.
 */
export function crownOdds(
  state: WorldCupState,
  matchId: string,
  opts?: WcSweatOptions,
): WcCrownOdds[] {
  const match = findMatch(state, matchId);
  if (!match) return [];
  const picks = state.predictions.filter((p) => p.matchId === matchId);
  if (picks.length === 0) return [];
  const nameOf = new Map(state.predictors.map((p) => [p.id, p.name]));

  const curHome = opts?.live?.home ?? 0;
  const curAway = opts?.live?.away ?? 0;
  const minute = opts?.live?.minute ?? 0;
  const remaining = Math.min(1, Math.max(0, (90 - minute) / 90));
  const model = expectedGoals(opts?.odds);
  const lamH = model.home * remaining;
  const lamA = model.away * remaining;

  const trials = Math.max(1, Math.floor(opts?.trials ?? 1500));
  const rng = mulberry32(seedHash(`wccrown|${matchId}|${curHome}-${curAway}|${opts?.salt ?? ''}`));
  const win = new Map<string, number>();
  for (let t = 0; t < trials; t++) {
    const fh = curHome + samplePoisson(lamH, rng);
    const fa = curAway + samplePoisson(lamA, rng);
    let best = 0;
    const got: Array<{ id: string; pts: number }> = [];
    for (const p of picks) {
      const pts = scorePrediction(p, { home: fh, away: fa }).points;
      got.push({ id: p.predictorId, pts });
      if (pts > best) best = pts;
    }
    if (best <= 0) continue; // nobody scored ⇒ no crown this outcome
    const winners = got.filter((g) => g.pts === best);
    const share = 1 / winners.length;
    for (const w of winners) win.set(w.id, (win.get(w.id) ?? 0) + share);
  }
  return picks
    .map((p) => ({
      predictorId: p.predictorId,
      name: nameOf.get(p.predictorId) ?? '?',
      p: (win.get(p.predictorId) ?? 0) / trials,
    }))
    .filter((c) => c.p > 0)
    .sort((a, b) => b.p - a.p);
}
