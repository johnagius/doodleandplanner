/**
 * Worker entry point. Routes API requests to the per-room Durable Object,
 * deriving the room's DO id from its slug.
 */
import { RoomDurableObject, type Env } from './roomObject.js';
import { corsHeaders, json, route } from './router.js';

export { RoomDurableObject };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const r = route(request.method, url.pathname);
    const cors = corsHeaders(request.headers.get('Origin'), env.ALLOWED_ORIGINS);

    if (r.kind === 'preflight') return new Response(null, { status: 204, headers: cors });
    if (r.kind === 'health') return json({ ok: true }, {}, cors);
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
