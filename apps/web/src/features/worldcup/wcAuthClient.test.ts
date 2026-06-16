import { afterEach, describe, expect, it } from 'vitest';
import { clearSessionToken, getSessionToken, hasSession } from './wcAuthClient.js';

/** Build a token whose payload (the part hasSession inspects) carries an expiry. */
function fakeToken(expMs: number): string {
  const payload = btoa(JSON.stringify({ p: 'x', e: expMs }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${payload}.signature`;
}

afterEach(() => localStorage.clear());

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
