import { isGoogleConfigured } from '../lib/google/config.js';
import { useGoogleStore } from '../state/googleStore.js';
import type { GoogleProfile } from '../lib/google/calendar.js';

/**
 * "Sign in with Google" button. When no OAuth client is configured
 * (VITE_GOOGLE_CLIENT_ID unset) it renders disabled with an explanatory tooltip,
 * so the capability is always visible.
 */
export function GoogleSignInButton({
  onSignedIn,
}: {
  onSignedIn?: (profile: GoogleProfile) => void;
}) {
  const { profile, connecting, connect, disconnect } = useGoogleStore();

  if (!isGoogleConfigured()) {
    return (
      <button
        type="button"
        className="btn google-btn"
        disabled
        title="Google sign-in activates once an OAuth client ID is configured for this deployment."
      >
        <GoogleGlyph />
        Sign in with Google
        <span className="badge" style={{ marginLeft: 6 }}>
          soon
        </span>
      </button>
    );
  }

  if (profile) {
    return (
      <div className="row spread" style={{ gap: '0.5rem' }}>
        <span className="row small" style={{ gap: 8, minWidth: 0 }}>
          {profile.picture && (
            <img
              className="avatar-img"
              src={profile.picture}
              alt=""
              width={24}
              height={24}
              referrerPolicy="no-referrer"
              style={{ borderRadius: '50%' }}
            />
          )}
          <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Signed in as <strong>{profile.name ?? profile.email}</strong>
          </span>
        </span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => disconnect()}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="btn google-btn"
      disabled={connecting}
      onClick={async () => {
        const p = await connect();
        if (p) onSignedIn?.(p);
      }}
    >
      <GoogleGlyph />
      {connecting ? 'Connecting…' : 'Sign in with Google'}
    </button>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 8.1 29.3 6 24 6 14.1 6 6 14.1 6 24s8.1 18 18 18c10.6 0 17.5-7.4 17.5-17.5 0-1.4-.1-2.4-.4-4z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 8.1 29.3 6 24 6 16.3 6 9.7 10.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 42c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.6 2.4-7.2 2.4-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.6 37.6 16.2 42 24 42z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2c-.4.4 6.6-4.8 6.6-14.7 0-1.4-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
