import { useEffect, useState } from 'react';

/**
 * Best-effort post-match highlight reel from TheSportsDB — the free, no-key,
 * CORS source we already use for player data. Its day-events feed carries a
 * `strVideo` YouTube link once a game's highlights are up. We resolve a board
 * match to that event by date + team names, since TheSportsDB uses its own ids.
 * Null when there's no clip (many games never get one), or offline.
 */
interface TsdbEvent {
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  strLeague?: string | null;
  strVideo?: string | null;
}

const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .trim();

/** Bridge the handful of country names our data and TheSportsDB spell apart
 * (acronyms/alternate forms that plain containment can't catch). */
const ALIASES: Record<string, string> = {
  usa: 'united states',
  'united states of america': 'united states',
  'korea republic': 'south korea',
  'korea dpr': 'north korea',
  'ir iran': 'iran',
  'china pr': 'china',
  'cote divoire': 'ivory coast',
};
const canon = (s: string): string => {
  const n = norm(s);
  return ALIASES[n] ?? n;
};

/** Find a World Cup event's highlight URL by team names (either orientation),
 * bridging spelling gaps via the alias map plus loose substring containment. */
export function pickHighlight(
  events: TsdbEvent[],
  homeName: string,
  awayName: string,
): string | null {
  const a = canon(homeName);
  const b = canon(awayName);
  const like = (x: string, y: string): boolean =>
    !!x && !!y && (x === y || (x.length > 3 && y.length > 3 && (x.includes(y) || y.includes(x))));
  for (const e of events) {
    const video = (e.strVideo ?? '').trim();
    if (!video) continue;
    if (!/world cup/i.test(e.strLeague ?? '')) continue;
    const h = canon(e.strHomeTeam ?? '');
    const w = canon(e.strAwayTeam ?? '');
    if ((like(h, a) && like(w, b)) || (like(h, b) && like(w, a))) return video;
  }
  return null;
}

const dayOf = (iso: string): string => iso.slice(0, 10);
const dayBefore = (date: string): string =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);

const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

async function fetchDay(date: string): Promise<TsdbEvent[]> {
  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${date}&s=Soccer`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { events?: TsdbEvent[] | null };
    return data.events ?? [];
  } catch {
    return [];
  }
}

async function resolve(
  homeName: string,
  awayName: string,
  kickoffIso: string,
): Promise<string | null> {
  // WC kickoffs in the Americas can land on the next UTC day, so check both.
  const dates = [dayOf(kickoffIso), dayBefore(dayOf(kickoffIso))];
  for (const d of dates) {
    const url = pickHighlight(await fetchDay(d), homeName, awayName);
    if (url) return url;
  }
  return null;
}

export async function fetchMatchHighlight(
  homeName: string,
  awayName: string,
  kickoffIso: string,
): Promise<string | null> {
  const key = `${homeName}|${awayName}|${dayOf(kickoffIso)}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = resolve(homeName, awayName, kickoffIso);
  inflight.set(key, promise);
  const result = await promise;
  cache.set(key, result);
  inflight.delete(key);
  return result;
}

/** Highlight URL for a match. `enabled` should be true only once it's finished
 * (clips don't exist before then), to avoid pointless lookups. */
export function useMatchHighlight(
  homeName: string | undefined,
  awayName: string | undefined,
  kickoffIso: string | undefined,
  enabled: boolean,
): { url: string | null; loading: boolean } {
  const on = enabled && !!homeName && !!awayName && !!kickoffIso;
  const key = on ? `${homeName}|${awayName}|${dayOf(kickoffIso!)}` : '';
  const [url, setUrl] = useState<string | null>(() => (key ? (cache.get(key) ?? null) : null));
  const [loading, setLoading] = useState(on && !cache.has(key));
  useEffect(() => {
    if (!on) {
      setUrl(null);
      setLoading(false);
      return;
    }
    if (cache.has(key)) {
      setUrl(cache.get(key) ?? null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void fetchMatchHighlight(homeName!, awayName!, kickoffIso!).then((u) => {
      if (active) {
        setUrl(u);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [on, key, homeName, awayName, kickoffIso]);
  return { url, loading };
}
