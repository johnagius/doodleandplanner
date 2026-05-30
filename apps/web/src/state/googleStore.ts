import { create } from 'zustand';
import { fetchUserProfile, type GoogleProfile } from '../lib/google/calendar.js';
import { GOOGLE_CALENDAR_SCOPES, GOOGLE_SIGNIN_SCOPES } from '../lib/google/config.js';
import {
  decodeIdToken,
  getCachedToken,
  requestAccessToken,
  signOutGoogle,
} from '../lib/google/gis.js';
import {
  clearPersistedCredential,
  loadPersistedProfile,
  persistCredential,
} from '../lib/google/session.js';

interface GoogleStore {
  connecting: boolean;
  email: string | null;
  profile: GoogleProfile | null;
  error: string | null;
  /** Connect (opens the Google consent popup) and resolve the full profile. */
  connect: () => Promise<GoogleProfile | null>;
  /** Sign in via Google's identity (ID-token) flow — pure auth, no OAuth scopes. */
  signInWithCredential: (credential: string) => GoogleProfile;
  disconnect: () => void;
  /** Get a valid access token, prompting only if needed. */
  token: () => Promise<string>;
}

// Restore a signed-in profile from a cached, unexpired credential on load.
const restored = loadPersistedProfile();

export const useGoogleStore = create<GoogleStore>((set) => ({
  connecting: false,
  email: restored?.email ?? null,
  profile: restored?.profile ?? null,
  error: null,

  async connect() {
    set({ connecting: true, error: null });
    try {
      const token = await requestAccessToken(GOOGLE_SIGNIN_SCOPES);
      const profile = await fetchUserProfile(token);
      set({ email: profile.email, profile, connecting: false });
      return profile;
    } catch (err) {
      set({ connecting: false, error: err instanceof Error ? err.message : 'Connection failed' });
      return null;
    }
  },

  signInWithCredential(credential) {
    const profile = decodeIdToken(credential);
    persistCredential(credential);
    set({ email: profile.email, profile, error: null });
    return profile;
  },

  disconnect() {
    signOutGoogle();
    clearPersistedCredential();
    set({ email: null, profile: null });
  },

  async token() {
    // Calendar features need the sensitive calendar scopes, requested lazily
    // (incremental auth) so plain sign-in stays non-sensitive.
    return getCachedToken(GOOGLE_CALENDAR_SCOPES) ?? requestAccessToken(GOOGLE_CALENDAR_SCOPES);
  },
}));
