import type { ClubFeedFixture, ISODateTime } from '@dap/shared';

export interface ClubFeedResult {
  fixtures: ClubFeedFixture[];
  /** The window the feed covered, so the board scopes pruning to it. */
  window: { from: ISODateTime; to: ISODateTime } | null;
  fetchedAt: string | null;
}

/**
 * Fetch the automatic club fixtures from our Worker proxy, which pulls every
 * tracked competition's ESPN scoreboard for a rolling upcoming window and caches
 * the merged result (~3 min) so many devices polling never hammer the upstream.
 * Returns empty when no backend is configured or the feed is unavailable —
 * callers treat that as "nothing to apply".
 */
export async function fetchClubFixtures(): Promise<ClubFeedResult> {
  const base = import.meta.env.VITE_API_BASE?.trim();
  if (!base) return { fixtures: [], window: null, fetchedAt: null };
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/football/club-fixtures`);
    if (!res.ok) return { fixtures: [], window: null, fetchedAt: null };
    const data = (await res.json()) as {
      fixtures?: ClubFeedFixture[];
      window?: { from: string; to: string } | null;
      fetchedAt?: string | null;
    };
    return {
      fixtures: Array.isArray(data.fixtures) ? data.fixtures : [],
      window: data.window ?? null,
      fetchedAt: data.fetchedAt ?? null,
    };
  } catch {
    return { fixtures: [], window: null, fetchedAt: null };
  }
}
