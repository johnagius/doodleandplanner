import { useEffect, useState } from 'react';
import { GoogleSignInButton } from './GoogleSignInButton.js';
import { Modal } from './Modal.js';
import { isGoogleConfigured } from '../lib/google/config.js';
import { getPreferredName, setPreferredName } from '../lib/storage/index.js';
import { useGoogleStore } from '../state/googleStore.js';

const SEEN_KEY = 'dap:welcomeSeen';

/**
 * First-run welcome: an app-controlled modal offering Google sign-in or
 * "continue as guest". Replaces Google's flaky One Tap so a signed-out visitor
 * reliably gets a prompt on first load. Shown once per device (dismissal is
 * remembered); never shown if the visitor is already signed in.
 */
export function WelcomeModal() {
  const profile = useGoogleStore((s) => s.profile);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(getPreferredName());

  useEffect(() => {
    const seen = localStorage.getItem(SEEN_KEY);
    if (!seen && !profile) setOpen(true);
  }, [profile]);

  function dismiss() {
    localStorage.setItem(SEEN_KEY, '1');
    setOpen(false);
  }

  function continueAsGuest() {
    if (name.trim()) setPreferredName(name);
    dismiss();
  }

  return (
    <Modal open={open} onClose={dismiss} title="Welcome to Doodle &amp; Planner 👋">
      <p className="muted" style={{ marginTop: 0 }}>
        Plan get-togethers with friends — vote on times, doodle together, split costs and more. Sign
        in to carry your name and avatar across rooms, or just hop in as a guest.
      </p>

      {isGoogleConfigured() && (
        <div className="stack" style={{ alignItems: 'center', gap: '0.75rem' }}>
          <GoogleSignInButton onSignedIn={dismiss} />
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
