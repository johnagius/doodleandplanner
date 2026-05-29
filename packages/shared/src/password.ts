/**
 * Password hashing with PBKDF2 over the Web Crypto SubtleCrypto API.
 *
 * Works in the browser and in Node >= 20. Rooms are optionally password
 * protected; we never store the plaintext, only a salted derived key.
 */
import { fromBase64Url, safeEqual, toBase64Url } from './ids.js';
import type { PasswordHash } from './types.js';

const DEFAULT_ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256;

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('SubtleCrypto is not available in this environment');
  return s;
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await subtle().importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    KEY_LENGTH_BITS,
  );
  return new Uint8Array(bits);
}

export interface HashOptions {
  iterations?: number;
  /** Inject a fixed salt for deterministic tests. */
  salt?: Uint8Array;
}

export async function hashPassword(password: string, options: HashOptions = {}): Promise<PasswordHash> {
  if (password.length === 0) throw new Error('Password must not be empty');
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const salt = options.salt ?? globalThis.crypto.getRandomValues(new Uint8Array(16));
  const derived = await deriveBits(password, salt, iterations);
  return {
    algorithm: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64Url(salt),
    hash: toBase64Url(derived),
  };
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  if (!password) return false;
  const salt = fromBase64Url(stored.salt);
  const derived = await deriveBits(password, salt, stored.iterations);
  return safeEqual(toBase64Url(derived), stored.hash);
}
