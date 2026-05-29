/** Ephemeral live-cursor presence state (never persisted). */
export interface Cursor {
  memberId: string;
  name: string;
  color: string;
  /** Normalised canvas coordinates 0..1. */
  x: number;
  y: number;
  /** Timestamp (ms) of the last update, for pruning stale cursors. */
  at: number;
}

export type CursorMap = Record<string, Cursor>;

/** Upsert a cursor by member id. */
export function applyCursor(map: CursorMap, cursor: Cursor): CursorMap {
  return { ...map, [cursor.memberId]: cursor };
}

/** Drop cursors older than `ttlMs`; returns the same reference if unchanged. */
export function pruneCursors(map: CursorMap, now: number, ttlMs = 5000): CursorMap {
  const entries = Object.entries(map).filter(([, c]) => now - c.at <= ttlMs);
  if (entries.length === Object.keys(map).length) return map;
  return Object.fromEntries(entries);
}

/** Type guard for an incoming presence payload. */
export function isCursor(value: unknown): value is Cursor {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.memberId === 'string' &&
    typeof c.x === 'number' &&
    typeof c.y === 'number' &&
    typeof c.at === 'number'
  );
}
