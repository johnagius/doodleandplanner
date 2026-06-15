import type { WcLiveScore, WcMatchEvent } from '@dap/shared';

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

/**
 * Fetch goals + cards for every match from the Worker (which pulls the whole
 * tournament from ESPN and caches it). Keyed by the sorted team-code pair, so
 * callers map it to board matches the same way as live scores.
 */
export async function fetchMatchEvents(): Promise<Record<string, WcMatchEvent[]>> {
  const base = import.meta.env.VITE_API_BASE?.trim();
  if (!base) return {};
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/football/events`);
    if (!res.ok) return {};
    const data = (await res.json()) as { events?: Record<string, WcMatchEvent[]> };
    return data.events ?? {};
  } catch {
    return {};
  }
}
