/**
 * "Who's watching now" presence for the immersive Match Room. Rides the same
 * ephemeral presence channel as the live reactions (relayed by the Worker, and
 * cross-tab via BroadcastChannel offline) — never persisted, never touches the
 * leaderboard or scoring. Other features share the channel, so every inbound
 * payload is validated by a `kind`-tagged guard.
 */
export interface WcWatching {
  kind: 'wc-watching';
  matchId: string;
  /** Predictor id, or an ephemeral anon id when no name is picked yet. */
  memberId: string;
  name: string | null;
  /** Heartbeat time (ms) — entries are TTL-pruned by the watcher hook. */
  at: number;
}

export function watching(
  matchId: string,
  memberId: string,
  name: string | null,
  at: number = Date.now(),
): WcWatching {
  return { kind: 'wc-watching', matchId, memberId, name, at };
}

export function isWatching(value: unknown): value is WcWatching {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    r.kind === 'wc-watching' &&
    typeof r.matchId === 'string' &&
    typeof r.memberId === 'string' &&
    (r.name === null || typeof r.name === 'string') &&
    typeof r.at === 'number'
  );
}

/** Sent when a watcher leaves, so others drop them without waiting for TTL. */
export interface WcWatchLeave {
  kind: 'wc-watch-leave';
  matchId: string;
  memberId: string;
}

export function watchLeave(matchId: string, memberId: string): WcWatchLeave {
  return { kind: 'wc-watch-leave', matchId, memberId };
}

export function isWatchLeave(value: unknown): value is WcWatchLeave {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    r.kind === 'wc-watch-leave' && typeof r.matchId === 'string' && typeof r.memberId === 'string'
  );
}
