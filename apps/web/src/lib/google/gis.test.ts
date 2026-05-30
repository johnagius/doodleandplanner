import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeIdToken, getCachedToken, requestAccessToken, signOutGoogle } from './gis.js';

type Cb = (r: { access_token?: string; expires_in?: number; error?: string }) => void;

function mockGis(token: string) {
  let lastPrompt: string | undefined;
  const initTokenClient = vi.fn((cfg: { callback: Cb }) => ({
    requestAccessToken: (override?: { prompt?: string }) => {
      lastPrompt = override?.prompt;
      cfg.callback({ access_token: token, expires_in: 3600 });
    },
  }));
  const revoke = vi.fn();
  (window as unknown as { google?: unknown }).google = {
    accounts: { oauth2: { initTokenClient, revoke } },
  };
  return { initTokenClient, revoke, getPrompt: () => lastPrompt };
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

  it('does not force re-consent (so granted sensitive scopes are not re-shown)', async () => {
    const m = mockGis('basic-tok');
    await requestAccessToken('openid email profile');
    // prompt='' lets Google skip consent when scopes are already granted;
    // 'consent' would re-display previously granted Calendar → warning.
    expect(m.getPrompt()).toBe('');
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

describe('decodeIdToken', () => {
  it('extracts the profile from a Google ID token payload', () => {
    const payload = { email: 'ada@example.com', name: 'Ada Lovelace', picture: 'https://x/a.png' };
    const b64url = btoa(JSON.stringify(payload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(decodeIdToken(`header.${b64url}.sig`)).toEqual(payload);
  });
});
