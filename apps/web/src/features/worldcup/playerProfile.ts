import { useEffect, useState } from 'react';

/**
 * Best-effort player bio from TheSportsDB — the same free, CORS-enabled, no-key
 * source we already use for photos, but reading the richer fields: current club
 * ("where they play"), nationality, position, birth date, height and a blurb.
 * Cached + de-duped per name. Null when nothing is found (or offline).
 */
export interface PlayerProfile {
  club: string | null;
  nationality: string | null;
  position: string | null;
  born: string | null;
  height: string | null;
  description: string | null;
}

const cache = new Map<string, PlayerProfile | null>();
const inflight = new Map<string, Promise<PlayerProfile | null>>();

async function fetchProfile(name: string): Promise<PlayerProfile | null> {
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(
      name,
    )}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      player?:
        | {
            strSport?: string;
            strTeam?: string | null;
            strNationality?: string | null;
            strPosition?: string | null;
            dateBorn?: string | null;
            strHeight?: string | null;
            strDescriptionEN?: string | null;
          }[]
        | null;
    };
    const players = data.player ?? [];
    const p = players.find((x) => x.strSport === 'Soccer') ?? players[0];
    if (!p) return null;
    return {
      club: p.strTeam || null,
      nationality: p.strNationality || null,
      position: p.strPosition || null,
      born: p.dateBorn || null,
      height: p.strHeight || null,
      description: p.strDescriptionEN || null,
    };
  } catch {
    return null;
  }
}

export async function fetchPlayerProfile(name: string): Promise<PlayerProfile | null> {
  if (cache.has(name)) return cache.get(name) ?? null;
  const existing = inflight.get(name);
  if (existing) return existing;
  const promise = fetchProfile(name);
  inflight.set(name, promise);
  const result = await promise;
  cache.set(name, result);
  inflight.delete(name);
  return result;
}

export function usePlayerProfile(name: string): {
  profile: PlayerProfile | null;
  loading: boolean;
} {
  const [profile, setProfile] = useState<PlayerProfile | null>(() => cache.get(name) ?? null);
  const [loading, setLoading] = useState(!cache.has(name));
  useEffect(() => {
    if (cache.has(name)) {
      setProfile(cache.get(name) ?? null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void fetchPlayerProfile(name).then((p) => {
      if (active) {
        setProfile(p);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [name]);
  return { profile, loading };
}
