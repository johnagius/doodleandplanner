import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCachedToken, requestAccessToken, signOutGoogle } from './gis.js';

type Cb = (r: { access_token?: string; expires_in?: number; error?: string }) => void;

function mockGis(token: string) {
  const initTokenClient = vi.fn((cfg: { callback: Cb }) => ({
    requestAccessToken: () => cfg.callback({ access_token: token, expires_in: 3600 }),
  }));
  const revoke = vi.fn();
  (window as unknown as { google?: unknown }).google = {
    accounts: { oauth2: { initTokenClient, revoke } },
  };
  return { initTokenClient, revoke };
}

afterEach(() => {
  signOutGoogle();
  delete (window as unknown as { google?: unknown }).google;
});

describe('gis per-scope token cache', () => {
  it('caches and reuses a token for the same scope set', async () => {
    const { initTokenClient } = mockGis('basic-tok');
    expect(await requestAccessToken('openid email profile')).toBe('basic-tok');
    expect(getCachedToken('openid email profile')).toBe('basic-tok');
    // A second request for the same scope reuses the cache (no new client).
    expect(await requestAccessToken('openid email profile')).toBe('basic-tok');
    expect(initTokenClient).toHaveBeenCalledTimes(1);
  });

  it('tracks different scope sets independently (incremental auth)', async () => {
    mockGis('cal-tok');
    await requestAccessToken('calendar.events');
    expect(getCachedToken('calendar.events')).toBe('cal-tok');
    // The identity scope is NOT satisfied by the calendar grant.
    expect(getCachedToken('openid email profile')).toBeNull();
  });

  it('signOutGoogle revokes every cached token and clears them', async () => {
    const { revoke } = mockGis('tok');
    await requestAccessToken('some-scope');
    signOutGoogle();
    expect(revoke).toHaveBeenCalledWith('tok');
    expect(getCachedToken('some-scope')).toBeNull();
  });
});
