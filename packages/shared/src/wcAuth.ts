/**
 * World Cup email-login (OTP) primitives, shared by the Worker and the web app.
 *
 * The board has no accounts: a "predictor" is just a name in the synced state,
 * and the entire state is broadcast to every device. So this module is built
 * around two rules:
 *   1. **Emails never enter the synced state** — only a per-predictor `claimed`
 *      boolean does. The email↔name binding lives in the Worker's private
 *      Durable Object storage.
 *   2. **A claimed name's picks may only be changed by its verified owner** —
 *      enforced server-side by {@link authorizeWcWrite}, which diffs the incoming
 *      full state against the stored one.
 *
 * Pure + serialisable; the crypto uses the standard Web Crypto API available in
 * the browser, Node and Cloudflare Workers.
 */

import type { WorldCupState } from './worldcup.js';

// ── Email helpers ──────────────────────────────────────────────────────────

/** Canonical form for matching/storage: trimmed + lowercased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** A pragmatic "looks like an email" check (we verify by sending a code anyway). */
export function isValidEmail(email: string): boolean {
  const e = email.trim();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// ── One-time codes ───────────────────────────────────────────────────────────

/** A fresh 6-digit numeric login code. */
export function randomOtp(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0]! % 1_000_000).padStart(6, '0');
}

const encoder = new TextEncoder();

/** Lowercase hex SHA-256 — codes are stored hashed, never in the clear. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Session tokens (signed, stateless) ───────────────────────────────────────

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

/** Constant-time-ish string compare (avoids leaking via early exit). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A signed `{predictorId, expiry}` token proving a device verified that name. */
export async function createSessionToken(
  predictorId: string,
  ttlMs: number,
  secret: string,
  now: number = Date.now(),
): Promise<string> {
  const payload = b64urlEncode(encoder.encode(JSON.stringify({ p: predictorId, e: now + ttlMs })));
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

/** The predictorId a token vouches for, or null if forged/expired/malformed. */
export async function readSessionToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): Promise<string | null> {
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, await hmac(secret, payload))) return null;
  try {
    const data = JSON.parse(b64urlDecode(payload)) as { p?: unknown; e?: unknown };
    if (typeof data.e !== 'number' || data.e < now) return null;
    return typeof data.p === 'string' ? data.p : null;
  } catch {
    return null;
  }
}

// ── Server-side write authorisation ──────────────────────────────────────────

/** A compact signature of one predictor's ownership-bound data (their picks +
 * champion choice), so we can tell if a save tried to change it. */
function fingerprint(wc: WorldCupState, predictorId: string): string {
  const picks = wc.predictions
    .filter((p) => p.predictorId === predictorId)
    .map((p) => `${p.matchId}:${p.home}-${p.away}`)
    .sort()
    .join('|');
  return `${picks}#${wc.championPicks?.[predictorId] ?? ''}`;
}

/** Predictor ids whose ownership-bound data differs between two states: their
 * picks, champion pick, or their very presence / display name. */
export function changedPredictorIds(prev: WorldCupState, next: WorldCupState): Set<string> {
  const prevNames = new Map(prev.predictors.map((p) => [p.id, p.name]));
  const nextNames = new Map(next.predictors.map((p) => [p.id, p.name]));
  const changed = new Set<string>();
  for (const id of new Set([...prevNames.keys(), ...nextNames.keys()])) {
    if (prevNames.get(id) !== nextNames.get(id)) {
      changed.add(id); // added, removed, or renamed
    } else if (fingerprint(prev, id) !== fingerprint(next, id)) {
      changed.add(id);
    }
  }
  return changed;
}

export interface WcWriteAuth {
  ok: boolean;
  /** The claimed predictor a rejected save tried to touch. */
  lockedId?: string;
}

/**
 * Decide whether a full-state save is allowed. Any change to a **claimed**
 * predictor's picks/champion/name/presence is permitted only by that predictor's
 * verified owner (`owner` = the predictorId from the request's session token).
 * Unclaimed predictors stay fully open, so the board works for everyone until a
 * name is claimed — and organiser actions (entering match results), comments and
 * reactions touch no predictor picks, so they're never blocked.
 */
export function authorizeWcWrite(
  prev: WorldCupState,
  next: WorldCupState,
  claimedIds: ReadonlySet<string>,
  owner: string | null,
): WcWriteAuth {
  for (const id of changedPredictorIds(prev, next)) {
    if (claimedIds.has(id) && id !== owner) return { ok: false, lockedId: id };
  }
  return { ok: true };
}

/** Stamp the synced state's `claimed` flags from the authoritative server set,
 * so clients can show locks but can never forge the flag. Returns a new state
 * only if something changed (cheap identity check for the caller). */
export function stampClaimed(wc: WorldCupState, claimedIds: ReadonlySet<string>): WorldCupState {
  let changed = false;
  const predictors = wc.predictors.map((p) => {
    const claimed = claimedIds.has(p.id);
    if (!!p.claimed === claimed) return p;
    changed = true;
    return claimed ? { ...p, claimed: true } : { ...p, claimed: false };
  });
  return changed ? { ...wc, predictors } : wc;
}
