/**
 * Worker entry point. Routes API requests to the per-room Durable Object,
 * deriving the room's DO id from its slug.
 */
import {
  espnDateWindow,
  mergeLiveScores,
  orientMatchSummary,
  parseEspnEventIds,
  parseEspnLineups,
  parseEspnMatchEvents,
  parseEspnNews,
  parseEspnScoreboard,
  parseEspnSummary,
  type EspnSummaryParsed,
} from './espn.js';
import { findWcMatch, mapHeadToHead, mapWorldCupScores } from './football.js';
import {
  CLUB_ESPN_LEAGUES,
  clubFeedWindow,
  clubScoreboardUrl,
  mergeClubFeeds,
  parseClubScoreboard,
  type ClubFeedFixture,
} from '@dap/shared';
import { parseTmValueM } from './transfermarkt.js';
import { RoomDurableObject, type Env } from './roomObject.js';
import { corsHeaders, json, route } from './router.js';
import { marketValueM } from '@dap/shared';
import type {
  WcLineup,
  WcLineupPlayer,
  WcMatchEvent,
  WcNewsArticle,
  WcTeamH2H,
  WcLiveScore,
} from '@dap/shared';

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
const ESPN_NEWS = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/news';
// WC headlines for the Buzz strip — shared + cached ~10 min (news barely moves).
let newsCache: { at: number; articles: WcNewsArticle[] } | null = null;
const NEWS_TTL_MS = 10 * 60_000;
// Whole-tournament window for goals/cards (one call, cached ~1 min, shared).
const WC_EVENTS_RANGE = '20260611-20260719';
let eventsCache: { at: number; events: Record<string, WcMatchEvent[]> } | null = null;
const EVENTS_TTL_MS = 60_000;
// ESPN event id per team-pair (to resolve a match → its summary), and the parsed
// starting XIs per event id. Lineups are static once posted, so cache for a while.
let idsCache: { at: number; ids: Record<string, string> } | null = null;
const IDS_TTL_MS = 5 * 60_000;
// One ESPN summary call per event feeds BOTH the lineups and the match-detail
// (team stats / leaders / referee), so we parse + cache it once per event id.
const summaryCache = new Map<
  string,
  { at: number; byCode: Record<string, WcLineupPlayer[]>; parsed: EspnSummaryParsed }
>();
const SUMMARY_TTL_MS = 5 * 60_000;
// Real market values via the community transfermarkt-api (transfermarkt.com
// blocks bots). Cached hard per name — values barely move and the source is a
// hobby host we don't want to hammer.
const TM_API = 'https://transfermarkt-api.fly.dev';
const valueCache = new Map<string, { at: number; m: number | null }>();
const VALUE_TTL_MS = 24 * 60 * 60_000;
const VALUE_MISS_TTL_MS = 10 * 60_000; // retry a miss/timeout soon, don't pin "—" all day

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

const isoStamp = (at: number | undefined): string | null =>
  at ? new Date(at).toISOString() : null;

/** Fetch + parse one match's ESPN summary (lineups + stats/leaders/referee),
 * cached per event id so lineups and match-detail share the single upstream
 * call. Returns null when the event is unknown or the fetch keeps failing. */
async function ensureSummary(home: string, away: string) {
  const eventId = (await ensureEventIds())[[home, away].sort().join('|')];
  if (!eventId) return null;
  let entry = summaryCache.get(eventId);
  if (!entry || Date.now() - entry.at >= SUMMARY_TTL_MS) {
    try {
      const res = await fetch(`${ESPN_SUMMARY}?event=${eventId}`, { headers: ESPN_UA });
      if (res.ok) {
        const raw = await res.json();
        entry = { at: Date.now(), byCode: parseEspnLineups(raw), parsed: parseEspnSummary(raw) };
        summaryCache.set(eventId, entry);
      }
    } catch {
      /* keep any stale entry */
    }
  }
  return entry ?? null;
}

/** Starting XIs for a match (~1h before kickoff), from ESPN's per-match summary. */
async function worldCupLineups(
  home: string,
  away: string,
  cors: Record<string, string>,
): Promise<Response> {
  if (!home || !away) {
    return json({ home: null, away: null, fetchedAt: null, error: 'bad-request' }, { status: 400 }, cors); // prettier-ignore
  }
  const entry = await ensureSummary(home, away);
  const byCode = entry?.byCode ?? {};
  const lineup = (code: string): WcLineup | null =>
    byCode[code]?.length ? { teamTla: code, players: byCode[code]! } : null;
  return json({ home: lineup(home), away: lineup(away), fetchedAt: isoStamp(entry?.at) }, {}, cors);
}

/** Per-match detail (team stats, standout performers, referee, venue) mined from
 * the same ESPN summary as the lineups. Empty stats before kickoff. */
async function worldCupMatch(
  home: string,
  away: string,
  cors: Record<string, string>,
): Promise<Response> {
  if (!home || !away) {
    return json({ summary: null, fetchedAt: null, error: 'bad-request' }, { status: 400 }, cors);
  }
  const entry = await ensureSummary(home, away);
  const summary = entry ? orientMatchSummary(entry.parsed, home, away) : null;
  return json({ summary, fetchedAt: isoStamp(entry?.at) }, {}, cors);
}

/** World Cup headlines for the Buzz strip, from ESPN's keyless news feed. */
async function worldCupNews(cors: Record<string, string>): Promise<Response> {
  if (!newsCache || Date.now() - newsCache.at >= NEWS_TTL_MS) {
    try {
      const res = await fetch(ESPN_NEWS, { headers: ESPN_UA });
      if (res.ok) newsCache = { at: Date.now(), articles: parseEspnNews(await res.json()) };
    } catch {
      /* keep any stale entry */
    }
  }
  return json(
    { articles: newsCache?.articles ?? [], fetchedAt: isoStamp(newsCache?.at) },
    {},
    cors,
  );
}

/** One player's Transfermarkt value (€M), cached; null when unresolved. A real
 * value is cached hard (24h); a miss/timeout is cached only briefly so a flaky
 * upstream doesn't pin a player to "—" all day. */
async function fetchTmValue(name: string): Promise<number | null> {
  // DB-first: most players resolve from the committed Transfermarkt table with no
  // network call, so the flaky community API is only hit for names we don't carry.
  const fromDb = marketValueM(name);
  if (fromDb != null) return fromDb;
  const key = name.trim().toLowerCase();
  const cached = valueCache.get(key);
  if (cached) {
    const ttl = cached.m != null ? VALUE_TTL_MS : VALUE_MISS_TTL_MS;
    if (Date.now() - cached.at < ttl) return cached.m;
  }
  let m: number | null = null;
  try {
    const res = await fetch(`${TM_API}/players/search/${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(6000),
      headers: { Accept: 'application/json' },
    });
    if (res.ok) m = parseTmValueM(await res.json());
  } catch {
    m = null;
  }
  valueCache.set(key, { at: Date.now(), m });
  return m;
}

/** Batch market-value lookup: ?names=A|B|C → { values: { A: 80, B: 12.5, … } } in €M. */
async function worldCupValues(namesParam: string, cors: Record<string, string>): Promise<Response> {
  const names = namesParam
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
  const values: Record<string, number | null> = {};
  const queue = [...names];
  const worker = async () => {
    for (let n = queue.shift(); n !== undefined; n = queue.shift())
      values[n] = await fetchTmValue(n);
  };
  await Promise.all([worker(), worker(), worker(), worker()]); // gentle concurrency
  return json({ values }, {}, cors);
}

// Club Football fixtures — merged across every tracked competition for a rolling
// upcoming window. ESPN's per-league scoreboard is shared + cached so many devices
// polling never hammer the upstream. Refreshed ~every 3 minutes.
let clubCache: {
  at: number;
  fixtures: ClubFeedFixture[];
  window: { from: string; to: string };
} | null = null;
const CLUB_TTL_MS = 3 * 60_000;

async function clubFixtures(cors: Record<string, string>): Promise<Response> {
  const stamp = (at: number | undefined) => (at ? new Date(at).toISOString() : null);
  if (clubCache && Date.now() - clubCache.at < CLUB_TTL_MS) {
    return json(
      { fixtures: clubCache.fixtures, window: clubCache.window, fetchedAt: stamp(clubCache.at) },
      {},
      cors,
    );
  }

  const win = clubFeedWindow(new Date());
  const lists = await Promise.all(
    CLUB_ESPN_LEAGUES.map(async (league) => {
      try {
        const res = await fetch(clubScoreboardUrl(league.slug, win.fromYmd, win.toYmd), {
          headers: ESPN_UA,
        });
        if (!res.ok) return [];
        return parseClubScoreboard(await res.json(), league.competitionId);
      } catch {
        return [];
      }
    }),
  );

  const fixtures = mergeClubFeeds(lists);
  // If every upstream call failed, don't cache an empty result — serve the last
  // good snapshot if we have one, else signal unavailable.
  if (fixtures.length === 0 && lists.every((l) => l.length === 0)) {
    if (clubCache) {
      return json(
        {
          fixtures: clubCache.fixtures,
          window: clubCache.window,
          fetchedAt: stamp(clubCache.at),
          error: 'unavailable',
        },
        {},
        cors,
      );
    }
    return json(
      { fixtures: [], window: { from: win.fromIso, to: win.toIso }, fetchedAt: null },
      {},
      cors,
    );
  }

  const window = { from: win.fromIso, to: win.toIso };
  clubCache = { at: Date.now(), fixtures, window };
  return json({ fixtures, window, fetchedAt: stamp(clubCache.at) }, {}, cors);
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
    if (r.kind === 'wc-match') {
      return worldCupMatch(
        url.searchParams.get('home') ?? '',
        url.searchParams.get('away') ?? '',
        cors,
      );
    }
    if (r.kind === 'club-fixtures') return clubFixtures(cors);
    if (r.kind === 'wc-news') return worldCupNews(cors);
    if (r.kind === 'wc-values') return worldCupValues(url.searchParams.get('names') ?? '', cors);
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
