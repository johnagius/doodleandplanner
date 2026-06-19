/**
 * Player-card collectible game: top a match's points table and you win a random
 * WC squad player as a FIFA-style card. Everything here is **pure and derived**
 * from the results + a fixed seed (no stored state), so every device computes the
 * same cards and it survives reloads.
 */
import { WC_SQUADS, type WcPlayerPos, type WcSquadPlayer } from './squads.js';
import { closestPredictors, type WorldCupState } from './worldcup.js';

/** Deterministic 32-bit hash (FNV-1a) — same input, same number, everywhere. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type WcCardTier = 'bronze' | 'silver' | 'gold';

export interface WcCardStats {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
}

export interface WcPlayerCard {
  player: WcSquadPlayer;
  /** Overall rating, 62–91. */
  overall: number;
  tier: WcCardTier;
  stats: WcCardStats;
}

const clamp = (n: number) => Math.max(40, Math.min(99, n));

// Per-position stat leanings (offsets from the overall), so a striker pulls
// pace/shooting and a defender pulls defending/physical. Our own "house"
// numbers — real FIFA ratings are proprietary.
const POS_BIAS: Record<WcPlayerPos, WcCardStats> = {
  GK: { pace: -8, shooting: -20, passing: -6, dribbling: -10, defending: 8, physical: 6 },
  DEF: { pace: -2, shooting: -14, passing: -2, dribbling: -6, defending: 12, physical: 9 },
  MID: { pace: 0, shooting: -2, passing: 8, dribbling: 6, defending: 0, physical: -2 },
  FWD: { pace: 8, shooting: 11, passing: -2, dribbling: 8, defending: -16, physical: -2 },
};

/** A player's deterministic "house" rating + stats (consistent every time). */
export function playerCard(player: WcSquadPlayer): WcPlayerCard {
  const base = hash('ovr:' + player.id);
  const overall = 62 + (base % 30); // 62..91
  const bias = POS_BIAS[player.pos];
  const jitter = (k: keyof WcCardStats) => (hash(k + ':' + player.id) % 13) - 6; // -6..6
  const stats: WcCardStats = {
    pace: clamp(overall + bias.pace + jitter('pace')),
    shooting: clamp(overall + bias.shooting + jitter('shooting')),
    passing: clamp(overall + bias.passing + jitter('passing')),
    dribbling: clamp(overall + bias.dribbling + jitter('dribbling')),
    defending: clamp(overall + bias.defending + jitter('defending')),
    physical: clamp(overall + bias.physical + jitter('physical')),
  };
  const tier: WcCardTier = overall >= 84 ? 'gold' : overall >= 75 ? 'silver' : 'bronze';
  return { player, overall, tier, stats };
}

/** The player a predictor pulls for topping a given match — a deterministic
 * "random" draw (so all clients agree), keyed by the match + predictor. */
export function cardDraw(matchId: string, predictorId: string): WcSquadPlayer {
  return WC_SQUADS[hash(matchId + '|' + predictorId) % WC_SQUADS.length]!;
}

export interface WcWonCard {
  matchId: string;
  player: WcSquadPlayer;
}

export interface WcCardAward extends WcWonCard {
  predictorId: string;
}

/**
 * Every card awarded across the whole game, each a **globally unique** player —
 * no player ever drops twice, even across different collectors (ties on a match
 * each get their own distinct card). Processed in a stable match-then-predictor
 * order so it's deterministic on every device and earlier cards never shift as
 * later ones are won. The 1,249-player pool comfortably covers every award.
 */
export function allCardAwards(state: WorldCupState): WcCardAward[] {
  const order = new Map(state.predictors.map((p, i) => [p.id, i]));
  const matches = state.matches.filter((m) => !!m.result).sort((a, b) => a.order - b.order);
  const taken = new Set<number>();
  const out: WcCardAward[] = [];
  for (const m of matches) {
    // Each joint top scorer wins a card; stable order = predictor list order.
    const winners = [...closestPredictors(state, m.id)].sort(
      (x, y) => (order.get(x) ?? 99) - (order.get(y) ?? 99),
    );
    for (const predictorId of winners) {
      let idx = hash(m.id + '|' + predictorId) % WC_SQUADS.length;
      let guard = 0;
      while (taken.has(WC_SQUADS[idx]!.id) && guard++ < WC_SQUADS.length) {
        idx = (idx + 1) % WC_SQUADS.length;
      }
      const player = WC_SQUADS[idx]!;
      taken.add(player.id);
      out.push({ matchId: m.id, predictorId, player });
    }
  }
  return out;
}

/** A predictor's collection — their share of {@link allCardAwards}. */
export function cardsWonBy(state: WorldCupState, predictorId: string): WcWonCard[] {
  return allCardAwards(state)
    .filter((a) => a.predictorId === predictorId)
    .map((a) => ({ matchId: a.matchId, player: a.player }));
}

/**
 * The won card a predictor is showing off as their badge, or null if they've set
 * none — or no longer hold it (e.g. the organiser cleared that match's result),
 * so a stale pick simply stops rendering rather than showing a phantom card.
 */
export function cardBadgeFor(state: WorldCupState, predictorId: string): WcWonCard | null {
  const predictor = state.predictors.find((p) => p.id === predictorId);
  if (!predictor || predictor.cardBadge == null) return null;
  return cardsWonBy(state, predictorId).find((c) => c.player.id === predictor.cardBadge) ?? null;
}

export interface WcCardLeaderRow {
  predictorId: string;
  name: string;
  cards: number;
}

/** Card-count standings, most cards first. */
export function cardLeaderboard(state: WorldCupState): WcCardLeaderRow[] {
  const counts = new Map<string, number>();
  for (const a of allCardAwards(state))
    counts.set(a.predictorId, (counts.get(a.predictorId) ?? 0) + 1);
  return state.predictors
    .map((p) => ({ predictorId: p.id, name: p.name, cards: counts.get(p.id) ?? 0 }))
    .sort((a, b) => b.cards - a.cards || a.name.localeCompare(b.name));
}
