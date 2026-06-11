import type { WcLiveScore } from '@dap/shared';

/**
 * Fetch live/finished World Cup scores from our Worker proxy (which holds the
 * football-data.org key server-side). Returns [] when no backend is configured
 * or the feed is unavailable — callers treat that as "nothing to apply".
 */
export async function fetchLiveScores(): Promise<WcLiveScore[]> {
  const base = import.meta.env.VITE_API_BASE?.trim();
  if (!base) return [];
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/football/worldcup`);
    if (!res.ok) return [];
    const data = (await res.json()) as { scores?: WcLiveScore[] };
    return Array.isArray(data.scores) ? data.scores : [];
  } catch {
    return [];
  }
}
