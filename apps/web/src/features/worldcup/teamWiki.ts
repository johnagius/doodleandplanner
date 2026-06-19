import type { WcTeam } from '@dap/shared';
import { useEffect, useState } from 'react';

/**
 * A short team blurb from Wikipedia's free, CORS-enabled REST summary (the same
 * Wikimedia source we use for photos — no key). We try the national-team page
 * first, then fall back to the country page if that's missing/ambiguous.
 */
export interface TeamWiki {
  extract: string;
  thumbnail: string | null;
  url: string | null;
}

// Nations whose national-team page is titled "… soccer team" (or otherwise not
// "{name} national football team"), so the plain guess would miss or mis-resolve.
const TITLE_OVERRIDE: Record<string, string> = {
  USA: "United States men's national soccer team",
  CAN: "Canada men's national soccer team",
};

interface WikiSummary {
  type?: string;
  extract?: string;
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string }; mobile?: { page?: string } };
}

async function fetchSummary(title: string): Promise<TeamWiki | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as WikiSummary;
    if (data.type === 'disambiguation' || !data.extract) return null;
    return {
      extract: data.extract,
      thumbnail: data.thumbnail?.source ?? null,
      url: data.content_urls?.desktop?.page ?? data.content_urls?.mobile?.page ?? null,
    };
  } catch {
    return null;
  }
}

const cache = new Map<string, TeamWiki | null>();
const inflight = new Map<string, Promise<TeamWiki | null>>();

async function resolveTeamWiki(team: WcTeam): Promise<TeamWiki | null> {
  const teamTitle = TITLE_OVERRIDE[team.id] ?? `${team.name} national football team`;
  return (await fetchSummary(teamTitle)) ?? (await fetchSummary(team.name));
}

export async function fetchTeamWiki(team: WcTeam): Promise<TeamWiki | null> {
  if (cache.has(team.id)) return cache.get(team.id) ?? null;
  const existing = inflight.get(team.id);
  if (existing) return existing;
  const promise = resolveTeamWiki(team);
  inflight.set(team.id, promise);
  const result = await promise;
  cache.set(team.id, result);
  inflight.delete(team.id);
  return result;
}

export function useTeamWiki(team: WcTeam | undefined): { wiki: TeamWiki | null; loading: boolean } {
  const [wiki, setWiki] = useState<TeamWiki | null>(() =>
    team ? (cache.get(team.id) ?? null) : null,
  );
  const [loading, setLoading] = useState(!!team && !cache.has(team.id));
  useEffect(() => {
    if (!team) {
      setWiki(null);
      setLoading(false);
      return;
    }
    if (cache.has(team.id)) {
      setWiki(cache.get(team.id) ?? null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void fetchTeamWiki(team).then((w) => {
      if (active) {
        setWiki(w);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [team]);
  return { wiki, loading };
}
