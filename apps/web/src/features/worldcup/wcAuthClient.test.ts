import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSessionToken, getSessionToken, hasSession, verifyCode } from './wcAuthClient.js';

/** Build a token whose payload (the part hasSession inspects) carries an expiry. */
function fakeToken(expMs: number): string {
  const payload = btoa(JSON.stringify({ p: 'x', e: expMs }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${payload}.signature`;
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('verifyCode token round-trip', () => {
  it('stores the token a successful verify returns', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://api.example');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: true, token: 'tok.sig', predictorId: 'john' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const res = await verifyCode('world-cup', 'john', '123456');
    expect(res.ok).toBe(true);
    expect(getSessionToken('john')).toBe('tok.sig');
    expect(hasSession('john')).toBe(true);
  });
});

describe('wcAuthClient session memory', () => {
  it('remembers a live session so the browser is not re-prompted (no extra email)', () => {
    localStorage.setItem('dap:wc:session:john', fakeToken(Date.now() + 60_000));
    expect(hasSession('john')).toBe(true);
  });

  it('treats an expired or missing token as not logged in', () => {
    localStorage.setItem('dap:wc:session:dan', fakeToken(Date.now() - 1_000));
    expect(hasSession('dan')).toBe(false);
    expect(hasSession('nobody')).toBe(false);
  });

  it('clears a stored token', () => {
    localStorage.setItem('dap:wc:session:john', fakeToken(Date.now() + 60_000));
    clearSessionToken('john');
    expect(getSessionToken('john')).toBeNull();
    expect(hasSession('john')).toBe(false);
  });
});
