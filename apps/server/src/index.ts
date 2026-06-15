/**
 * Worker entry point. Routes API requests to the per-room Durable Object,
 * deriving the room's DO id from its slug.
 */
import {
  espnDateWindow,
  mergeLiveScores,
  parseEspnEventIds,
  parseEspnLineups,
  parseEspnMatchEvents,
  parseEspnScoreboard,
} from './espn.js';
import { findWcMatch, mapHeadToHead, mapWorldCupScores } from './football.js';
import { RoomDurableObject, type Env } from './roomObject.js';
import { corsHeaders, json, route } from './router.js';
import type { WcLineup, WcLineupPlayer, WcMatchEvent, WcTeamH2H, WcLiveScore } from '@dap/shared';

const ESPN_UA = { 'User-Agent': 'doodleandplanner/1.0 (+world-cup board)' };
const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary';

export { RoomDurableObject };

// Short-lived cache for the merged live feed. ESPN (no key, ~real-time, carries
// the live minute) is the primary source; football-data.org is the official
// full-time result + fallback. Both are shared via this cache so many devices
// polling never hammer either upstream. `at` is surfaced as `fetchedAt`.
let scoresCache: { at: number; scores: WcLiveScore[] } | null = null;
const SCORES_TTL_MS = 15_000;

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
// Whole-tournament window for goals/cards (one call, cached ~1 min, shared).
const WC_EVENTS_RANGE = '20260611-20260719';
let eventsCache: { at: number; events: Record<string, WcMatchEvent[]> } | null = null;
const EVENTS_TTL_MS = 60_000;
// ESPN event id per team-pair (to resolve a match → its summary), and the parsed
// starting XIs per event id. Lineups are static once posted, so cache for a while.
let idsCache: { at: number; ids: Record<string, string> } | null = null;
const IDS_TTL_MS = 5 * 60_000;
const lineupCache = new Map<string, { at: number; byCode: Record<string, WcLineupPlayer[]> }>();
const LINEUP_TTL_MS = 5 * 60_000;

// Raw WC fixtures (kept to resolve a team-pair → match id for head-to-head) and
// per-pair head-to-head results. H2H barely changes, so it's cached for longer.
let matchesCache: { at: number; raw: unknown } | null = null;
const MATCHES_TTL_MS = 5 * 60_000;
const h2hCache = new Map<string, { at: number; h2h: WcTeamH2H | null }>();
const H2H_TTL_MS = 60 * 60_000;

const FD_BASE = 'https://api.football-data.org/v4';

async function fetchWcMatchesRaw(env: Env): Promise<unknown> {
  if (matchesCache && Date.now() - matchesCache.at < MATCHES_TTL_MS) return matchesCache.raw;
  const res = await fetch(`${FD_BASE}/competitions/WC/matches`, {
    headers: { 'X-Auth-Token': env.FOOTBALL_DATA_TOKEN ?? '' },
  });
  if (!res.ok) throw new Error(`upstream-${res.status}`);
  const raw = await res.json();
  matchesCache = { at: Date.now(), raw };
  return raw;
}

async function worldCupH2H(
  env: Env,
  cors: Record<string, string>,
  aTla: string,
  bTla: string,
): Promise<Response> {
  if (!env.FOOTBALL_DATA_TOKEN) {
    return json({ h2h: null, error: 'not-configured' }, { status: 503 }, cors);
  }
  if (!aTla || !bTla) return json({ h2h: null, error: 'bad-request' }, { status: 400 }, cors);
  const key = [aTla, bTla].sort().join('-');
  const cached = h2hCache.get(key);
  if (cached && Date.now() - cached.at < H2H_TTL_MS) return json({ h2h: cached.h2h }, {}, cors);
  try {
    const found = findWcMatch(await fetchWcMatchesRaw(env), aTla, bTla);
    if (!found) {
      h2hCache.set(key, { at: Date.now(), h2h: null });
      return json({ h2h: null }, {}, cors);
    }
    const res = await fetch(`${FD_BASE}/matches/${found.id}/head2head?limit=5`, {
      headers: { 'X-Auth-Token': env.FOOTBALL_DATA_TOKEN },
    });
    if (!res.ok) {
      return json({ h2h: cached?.h2h ?? null, error: `upstream-${res.status}` }, {}, cors);
    }
    const h2h = mapHeadToHead(await res.json(), found.homeTla, found.awayTla);
    h2hCache.set(key, { at: Date.now(), h2h });
    return json({ h2h }, {}, cors);
  } catch {
    return json({ h2h: cached?.h2h ?? null, error: 'unavailable' }, {}, cors);
  }
}

/** football-data.org WC fixtures → our scores, or null on error / no token. */
async function fetchFdScores(env: Env): Promise<WcLiveScore[] | null> {
  if (!env.FOOTBALL_DATA_TOKEN) return null;
  try {
    const res = await fetch(`${FD_BASE}/competitions/WC/matches`, {
      headers: { 'X-Auth-Token': env.FOOTBALL_DATA_TOKEN },
    });
    if (!res.ok) return null;
    return mapWorldCupScores(await res.json());
  } catch {
    return null;
  }
}

/** ESPN scoreboard across a Malta-safe UTC day window → our scores, or null. */
async function fetchEspnScores(): Promise<WcLiveScore[] | null> {
  try {
    const pages = await Promise.all(
      espnDateWindow(new Date()).map((d) =>
        fetch(`${ESPN_BASE}?dates=${d}`, {
          headers: { 'User-Agent': 'doodleandplanner/1.0 (+world-cup board)' },
        })
          .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
          .catch(() => null),
      ),
    );
    // Dedupe events by id (a game can appear on adjacent day pages).
    const seen = new Set<string | number>();
    const events: unknown[] = [];
    for (const page of pages) {
      for (const ev of (page as { events?: { id?: string | number }[] } | null)?.events ?? []) {
        const id = ev?.id ?? JSON.stringify(ev);
        if (seen.has(id)) continue;
        seen.add(id);
        events.push(ev);
      }
    }
    if (events.length === 0) return null;
    return parseEspnScoreboard({ events });
  } catch {
    return null;
  }
}

async function worldCupScores(env: Env, cors: Record<string, string>): Promise<Response> {
  const stamp = (at: number | undefined) => (at ? new Date(at).toISOString() : null);
  if (scoresCache && Date.now() - scoresCache.at < SCORES_TTL_MS) {
    return json({ scores: scoresCache.scores, fetchedAt: stamp(scoresCache.at) }, {}, cors);
  }

  // ESPN is primary (real-time + minute); football-data is official + fallback.
  const [espn, fd] = await Promise.all([fetchEspnScores(), fetchFdScores(env)]);

  if (!espn && !fd) {
    // Nothing fresh — serve the last good snapshot, else signal why.
    if (scoresCache) {
      return json(
        { scores: scoresCache.scores, fetchedAt: stamp(scoresCache.at), error: 'unavailable' },
        {},
        cors,
      );
    }
    const error = env.FOOTBALL_DATA_TOKEN ? 'unavailable' : 'not-configured';
    return json({ scores: [], fetchedAt: null, error }, { status: 503 }, cors);
  }

  const scores = mergeLiveScores(fd ?? [], espn ?? []);
  scoresCache = { at: Date.now(), scores };
  return json({ scores, fetchedAt: stamp(scoresCache.at) }, {}, cors);
}

/** Goals + cards for every match, from ESPN's whole-tournament scoreboard. */
async function worldCupEvents(cors: Record<string, string>): Promise<Response> {
  const stamp = (at: number | undefined) => (at ? new Date(at).toISOString() : null);
  if (eventsCache && Date.now() - eventsCache.at < EVENTS_TTL_MS) {
    return json({ events: eventsCache.events, fetchedAt: stamp(eventsCache.at) }, {}, cors);
  }
  try {
    const res = await fetch(`${ESPN_BASE}?dates=${WC_EVENTS_RANGE}`, {
      headers: { 'User-Agent': 'doodleandplanner/1.0 (+world-cup board)' },
    });
    if (!res.ok) {
      return json(
        {
          events: eventsCache?.events ?? {},
          fetchedAt: stamp(eventsCache?.at),
          error: `upstream-${res.status}`,
        },
        {},
        cors,
      );
    }
    const events = parseEspnMatchEvents(await res.json());
    eventsCache = { at: Date.now(), events };
    return json({ events, fetchedAt: stamp(eventsCache.at) }, {}, cors);
  } catch {
    return json(
      {
        events: eventsCache?.events ?? {},
        fetchedAt: stamp(eventsCache?.at),
        error: 'unavailable',
      },
      {},
      cors,
    );
  }
}

/** Resolve the ESPN event id for each team-pair (cached from the range board). */
async function ensureEventIds(): Promise<Record<string, string>> {
  if (idsCache && Date.now() - idsCache.at < IDS_TTL_MS) return idsCache.ids;
  try {
    const res = await fetch(`${ESPN_BASE}?dates=${WC_EVENTS_RANGE}`, { headers: ESPN_UA });
    if (!res.ok) return idsCache?.ids ?? {};
    const ids = parseEspnEventIds(await res.json());
    idsCache = { at: Date.now(), ids };
    return ids;
  } catch {
    return idsCache?.ids ?? {};
  }
}

/** Starting XIs for a match (~1h before kickoff), from ESPN's per-match summary. */
async function worldCupLineups(
  home: string,
  away: string,
  cors: Record<string, string>,
): Promise<Response> {
  const stamp = (at: number | undefined) => (at ? new Date(at).toISOString() : null);
  if (!home || !away) {
    return json({ home: null, away: null, fetchedAt: null, error: 'bad-request' }, { status: 400 }, cors); // prettier-ignore
  }
  const eventId = (await ensureEventIds())[[home, away].sort().join('|')];
  if (!eventId) {
    return json({ home: null, away: null, fetchedAt: null, error: 'not-found' }, {}, cors);
  }
  let entry = lineupCache.get(eventId);
  if (!entry || Date.now() - entry.at >= LINEUP_TTL_MS) {
    try {
      const res = await fetch(`${ESPN_SUMMARY}?event=${eventId}`, { headers: ESPN_UA });
      if (res.ok) {
        entry = { at: Date.now(), byCode: parseEspnLineups(await res.json()) };
        lineupCache.set(eventId, entry);
      }
    } catch {
      /* keep any stale entry */
    }
  }
  const byCode = entry?.byCode ?? {};
  const lineup = (code: string): WcLineup | null =>
    byCode[code]?.length ? { teamTla: code, players: byCode[code]! } : null;
  return json({ home: lineup(home), away: lineup(away), fetchedAt: stamp(entry?.at) }, {}, cors);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const r = route(request.method, url.pathname);
    const cors = corsHeaders(request.headers.get('Origin'), env.ALLOWED_ORIGINS);

    if (r.kind === 'preflight') return new Response(null, { status: 204, headers: cors });
    if (r.kind === 'health') return json({ ok: true }, {}, cors);
    if (r.kind === 'wc-scores') return worldCupScores(env, cors);
    if (r.kind === 'wc-events') return worldCupEvents(cors);
    if (r.kind === 'wc-lineups') {
      return worldCupLineups(
        url.searchParams.get('home') ?? '',
        url.searchParams.get('away') ?? '',
        cors,
      );
    }
    if (r.kind === 'wc-h2h') {
      return worldCupH2H(
        env,
        cors,
        url.searchParams.get('home') ?? '',
        url.searchParams.get('away') ?? '',
      );
    }
    if (r.kind === 'not-found') return json({ error: 'Not found' }, { status: 404 }, cors);

    // Every room route needs a slug; for create it lives in the request body.
    let slug: string;
    if (r.kind === 'create') {
      const peek = (await request
        .clone()
        .json()
        .catch(() => null)) as { room?: { slug?: string } } | null;
      if (!peek?.room?.slug) return json({ error: 'Invalid room' }, { status: 400 }, cors);
      slug = peek.room.slug;
    } else {
      slug = r.slug;
    }

    const id = env.ROOMS.idFromName(slug);
    return env.ROOMS.get(id).fetch(request);
  },
} satisfies ExportedHandler<Env>;
