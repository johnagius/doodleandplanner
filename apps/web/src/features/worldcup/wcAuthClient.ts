/**
 * Client side of the World Cup email-login. Holds the per-name session token in
 * localStorage so a verified browser is "remembered" and never re-emails, and
 * talks to the Worker's /wc-auth endpoints. The token is attached to room saves
 * via the shared save-header provider.
 */
import { setSaveHeaderProvider } from '../../lib/storage/saveHeaders.js';

const TOKEN_PREFIX = 'dap:wc:session:';
const COOKIE_PREFIX = 'dapwcs_';
const YEAR_S = 365 * 24 * 60 * 60;

function apiBase(): string | null {
  return import.meta.env.VITE_API_BASE?.trim() || null;
}

// In-memory fallback: some browsers (private mode, and especially chat-app
// in-app webviews) throw on localStorage. Keeping the token here means the
// session still works for the lifetime of the page even when nothing persists.
const memTokens: Record<string, string> = {};

function readCookie(predictorId: string): string | null {
  try {
    const m = document.cookie.match(
      new RegExp('(?:^|; )' + COOKIE_PREFIX + predictorId + '=([^;]*)'),
    );
    return m ? decodeURIComponent(m[1]!) : null;
  } catch {
    return null;
  }
}

/** True if the token survives a reload (localStorage or cookie), not just memory. */
export function isSessionPersisted(predictorId: string): boolean {
  try {
    if (globalThis.localStorage?.getItem(TOKEN_PREFIX + predictorId)) return true;
  } catch {
    /* blocked */
  }
  return !!readCookie(predictorId);
}

export function getSessionToken(predictorId: string): string | null {
  if (memTokens[predictorId]) return memTokens[predictorId]!;
  try {
    const v = globalThis.localStorage?.getItem(TOKEN_PREFIX + predictorId);
    if (v) return v;
  } catch {
    /* blocked — fall through */
  }
  return readCookie(predictorId);
}

function setSessionToken(predictorId: string, token: string): void {
  memTokens[predictorId] = token; // always works for this page
  try {
    globalThis.localStorage?.setItem(TOKEN_PREFIX + predictorId, token);
  } catch {
    /* private mode / in-app webview — the cookie + memory still cover us */
  }
  try {
    document.cookie = `${COOKIE_PREFIX}${predictorId}=${encodeURIComponent(token)}; path=/; max-age=${YEAR_S}; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

export function clearSessionToken(predictorId: string): void {
  delete memTokens[predictorId];
  try {
    globalThis.localStorage?.removeItem(TOKEN_PREFIX + predictorId);
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `${COOKIE_PREFIX}${predictorId}=; path=/; max-age=0`;
  } catch {
    /* ignore */
  }
}

/** True if this browser holds a not-yet-expired session for the name. The server
 * is authoritative; this just avoids prompting (and emailing) needlessly. */
export function hasSession(predictorId: string): boolean {
  const token = getSessionToken(predictorId);
  if (!token) return false;
  try {
    const b64 = token.split('.')[0]!.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const data = JSON.parse(json) as { e?: number };
    return typeof data.e === 'number' ? data.e > Date.now() : true;
  } catch {
    return true; // unparseable but present — let the server decide
  }
}

export interface AuthResponse {
  ok: boolean;
  status: number;
  error?: string;
  /** Remaining attempts after a wrong code. */
  left?: number;
  /** False when the server reused a still-valid code instead of emailing again. */
  emailed?: boolean;
}

async function post(
  slug: string,
  action: 'request' | 'verify',
  payload: object,
): Promise<AuthResponse> {
  const base = apiBase();
  if (!base) return { ok: false, status: 0, error: 'no-backend' };
  try {
    const res = await fetch(
      `${base.replace(/\/$/, '')}/api/rooms/${encodeURIComponent(slug)}/wc-auth/${action}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      ok: res.ok,
      status: res.status,
      error: typeof body.error === 'string' ? body.error : undefined,
      left: typeof body.left === 'number' ? body.left : undefined,
      emailed: typeof body.emailed === 'boolean' ? body.emailed : undefined,
      ...(typeof body.token === 'string' ? { token: body.token } : {}),
    } as AuthResponse & { token?: string };
  } catch {
    return { ok: false, status: 0, error: 'network' };
  }
}

/** Ask the Worker to email a login code for a name. */
export function requestCode(
  slug: string,
  predictorId: string,
  email: string,
): Promise<AuthResponse> {
  return post(slug, 'request', { predictorId, email });
}

/** Verify a code; on success the session token is stored for this browser. */
export async function verifyCode(
  slug: string,
  predictorId: string,
  code: string,
): Promise<AuthResponse> {
  const res = (await post(slug, 'verify', { predictorId, code })) as AuthResponse & {
    token?: string;
  };
  if (res.ok && res.token) setSessionToken(predictorId, res.token);
  return res;
}

/** Attach the current name's session token to every room save. Call once. */
export function installWcSaveAuth(getMeId: () => string | null): void {
  setSaveHeaderProvider(() => {
    const id = getMeId();
    const token = id ? getSessionToken(id) : null;
    const headers: Record<string, string> = {};
    if (token) headers['X-WC-Session'] = token;
    return headers;
  });
}
