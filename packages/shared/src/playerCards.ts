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

/**
 * Cards a predictor has won: one for every resolved match where they (jointly)
 * scored the most points — skill to top the match, luck on which player drops.
 * **No duplicates** — a player already in the collection is skipped to the next
 * free one. Processed in a stable match order so the draw is deterministic and
 * earlier cards never change as later ones are won.
 */
export function cardsWonBy(state: WorldCupState, predictorId: string): WcWonCard[] {
  const won = state.matches
    .filter((m) => !!m.result && closestPredictors(state, m.id).includes(predictorId))
    .sort((a, b) => a.order - b.order);
  const taken = new Set<number>();
  const out: WcWonCard[] = [];
  for (const m of won) {
    let idx = hash(m.id + '|' + predictorId) % WC_SQUADS.length;
    let guard = 0;
    while (taken.has(WC_SQUADS[idx]!.id) && guard++ < WC_SQUADS.length) {
      idx = (idx + 1) % WC_SQUADS.length;
    }
    const player = WC_SQUADS[idx]!;
    taken.add(player.id);
    out.push({ matchId: m.id, player });
  }
  return out;
}

export interface WcCardLeaderRow {
  predictorId: string;
  name: string;
  cards: number;
}

/** Card-count standings, most cards first. */
export function cardLeaderboard(state: WorldCupState): WcCardLeaderRow[] {
  return state.predictors
    .map((p) => ({ predictorId: p.id, name: p.name, cards: cardsWonBy(state, p.id).length }))
    .sort((a, b) => b.cards - a.cards || a.name.localeCompare(b.name));
}
