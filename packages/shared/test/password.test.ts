import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/password.js';

describe('password hashing', () => {
  it('verifies the correct password', async () => {
    const hash = await hashPassword('correct horse battery staple', { iterations: 1000 });
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('s3cret', { iterations: 1000 });
    expect(await verifyPassword('wrong', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('is deterministic for a fixed salt', async () => {
    const salt = new Uint8Array(16).fill(7);
    const a = await hashPassword('pw', { iterations: 1000, salt });
    const b = await hashPassword('pw', { iterations: 1000, salt });
    expect(a.hash).toBe(b.hash);
    expect(a.salt).toBe(b.salt);
  });

  it('produces different hashes for different salts', async () => {
    const a = await hashPassword('pw', { iterations: 1000 });
    const b = await hashPassword('pw', { iterations: 1000 });
    expect(a.hash).not.toBe(b.hash);
  });

  it('records its algorithm and iterations', async () => {
    const hash = await hashPassword('pw', { iterations: 1234 });
    expect(hash.algorithm).toBe('PBKDF2-SHA256');
    expect(hash.iterations).toBe(1234);
  });

  it('throws on empty password', async () => {
    await expect(hashPassword('')).rejects.toThrow();
  });
});
