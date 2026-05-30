/**
 * Persist the Google sign-in across reloads. We cache the ID-token credential
 * (a JWT) in localStorage and restore the decoded profile on load, so a
 * signed-in visitor stays recognised (name/avatar) until the token expires.
 * This is display-only auth; sensitive Calendar scopes are still requested
 * on demand and never stored here.
 */
import type { GoogleProfile } from './calendar.js';
import { decodeIdToken } from './gis.js';

const KEY = 'dap:gcred';

/** Seconds-since-epoch `exp` claim of a JWT, or 0 if unreadable. */
function expOf(credential: string): number {
  try {
    let b64 = (credential.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(b64)) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : 0;
  } catch {
    return 0;
  }
}

export function persistCredential(credential: string): void {
  try {
    localStorage.setItem(KEY, credential);
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function clearPersistedCredential(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Restore a still-valid profile from a previously cached credential, if any. */
export function loadPersistedProfile(): { profile: GoogleProfile; email: string } | null {
  try {
    const cred = localStorage.getItem(KEY);
    if (!cred) return null;
    if (expOf(cred) * 1000 <= Date.now()) {
      clearPersistedCredential();
      return null;
    }
    const profile = decodeIdToken(cred);
    if (!profile.email) return null;
    return { profile, email: profile.email };
  } catch {
    return null;
  }
}
