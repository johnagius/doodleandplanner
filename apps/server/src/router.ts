/**
 * Pure HTTP routing + response helpers, kept free of Workers-runtime globals so
 * they can be unit-tested directly. The Worker and Durable Object build on these.
 *
 * Contract:
 *   POST   /api/rooms            create a room (body: RoomState)
 *   GET    /api/rooms/:slug      fetch a room
 *   PUT    /api/rooms/:slug      replace a room (broadcast to subscribers)
 *   GET    /api/rooms/:slug/ws   upgrade to a WebSocket of live RoomState
 */

export type ApiRoute =
  | { kind: 'create' }
  | { kind: 'get'; slug: string }
  | { kind: 'save'; slug: string }
  | { kind: 'ws'; slug: string }
  | { kind: 'preflight' }
  | { kind: 'health' }
  | { kind: 'not-found' };

export function route(method: string, pathname: string): ApiRoute {
  const m = method.toUpperCase();
  if (m === 'OPTIONS') return { kind: 'preflight' };

  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/');
  // ['api','rooms', ...]
  if (parts[0] !== 'api') return { kind: 'not-found' };
  if (parts[1] === 'health' && parts.length === 2) return { kind: 'health' };
  if (parts[1] !== 'rooms') return { kind: 'not-found' };

  if (parts.length === 2) {
    return m === 'POST' ? { kind: 'create' } : { kind: 'not-found' };
  }
  const slug = decodeURIComponent(parts[2] ?? '');
  if (!slug) return { kind: 'not-found' };

  if (parts.length === 3) {
    if (m === 'GET') return { kind: 'get', slug };
    if (m === 'PUT') return { kind: 'save', slug };
    return { kind: 'not-found' };
  }
  if (parts.length === 4 && parts[3] === 'ws' && m === 'GET') {
    return { kind: 'ws', slug };
  }
  return { kind: 'not-found' };
}

export function corsHeaders(origin: string | null, allowed: string): Record<string, string> {
  const list = allowed.split(',').map((s) => s.trim());
  const allowAll = list.includes('*');
  const allowOrigin = allowAll ? '*' : origin && list.includes(origin) ? origin : (list[0] ?? '*');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/**
 * True if a raw WebSocket frame is an ephemeral presence message (e.g. a live
 * cursor). These are relayed to other clients but never persisted.
 */
export function isPresenceFrame(raw: string): boolean {
  try {
    const data = JSON.parse(raw) as unknown;
    return !!data && typeof data === 'object' && '__presence' in data;
  } catch {
    return false;
  }
}

export function json(
  data: unknown,
  init: ResponseInit = {},
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
