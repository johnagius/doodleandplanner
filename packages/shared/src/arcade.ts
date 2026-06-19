/**
 * Arcade mini-games for killing time before kickoff — a self-contained
 * high-score side-show that never touches the prediction scoring. Best score
 * per game per player lives in {@link WorldCupState.arcade} and syncs through the
 * same Repository as everything else, so friends compete across devices.
 */
import type { WorldCupState } from './worldcup.js';

export type WcArcadeGame = 'basketball' | 'freekick' | 'penalty';

export interface WcArcadeGameMeta {
  key: WcArcadeGame;
  name: string;
  emoji: string;
  tagline: string;
}

export const WC_ARCADE_GAMES: WcArcadeGameMeta[] = [
  {
    key: 'basketball',
    name: 'Free Throws',
    emoji: '🏀',
    tagline: "Sink it, then step back. Miss 3 in a row and you're out.",
  },
  {
    key: 'freekick',
    name: 'Free Kicks',
    emoji: '⚽',
    tagline: 'Beat the keeper, further out every time. 3 straight misses ends it.',
  },
  {
    key: 'penalty',
    name: 'Penalties',
    emoji: '🥅',
    tagline: 'Same spot, just you and the keeper. 3 straight misses and it’s over.',
  },
];

export function isArcadeGame(key: string): key is WcArcadeGame {
  return key === 'basketball' || key === 'freekick' || key === 'penalty';
}

export interface WcArcadeRow {
  predictorId: string;
  name: string;
  best: number;
}

/**
 * Record a finished run's score as a player's new best for a game — but only if
 * it beats their existing best (and is a positive whole number). Immutable.
 */
export function recordArcadeScore(
  state: WorldCupState,
  game: WcArcadeGame,
  predictorId: string,
  score: number,
): WorldCupState {
  if (!Number.isFinite(score) || score <= 0) return state;
  const next = Math.floor(score);
  const arcade = { ...(state.arcade ?? {}) };
  const forGame = { ...(arcade[game] ?? {}) };
  if ((forGame[predictorId] ?? 0) >= next) return state; // not a new best
  forGame[predictorId] = next;
  arcade[game] = forGame;
  return { ...state, arcade };
}

/** A game's high-score table, best first (only players who've scored). */
export function arcadeLeaderboard(state: WorldCupState, game: WcArcadeGame): WcArcadeRow[] {
  const scores = state.arcade?.[game] ?? {};
  return state.predictors
    .map((p) => ({ predictorId: p.id, name: p.name, best: scores[p.id] ?? 0 }))
    .filter((r) => r.best > 0)
    .sort((a, b) => b.best - a.best || a.name.localeCompare(b.name));
}

/** A player's best score in a game (0 if they've never scored). */
export function arcadeBest(
  state: WorldCupState,
  game: WcArcadeGame,
  predictorId: string | null,
): number {
  if (!predictorId) return 0;
  return state.arcade?.[game]?.[predictorId] ?? 0;
}
