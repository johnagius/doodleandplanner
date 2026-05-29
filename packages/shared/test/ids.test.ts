import { describe, expect, it } from 'vitest';
import {
  fromBase64Url,
  generateId,
  generateSlug,
  generateToken,
  safeEqual,
  toBase64Url,
} from '../src/ids.js';

describe('generateId', () => {
  it('produces unique ids', () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('applies a prefix', () => {
    expect(generateId('room')).toMatch(/^room_[0-9a-f-]{36}$/);
  });
});

describe('generateSlug', () => {
  it('uses only unambiguous characters and the requested length', () => {
    const slug = generateSlug(8);
    expect(slug).toHaveLength(8);
    expect(slug).toMatch(/^[23456789abcdefghjkmnpqrstvwxyz]+$/);
    expect(slug).not.toMatch(/[ilou01]/);
  });

  it('is reasonably unique across many draws', () => {
    const seen = new Set(Array.from({ length: 1000 }, () => generateSlug()));
    expect(seen.size).toBeGreaterThan(990);
  });
});

describe('base64url round-trip', () => {
  it('encodes and decodes arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const encoded = toBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(Array.from(fromBase64Url(encoded))).toEqual(Array.from(bytes));
  });

  it('round-trips random tokens', () => {
    const token = generateToken(24);
    expect(Array.from(fromBase64Url(token))).toHaveLength(24);
  });
});

describe('safeEqual', () => {
  it('is true for equal strings', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true);
  });
  it('is false for different strings or lengths', () => {
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
