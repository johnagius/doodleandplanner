/**
 * Worker entry point. Routes API requests to the per-room Durable Object,
 * deriving the room's DO id from its slug.
 */
import { findWcMatch, mapHeadToHead, mapWorldCupScores } from './football.js';
import { RoomDurableObject, type Env } from './roomObject.js';
import { corsHeaders, json, route } from './router.js';
import type { WcTeamH2H, WcLiveScore } from '@dap/shared';

export { RoomDurableObject };

// Short-lived cache so we never hit football-data.org more than ~once a minute
// (the free tier allows 10 calls/min). Lives for the isolate's lifetime.
let scoresCache: { at: number; scores: WcLiveScore[] } | null = null;
const SCORES_TTL_MS = 60_000;

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

async function worldCupScores(env: Env, cors: Record<string, string>): Promise<Response> {
  if (!env.FOOTBALL_DATA_TOKEN) {
    return json({ scores: [], error: 'not-configured' }, { status: 503 }, cors);
  }
  if (scoresCache && Date.now() - scoresCache.at < SCORES_TTL_MS) {
    return json({ scores: scoresCache.scores }, {}, cors);
  }
  try {
    const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
      headers: { 'X-Auth-Token': env.FOOTBALL_DATA_TOKEN },
    });
    if (!res.ok) {
      // Serve stale data on a transient upstream error (e.g. rate limit).
      return json({ scores: scoresCache?.scores ?? [], error: `upstream-${res.status}` }, {}, cors);
    }
    const scores = mapWorldCupScores(await res.json());
    scoresCache = { at: Date.now(), scores };
    return json({ scores }, {}, cors);
  } catch {
    return json({ scores: scoresCache?.scores ?? [], error: 'unavailable' }, {}, cors);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const r = route(request.method, url.pathname);
    const cors = corsHeaders(request.headers.get('Origin'), env.ALLOWED_ORIGINS);

    if (r.kind === 'preflight') return new Response(null, { status: 204, headers: cors });
    if (r.kind === 'health') return json({ ok: true }, {}, cors);
    if (r.kind === 'wc-scores') return worldCupScores(env, cors);
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
