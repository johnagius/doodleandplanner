/** Google OAuth / Calendar configuration, sourced from build-time env vars. */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

/** calendar.readonly powers free/busy lookups; calendar.events lets us write. */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

export function isGoogleConfigured(): boolean {
  return GOOGLE_CLIENT_ID.trim().length > 0;
}
