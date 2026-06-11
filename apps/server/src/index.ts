/**
 * Worker entry point. Routes API requests to the per-room Durable Object,
 * deriving the room's DO id from its slug.
 */
import { mapWorldCupScores } from './football.js';
import { RoomDurableObject, type Env } from './roomObject.js';
import { corsHeaders, json, route } from './router.js';
import type { WcLiveScore } from '@dap/shared';

export { RoomDurableObject };

// Short-lived cache so we never hit football-data.org more than ~once a minute
// (the free tier allows 10 calls/min). Lives for the isolate's lifetime.
let scoresCache: { at: number; scores: WcLiveScore[] } | null = null;
const SCORES_TTL_MS = 60_000;

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
