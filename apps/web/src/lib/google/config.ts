/** Google OAuth / Calendar configuration, sourced from build-time env vars. */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

/**
 * Scopes: openid/email/profile power "Sign in with Google" (name + avatar);
 * calendar.readonly reads free/busy + event titles; calendar.events writes the
 * agreed event back.
 */
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

export function isGoogleConfigured(): boolean {
  return GOOGLE_CLIENT_ID.trim().length > 0;
}
