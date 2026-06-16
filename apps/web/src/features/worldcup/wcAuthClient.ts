/**
 * Client side of the World Cup email-login. Holds the per-name session token in
 * localStorage so a verified browser is "remembered" and never re-emails, and
 * talks to the Worker's /wc-auth endpoints. The token is attached to room saves
 * via the shared save-header provider.
 */
import { setSaveHeaderProvider } from '../../lib/storage/saveHeaders.js';

const TOKEN_PREFIX = 'dap:wc:session:';

function apiBase(): string | null {
  return import.meta.env.VITE_API_BASE?.trim() || null;
}

export function getSessionToken(predictorId: string): string | null {
  try {
    return globalThis.localStorage?.getItem(TOKEN_PREFIX + predictorId) ?? null;
  } catch {
    return null;
  }
}

function setSessionToken(predictorId: string, token: string): void {
  try {
    globalThis.localStorage?.setItem(TOKEN_PREFIX + predictorId, token);
  } catch {
    /* storage unavailable — the worst case is we ask for a code again */
  }
}

export function clearSessionToken(predictorId: string): void {
  try {
    globalThis.localStorage?.removeItem(TOKEN_PREFIX + predictorId);
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
    const payload = token.split('.')[0]!;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
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
