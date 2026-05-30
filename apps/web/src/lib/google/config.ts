/** Google OAuth / Calendar configuration, sourced from build-time env vars. */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

/**
 * Identity scopes for "Sign in with Google" (name + avatar). These are
 * non-sensitive, so sign-in never trips Google's unverified-app warning.
 */
export const GOOGLE_SIGNIN_SCOPES = ['openid', 'email', 'profile'].join(' ');

/**
 * Calendar scopes: calendar.readonly reads free/busy + event titles;
 * calendar.events writes the agreed event back. These are "sensitive", so we
 * request them *incrementally* — only when a calendar feature is actually used
 * — to keep plain sign-in friction-free. Identity scopes are bundled so the
 * grant also yields the profile.
 */
export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

export function isGoogleConfigured(): boolean {
  return GOOGLE_CLIENT_ID.trim().length > 0;
}
