import {
  CLUB_ESPN_LEAGUES,
  parseClubMatch,
  type ClubFixture,
  type ClubMatchInfo,
} from '@dap/shared';
import { useEffect, useState } from 'react';

const SLUG_BY_COMP: Record<string, string> = Object.fromEntries(
  CLUB_ESPN_LEAGUES.map((l) => [l.competitionId, l.slug]),
);

// Cache match-centre info per fixture for the session — it's context, not game
// state, so it never touches the synced room. Also de-dupes in-flight fetches.
const cache = new Map<string, ClubMatchInfo | null>();
const inflight = new Map<string, Promise<ClubMatchInfo | null>>();

/** Fetch + parse the ESPN match-centre summary for a fixture (null if it isn't a
 * feed fixture, the competition isn't mapped, or the request fails). */
export async function fetchClubMatch(fixture: ClubFixture): Promise<ClubMatchInfo | null> {
  const slug = SLUG_BY_COMP[fixture.competitionId];
  const ext = fixture.externalId;
  if (!slug || !ext?.startsWith('espn:')) return null;
  if (cache.has(fixture.id)) return cache.get(fixture.id)!;
  const existing = inflight.get(fixture.id);
  if (existing) return existing;

  const id = ext.slice('espn:'.length);
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/summary?event=${id}`;
  const p = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const info = parseClubMatch(await res.json());
      cache.set(fixture.id, info);
      return info;
    } catch {
      return null;
    } finally {
      inflight.delete(fixture.id);
    }
  })();
  inflight.set(fixture.id, p);
  return p;
}

/** Load match-centre info for a fixture, only while `active` (e.g. a modal open). */
export function useClubMatch(
  fixture: ClubFixture,
  active: boolean,
): { info: ClubMatchInfo | null; loading: boolean } {
  const [info, setInfo] = useState<ClubMatchInfo | null>(() => cache.get(fixture.id) ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active) return;
    if (cache.has(fixture.id)) {
      setInfo(cache.get(fixture.id)!);
      return;
    }
    let alive = true;
    setLoading(true);
    void fetchClubMatch(fixture).then((res) => {
      if (!alive) return;
      setInfo(res);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [fixture, active]);

  return { info, loading };
}
