/**
 * ID, slug and token generation.
 *
 * Uses the Web Crypto API (`globalThis.crypto`) which is available in modern
 * browsers and in Node >= 20, so the same code runs client- and server-side.
 */

/**
 * Resolve the Web Crypto instance in a way that type-checks under DOM, Node and
 * Cloudflare Workers lib sets (where `crypto` is a bare global, not a property
 * of `globalThis`'s type). Exported so other modules share one accessor.
 */
export function webCrypto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('Web Crypto API is not available in this environment');
  }
  return c;
}

function getCrypto(): Crypto {
  return webCrypto();
}

/** A UUID, optionally namespaced with a short prefix (e.g. `room_…`). */
export function generateId(prefix?: string): string {
  const uuid = getCrypto().randomUUID();
  return prefix ? `${prefix}_${uuid}` : uuid;
}

// Crockford-ish base32 alphabet: no ambiguous chars (no I, L, O, U, 0, 1).
const SLUG_ALPHABET = '23456789abcdefghjkmnpqrstvwxyz';

/** A short, human-friendly, link-safe room code (default 6 chars). */
export function generateSlug(length = 6): string {
  const bytes = new Uint8Array(length);
  getCrypto().getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += SLUG_ALPHABET[bytes[i]! % SLUG_ALPHABET.length];
  }
  return out;
}

/** A random URL-safe token (base64url) with the given number of random bytes. */
export function generateToken(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  getCrypto().getRandomValues(buf);
  return toBase64Url(buf);
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = typeof btoa === 'function' ? btoa(binary) : bufferToBase64(bytes);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  if (typeof atob === 'function') {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  return base64ToBuffer(padded);
}

// Node fallbacks (only used when atob/btoa are absent).
function bufferToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
function base64ToBuffer(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Constant-time string comparison to avoid leaking secrets via timing.
 * Both inputs are compared in full regardless of where they differ.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
