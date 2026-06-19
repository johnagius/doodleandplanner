/**
 * Ephemeral live-match reactions — floating emoji while a game is in play.
 * Never persisted: they ride the same presence channel as doodle cursors and
 * live map locations (relayed by the Worker without touching room state, and
 * cross-tab via BroadcastChannel offline), so they leave no trace in history,
 * the leaderboard or scoring.
 */
export const WC_LIVE_REACTION_EMOJI = ['🔥', '⚽', '😱', '👏', '🙌'] as const;

export interface WcLiveReaction {
  kind: 'wc-reaction';
  matchId: string;
  emoji: string;
  /** Send time (ms). Floats are pruned by their own timer; this is for ordering. */
  at: number;
}

/** Build a presence payload for a tapped reaction. */
export function liveReaction(
  matchId: string,
  emoji: string,
  at: number = Date.now(),
): WcLiveReaction {
  return { kind: 'wc-reaction', matchId, emoji, at };
}

/** Type guard for an incoming presence payload (other features share the channel). */
export function isLiveReaction(value: unknown): value is WcLiveReaction {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    r.kind === 'wc-reaction' &&
    typeof r.matchId === 'string' &&
    typeof r.emoji === 'string' &&
    typeof r.at === 'number'
  );
}
