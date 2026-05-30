/**
 * Thin wrapper around Google Identity Services (GIS) for browser OAuth.
 * Loads the GIS script on demand and brokers short-lived access tokens used to
 * call the Calendar API directly from the client (no backend secret needed).
 *
 * Tokens are cached *per scope set* so the identity (sign-in) grant and the
 * calendar grant are tracked independently — that's what lets calendar
 * permission be requested incrementally, only when a calendar feature runs.
 */
import { GOOGLE_CLIENT_ID } from './config.js';
import type { GoogleProfile } from './calendar.js';

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

interface GoogleId {
  initialize: (config: {
    client_id: string;
    callback: (resp: { credential: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
  disableAutoSelect: () => void;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2; id?: GoogleId } };
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise: Promise<void> | null = null;
const cache = new Map<string, { token: string; expiresAt: number }>();

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

/** Returns a cached access token for `scope` if it's still valid for >1 minute. */
export function getCachedToken(scope: string): string | null {
  const entry = cache.get(scope);
  if (entry && entry.expiresAt - Date.now() > 60_000) return entry.token;
  return null;
}

/**
 * Interactively request a Google access token for the given scope set (opens
 * the consent popup the first time). Cached per scope set.
 */
export async function requestAccessToken(scope: string): Promise<string> {
  const fresh = getCachedToken(scope);
  if (fresh) return fresh;
  await loadGis();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google Identity Services unavailable');

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error ?? 'Authorisation was cancelled'));
          return;
        }
        cache.set(scope, {
          token: resp.access_token,
          expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
        });
        resolve(resp.access_token);
      },
    });
    // No forced prompt: Google asks for consent only when a scope isn't already
    // granted. Forcing prompt='consent' would, with include_granted_scopes,
    // re-display previously-granted *sensitive* scopes (e.g. Calendar) on every
    // sign-in — re-triggering the "unverified app" warning even for a plain
    // identity request.
    client.requestAccessToken({ prompt: '' });
  });
}

export function signOutGoogle(): void {
  const accounts = window.google?.accounts;
  for (const { token } of cache.values()) accounts?.oauth2?.revoke(token);
  cache.clear();
  accounts?.id?.disableAutoSelect();
}

/**
 * Decode the payload of a Google ID token (JWT) for display. The token comes
 * straight from Google's SDK over HTTPS, so for showing a name/avatar we don't
 * re-verify the signature (there's no backend to do so).
 */
export function decodeIdToken(credential: string): GoogleProfile {
  let b64 = (credential.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
  b64 += '='.repeat((4 - (b64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const payload = JSON.parse(new TextDecoder().decode(bytes)) as {
    email?: string;
    name?: string;
    picture?: string;
  };
  return { email: payload.email ?? '', name: payload.name, picture: payload.picture };
}

/**
 * Render Google's official "Sign in with Google" button using the identity
 * (ID-token) flow. This is pure authentication and requests NO OAuth scopes, so
 * it never triggers the sensitive-scope "unverified app" warning. Calendar
 * access is requested separately and on demand via requestAccessToken().
 */
export async function renderGoogleSignInButton(
  parent: HTMLElement,
  onCredential: (credential: string) => void,
): Promise<void> {
  await loadGis();
  const id = window.google?.accounts?.id;
  if (!id) throw new Error('Google Identity Services unavailable');
  id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (resp) => onCredential(resp.credential),
    auto_select: false,
    cancel_on_tap_outside: true,
  });
  parent.replaceChildren();
  id.renderButton(parent, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    shape: 'pill',
    logo_alignment: 'left',
  });
}
