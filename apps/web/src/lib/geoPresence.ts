/**
 * Ephemeral, opt-in live member locations shared over the presence channel
 * (never persisted). Distinguished from doodle cursor frames by `kind: 'geo'`.
 */
export interface LivePresence {
  kind: 'geo';
  memberId: string;
  name: string;
  color: string;
  lat: number;
  lng: number;
  /** Timestamp (ms) of the last update, for pruning stale markers. */
  at: number;
}

export type PresenceMap = Record<string, LivePresence>;

export function applyPresence(map: PresenceMap, p: LivePresence): PresenceMap {
  return { ...map, [p.memberId]: p };
}

/** Drop locations older than `ttlMs`; returns the same reference if unchanged. */
export function prunePresence(map: PresenceMap, now: number, ttlMs = 30000): PresenceMap {
  const entries = Object.entries(map).filter(([, p]) => now - p.at <= ttlMs);
  if (entries.length === Object.keys(map).length) return map;
  return Object.fromEntries(entries);
}

export function isLivePresence(value: unknown): value is LivePresence {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    p.kind === 'geo' &&
    typeof p.memberId === 'string' &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    typeof p.at === 'number'
  );
}
