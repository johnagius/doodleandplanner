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
 * picks, champion pick, profile picture, or their very presence / display name. */
export function changedPredictorIds(prev: WorldCupState, next: WorldCupState): Set<string> {
  const ident = (p: { name: string; avatarPhotoId?: string }) =>
    `${p.name}\u0000${p.avatarPhotoId ?? ''}`;
  const prevIdent = new Map(prev.predictors.map((p) => [p.id, ident(p)]));
  const nextIdent = new Map(next.predictors.map((p) => [p.id, ident(p)]));
  const changed = new Set<string>();
  for (const id of new Set([...prevIdent.keys(), ...nextIdent.keys()])) {
    if (prevIdent.get(id) !== nextIdent.get(id)) {
      changed.add(id); // added, removed, renamed, or avatar changed
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

/** A prediction belongs to a knockout tie if its match isn't a group-stage match
 * in `wc`. Used so a seed migration may drop knockout picks left over from an old
 * bracket without the owner present, while group picks stay fully protected. */
function isKnockoutPick(wc: WorldCupState, matchId: string): boolean {
  const match = wc.matches.find((m) => m.id === matchId);
  return !match || match.stage !== 'group';
}

/**
 * True when the only change to a claimed predictor's data between `prev` and
 * `next` is the **removal** of knockout-stage picks: their identity, champion
 * pick and every group pick are byte-identical, and `next` adds or alters no
 * knockout pick (each remaining one already existed in `prev`). This is exactly
 * what a seed-version migration does when it clears a stale knockout bracket.
 */
function onlyRemovesKnockoutPicks(prev: WorldCupState, next: WorldCupState, id: string): boolean {
  const pp = prev.predictors.find((p) => p.id === id);
  const np = next.predictors.find((p) => p.id === id);
  if (!pp || !np) return false; // a predictor appearing/disappearing isn't a pick removal
  if (pp.name !== np.name || (pp.avatarPhotoId ?? '') !== (np.avatarPhotoId ?? '')) return false;
  if ((prev.championPicks?.[id] ?? '') !== (next.championPicks?.[id] ?? '')) return false;

  const groupPicks = (wc: WorldCupState) =>
    wc.predictions
      .filter((p) => p.predictorId === id && !isKnockoutPick(wc, p.matchId))
      .map((p) => `${p.matchId}:${p.home}-${p.away}`)
      .sort()
      .join('|');
  if (groupPicks(prev) !== groupPicks(next)) return false; // group picks must be untouched

  const prevKo = new Set(
    prev.predictions
      .filter((p) => p.predictorId === id && isKnockoutPick(prev, p.matchId))
      .map((p) => `${p.matchId}:${p.home}-${p.away}`),
  );
  // Every knockout pick still present must have existed before — only removals.
  return next.predictions
    .filter((p) => p.predictorId === id && isKnockoutPick(next, p.matchId))
    .every((p) => prevKo.has(`${p.matchId}:${p.home}-${p.away}`));
}

/**
 * Decide whether a full-state save is allowed. Any change to a **claimed**
 * predictor's picks/champion/name/presence is permitted only by that predictor's
 * verified owner (`owner` = the predictorId from the request's session token).
 * Unclaimed predictors stay fully open, so the board works for everyone until a
 * name is claimed — and organiser actions (entering match results), comments and
 * reactions touch no predictor picks, so they're never blocked.
 *
 * The one exception: a **seed-version upgrade** (`next.version > prev.version`)
 * may clear knockout picks left over from a superseded bracket even for claimed
 * names — but only *remove* them, never touch a group pick, champion or identity.
 * That lets the automatic board migration drop now-invalid knockout predictions
 * without locking everyone out.
 */
export function authorizeWcWrite(
  prev: WorldCupState,
  next: WorldCupState,
  claimedIds: ReadonlySet<string>,
  owner: string | null,
): WcWriteAuth {
  const migrating = (next.version ?? 1) > (prev.version ?? 1);
  for (const id of changedPredictorIds(prev, next)) {
    if (!claimedIds.has(id) || id === owner) continue;
    if (migrating && onlyRemovesKnockoutPicks(prev, next, id)) continue;
    return { ok: false, lockedId: id };
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
