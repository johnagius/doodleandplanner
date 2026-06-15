import { useEffect, useState } from 'react';

// Per-name caches so a card's photo is fetched once and reused (cards re-render
// a lot). We try Wikipedia/Wikimedia first, then TheSportsDB, then give up and
// let the card fall back to flag art. Both sources are CORS-enabled.
const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

/** Wikipedia/Wikimedia thumbnail for "<name> footballer" (CC-licensed). */
async function fromWikipedia(name: string): Promise<string | null> {
  try {
    const url =
      'https://en.wikipedia.org/w/api.php?action=query&generator=search' +
      `&gsrsearch=${encodeURIComponent(name + ' footballer')}` +
      '&gsrlimit=1&prop=pageimages&piprop=thumbnail&pithumbsize=256&format=json&origin=*';
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      query?: { pages?: Record<string, { thumbnail?: { source?: string } }> };
    };
    for (const page of Object.values(data.query?.pages ?? {})) {
      const src = page?.thumbnail?.source;
      if (src) return src;
    }
    return null;
  } catch {
    return null;
  }
}

/** TheSportsDB player image — a free, no-key fallback with good footballer
 * coverage (transparent cutout preferred, then thumbnail). */
async function fromSportsDb(name: string): Promise<string | null> {
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(
      name,
    )}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      player?: { strCutout?: string | null; strThumb?: string | null; strSport?: string }[] | null;
    };
    // Prefer a soccer match when the API returns several same-named athletes.
    const players = data.player ?? [];
    const soccer = players.find((p) => p.strSport === 'Soccer') ?? players[0];
    const src = soccer?.strCutout || soccer?.strThumb;
    return src ? src : null;
  } catch {
    return null;
  }
}

/** Best-effort player photo, trying each source in turn. Null when none is found
 * — the card falls back to flag art. Cached (and de-duped) per name. */
export async function fetchPlayerPhoto(name: string): Promise<string | null> {
  if (cache.has(name)) return cache.get(name) ?? null;
  const existing = inflight.get(name);
  if (existing) return existing;
  const p = (async (): Promise<string | null> => {
    for (const source of [fromWikipedia, fromSportsDb]) {
      const src = await source(name);
      if (src) return src;
    }
    return null;
  })();
  inflight.set(name, p);
  const result = await p;
  cache.set(name, result);
  inflight.delete(name);
  return result;
}

/** A player's photo URL, or null (use flag art) — loads lazily, cached per name. */
export function usePlayerPhoto(name: string): string | null {
  const [photo, setPhoto] = useState<string | null>(() => cache.get(name) ?? null);
  useEffect(() => {
    if (cache.has(name)) {
      setPhoto(cache.get(name) ?? null);
      return;
    }
    let active = true;
    void fetchPlayerPhoto(name).then((p) => {
      if (active) setPhoto(p);
    });
    return () => {
      active = false;
    };
  }, [name]);
  return photo;
}
