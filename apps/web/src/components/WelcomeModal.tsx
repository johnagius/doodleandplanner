import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { GoogleSignInButton } from './GoogleSignInButton.js';
import { Modal } from './Modal.js';
import { isGoogleConfigured } from '../lib/google/config.js';
import { getPreferredName, setPreferredName } from '../lib/storage/index.js';
import { useGoogleStore } from '../state/googleStore.js';

/**
 * First-run welcome: an app-controlled modal offering Google sign-in or
 * "continue as guest". Shown on the home page whenever the visitor is NOT
 * signed in (so it reliably reappears on reload until they sign in), and never
 * once signed in. Dismissal is per page-load only — we don't permanently
 * suppress the sign-in invitation. Replaces Google's flaky One Tap.
 */
export function WelcomeModal() {
  const profile = useGoogleStore((s) => s.profile);
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const [name, setName] = useState(getPreferredName());

  // Only nudge sign-in from the landing page, so invite links / rooms aren't
  // blocked by the modal.
  const open = !profile && !dismissed && pathname === '/';

  function continueAsGuest() {
    if (name.trim()) setPreferredName(name);
    setDismissed(true);
  }

  return (
    <Modal
      open={open}
      onClose={() => setDismissed(true)}
      title="Welcome to Doodle &amp; Planner 👋"
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Plan get-togethers with friends — vote on times, doodle together, split costs and more. Sign
        in to carry your name and avatar across rooms, or just hop in as a guest.
      </p>

      {isGoogleConfigured() && (
        <div className="stack" style={{ alignItems: 'center', gap: '0.75rem' }}>
          <GoogleSignInButton onSignedIn={() => setDismissed(true)} />
          <span className="muted small">— or —</span>
        </div>
      )}

      <div className="stack" style={{ gap: '0.6rem', marginTop: '0.75rem' }}>
        <label className="field">
          Your name <span className="muted small">(optional)</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="How friends know you"
            onKeyDown={(e) => e.key === 'Enter' && continueAsGuest()}
          />
        </label>
        <button type="button" className="btn btn-primary btn-block" onClick={continueAsGuest}>
          Continue as guest
        </button>
      </div>
    </Modal>
  );
}
