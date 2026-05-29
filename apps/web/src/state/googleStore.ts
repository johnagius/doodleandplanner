import { create } from 'zustand';
import { getPrimaryEmail } from '../lib/google/calendar.js';
import { getCachedToken, requestAccessToken, signOutGoogle } from '../lib/google/gis.js';

interface GoogleStore {
  connecting: boolean;
  email: string | null;
  error: string | null;
  /** Connect (opens the Google consent popup) and resolve the linked email. */
  connect: () => Promise<string | null>;
  disconnect: () => void;
  /** Get a valid access token, prompting only if needed. */
  token: () => Promise<string>;
}

export const useGoogleStore = create<GoogleStore>((set) => ({
  connecting: false,
  email: null,
  error: null,

  async connect() {
    set({ connecting: true, error: null });
    try {
      const token = await requestAccessToken();
      const email = await getPrimaryEmail(token);
      set({ email, connecting: false });
      return email;
    } catch (err) {
      set({ connecting: false, error: err instanceof Error ? err.message : 'Connection failed' });
      return null;
    }
  },

  disconnect() {
    signOutGoogle();
    set({ email: null });
  },

  async token() {
    return getCachedToken() ?? requestAccessToken();
  },
}));
