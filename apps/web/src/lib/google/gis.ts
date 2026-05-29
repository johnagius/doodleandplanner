/**
 * Thin wrapper around Google Identity Services (GIS) for browser OAuth.
 * Loads the GIS script on demand and brokers short-lived access tokens used to
 * call the Calendar API directly from the client (no backend secret needed).
 */
import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES } from './config.js';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
  callback: (resp: TokenResponse) => void;
}

interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
  }) => TokenClient;
  revoke: (token: string, done?: () => void) => void;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise: Promise<void> | null = null;
let cached: { token: string; expiresAt: number } | null = null;

function loadGis(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Returns a cached access token if it's still valid for >1 minute. */
export function getCachedToken(): string | null {
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;
  return null;
}

/** Interactively request a Google access token (opens the consent popup). */
export async function requestAccessToken(): Promise<string> {
  const fresh = getCachedToken();
  if (fresh) return fresh;
  await loadGis();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google Identity Services unavailable');

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error ?? 'Authorisation was cancelled'));
          return;
        }
        cached = {
          token: resp.access_token,
          expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
        };
        resolve(resp.access_token);
      },
    });
    client.requestAccessToken({ prompt: getCachedToken() ? '' : 'consent' });
  });
}

export function signOutGoogle(): void {
  if (cached) window.google?.accounts?.oauth2?.revoke(cached.token);
  cached = null;
}
