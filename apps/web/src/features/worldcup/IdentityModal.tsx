import { type WorldCupState } from '@dap/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal.js';
import { useToast } from '../../components/Toast.js';
import { isRealtimeBackend } from '../../lib/storage/index.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { Avatar } from './Avatar.js';
import { hasSession, isSessionPersisted, requestCode, verifyCode } from './wcAuthClient.js';
import { WORLD_CUP_SLUG } from './worldCupRoom.js';

type Step = { id: string; name: string; phase: 'email' | 'code' };

/**
 * "Who are you?" + email login. Tapping a name selects it instantly if this
 * browser is already verified for it (no email spent); otherwise it asks for the
 * email tied to that name and a one-time code. `initialId` jumps straight into
 * verifying one name (used by the "lock your name" prompt).
 */
export function IdentityModal({
  open,
  onClose,
  wc,
  initialId = null,
}: {
  open: boolean;
  onClose: () => void;
  wc: WorldCupState;
  initialId?: string | null;
}) {
  const { selectPredictor, addName } = useWorldCupStore();
  const { show } = useToast();
  const [step, setStep] = useState<Step | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  function reset() {
    setStep(null);
    setEmail('');
    setCode('');
    setErr(null);
    setInfo(null);
    setBusy(false);
    setAdding(false);
    setName('');
  }
  function close() {
    reset();
    onClose();
  }

  // When opened to verify a specific name, jump straight into its email step.
  useEffect(() => {
    if (!open) return;
    if (initialId) {
      const p = wc.predictors.find((x) => x.id === initialId);
      if (p && !hasSession(p.id)) setStep({ id: p.id, name: p.name, phase: 'email' });
    }
  }, [open, initialId, wc]);

  // Tapping a name: a verified browser selects instantly; otherwise log in. With
  // no realtime backend there's nothing to protect, so just select.
  function pick(id: string, nm: string) {
    setErr(null);
    setInfo(null);
    if (!isRealtimeBackend() || hasSession(id)) {
      selectPredictor(id);
      close();
      return;
    }
    setStep({ id, name: nm, phase: 'email' });
  }

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    if (!step || busy) return;
    setBusy(true);
    setErr(null);
    const res = await requestCode(WORLD_CUP_SLUG, step.id, email.trim());
    setBusy(false);
    if (res.ok) {
      setInfo(
        res.emailed === false
          ? 'A code is already on its way — check your inbox.'
          : `Code sent to ${email.trim()}.`,
      );
      setStep({ ...step, phase: 'code' });
    } else if (res.error === 'name-taken') {
      setErr('This name is already linked to a different email.');
    } else if (res.status === 503) {
      setErr('Login isn’t switched on yet — try again shortly.');
    } else if (res.error === 'invalid-email') {
      setErr('That email doesn’t look right.');
    } else {
      setErr('Couldn’t send the code. Try again.');
    }
  }

  async function submitCode(e?: FormEvent) {
    e?.preventDefault();
    if (!step || busy) return;
    setBusy(true);
    setErr(null);
    const res = await verifyCode(WORLD_CUP_SLUG, step.id, code.trim());
    setBusy(false);
    if (res.ok) {
      selectPredictor(step.id);
      // The session works now (held in memory + cookie even if localStorage is
      // blocked). Only warn if nothing will survive a reload — i.e. open it in a
      // real browser rather than a chat app's in-app view to stay logged in.
      show(
        isSessionPersisted(step.id)
          ? `You’re verified as ${step.name} ✓`
          : `Verified ✓ — to stay logged in next time, open this link in Safari/Chrome (not inside a chat app).`,
      );
      close();
    } else if (res.error === 'wrong-code') {
      setErr(`Wrong code${typeof res.left === 'number' ? ` — ${res.left} tries left` : ''}.`);
    } else if (res.error === 'no-code') {
      setInfo(null);
      setErr('That code expired — send a new one.');
      setStep({ ...step, phase: 'email' });
    } else if (res.error === 'too-many') {
      setErr('Too many tries — send a new code.');
    } else {
      setErr('Couldn’t verify. Try again.');
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await addName(trimmed); // auto-selects the new predictor → modal closes
    const error = useWorldCupStore.getState().error;
    if (error) show(error);
    else close();
  }

  const title =
    step?.phase === 'email'
      ? `Log in as ${step.name}`
      : step?.phase === 'code'
        ? 'Enter your code'
        : "Who's predicting?";

  return (
    <Modal open={open} onClose={close} title={title}>
      {step?.phase === 'email' ? (
        <form className="stack wc-identity" onSubmit={sendCode}>
          <p className="muted" style={{ margin: 0 }}>
            Enter the email for <strong>{step.name}</strong>. We’ll send a 6-digit code to confirm
            it’s you — just once on this device.
          </p>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            autoFocus
            autoComplete="email"
          />
          {err && <p className="wc-auth-err">{err}</p>}
          <div className="row" style={{ gap: '0.5rem' }}>
            <button className="btn btn-primary" type="submit" disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setStep(null)}>
              Back
            </button>
          </div>
        </form>
      ) : step?.phase === 'code' ? (
        <form className="stack wc-identity" onSubmit={submitCode}>
          {info && (
            <p className="muted" style={{ margin: 0 }}>
              {info}
            </p>
          )}
          <input
            className="input wc-code-input"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            aria-label="6-digit code"
            autoFocus
            autoComplete="one-time-code"
          />
          {err && <p className="wc-auth-err">{err}</p>}
          <div className="row" style={{ gap: '0.5rem' }}>
            <button className="btn btn-primary" type="submit" disabled={busy || code.length < 6}>
              {busy ? 'Checking…' : 'Verify'}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={busy}
              onClick={() => void sendCode()}
            >
              Resend
            </button>
          </div>
        </form>
      ) : (
        <div className="stack wc-identity">
          <p className="muted" style={{ margin: 0 }}>
            Tap your name to start predicting. A 🔒 name is protected — only its email can change
            its picks.
          </p>
          <div className="wc-identity-grid">
            {wc.predictors.map((p) => (
              <button
                key={p.id}
                type="button"
                className="wc-identity-name"
                onClick={() => pick(p.id, p.name)}
              >
                <Avatar predictor={p} size={26} />
                {p.name}
                {p.claimed && (
                  <span className="wc-lock" aria-label="protected" title="Protected by email">
                    {' '}
                    🔒
                  </span>
                )}
              </button>
            ))}
          </div>
          {adding ? (
            <form className="row" style={{ gap: '0.4rem' }} onSubmit={add}>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                aria-label="Your name"
                autoFocus
                maxLength={24}
              />
              <button className="btn btn-primary" type="submit" disabled={!name.trim()}>
                Add
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => setAdding(true)}
            >
              + Add your name
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
