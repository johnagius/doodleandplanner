import { useEffect, useState } from 'react';

// Per-name caches so a card's photo is fetched once and reused (cards re-render
// a lot). Photos come from Wikimedia Commons (CC-licensed) via Wikipedia search.
const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

/** Best-effort player photo (Wikipedia/Wikimedia). Null when none is found — the
 * card falls back to flag art. Searches "<name> footballer" so fringe squad
 * players resolve too. CORS-enabled (origin=*), so it runs straight from the app. */
export async function fetchPlayerPhoto(name: string): Promise<string | null> {
  if (cache.has(name)) return cache.get(name) ?? null;
  const existing = inflight.get(name);
  if (existing) return existing;
  const p = (async (): Promise<string | null> => {
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
      const pages = data.query?.pages ?? {};
      for (const k of Object.keys(pages)) {
        const src = pages[k]?.thumbnail?.source;
        if (src) return src;
      }
      return null;
    } catch {
      return null;
    }
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
