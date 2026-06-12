import type { WcLiveScore } from '@dap/shared';

export interface LiveScoresResult {
  scores: WcLiveScore[];
  /** When the Worker last fetched these from the feed (ISO), for staleness. */
  fetchedAt: string | null;
}

/**
 * Fetch live/finished World Cup scores from our Worker proxy (which holds the
 * football-data.org key server-side and caches ~20s, so many devices reloading
 * never blow the rate limit). Returns empty when no backend is configured or the
 * feed is unavailable — callers treat that as "nothing to apply".
 */
export async function fetchLiveScores(): Promise<LiveScoresResult> {
  const base = import.meta.env.VITE_API_BASE?.trim();
  if (!base) return { scores: [], fetchedAt: null };
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/football/worldcup`);
    if (!res.ok) return { scores: [], fetchedAt: null };
    const data = (await res.json()) as { scores?: WcLiveScore[]; fetchedAt?: string | null };
    return {
      scores: Array.isArray(data.scores) ? data.scores : [],
      fetchedAt: data.fetchedAt ?? null,
    };
  } catch {
    return { scores: [], fetchedAt: null };
  }
}
