import type { ClubLeagueState } from '@dap/shared';
import { useState } from 'react';
import { Modal } from '../../components/Modal.js';
import { useClubLeagueStore } from '../../state/clubLeagueStore.js';
import { requestCode, verifyCode } from '../worldcup/wcAuthClient.js';
import { CLUB_LEAGUE_SLUG } from './clubLeagueRoom.js';

type Step = 'email' | 'code';

/** Lock a name to an email (World Cup–style one-time-code login): request a code,
 * verify it, and this browser is remembered as that name's owner. Reuses the
 * shared auth client, pointed at the Club Football room. */
export function ClubIdentityModal({
  open,
  onClose,
  club,
  initialId,
}: {
  open: boolean;
  onClose: () => void;
  club: ClubLeagueState;
  initialId: string | null;
}) {
  const select = useClubLeagueStore((s) => s.selectPredictor);
  const [predictorId, setPredictorId] = useState(initialId ?? club.predictors[0]?.id ?? '');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('email');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const name = club.predictors.find((p) => p.id === predictorId)?.name ?? 'your name';

  const reset = () => {
    setStep('email');
    setCode('');
    setMsg(null);
    setError(null);
  };

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    const res = await requestCode(CLUB_LEAGUE_SLUG, predictorId, email.trim());
    setBusy(false);
    if (res.ok) {
      setStep('code');
      setMsg(
        res.emailed === false
          ? 'A code was already sent — check your inbox (and spam).'
          : `We emailed a 6-digit code to ${email.trim()}.`,
      );
    } else {
      setError(errorText(res.error, res.status));
    }
  };

  const submitCode = async () => {
    setBusy(true);
    setError(null);
    const res = await verifyCode(CLUB_LEAGUE_SLUG, predictorId, code.trim());
    setBusy(false);
    if (res.ok) {
      select(predictorId);
      onClose();
      reset();
    } else if (res.error === 'bad-code' && typeof res.left === 'number') {
      setError(`That code isn’t right — ${res.left} attempt${res.left === 1 ? '' : 's'} left.`);
    } else if (res.error === 'expired') {
      setError('That code expired. Send a fresh one.');
      setStep('email');
    } else {
      setError(errorText(res.error, res.status));
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      title={`🔒 Lock “${name}”`}
    >
      <div className="stack" style={{ gap: '0.75rem' }}>
        <p className="muted small" style={{ margin: 0 }}>
          Claim your name with your email so only you can edit your picks. It’s a one-time login —
          this device stays remembered.
        </p>

        <label className="field">
          Your name
          <select
            className="select"
            value={predictorId}
            onChange={(e) => {
              setPredictorId(e.target.value);
              reset();
            }}
          >
            {club.predictors.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.claimed ? ' 🔒' : ''}
              </option>
            ))}
          </select>
        </label>

        {step === 'email' ? (
          <>
            <label className="field">
              Email
              <input
                className="input"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !email.includes('@')}
              onClick={() => void sendCode()}
            >
              {busy ? 'Sending…' : 'Email me a code'}
            </button>
          </>
        ) : (
          <>
            <label className="field">
              6-digit code
              <input
                className="input"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </label>
            <div className="row" style={{ gap: '0.4rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || code.length !== 6}
                onClick={() => void submitCode()}
              >
                {busy ? 'Checking…' : 'Verify & lock'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={reset}>
                Use a different email
              </button>
            </div>
          </>
        )}

        {msg && (
          <p className="banner" style={{ margin: 0 }}>
            {msg}
          </p>
        )}
        {error && (
          <p className="banner banner-danger" style={{ margin: 0 }}>
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function errorText(error: string | undefined, status: number): string {
  switch (error) {
    case 'email-not-configured':
      return 'Name-lock isn’t available yet — email isn’t configured on the server.';
    case 'no-backend':
      return 'This device is offline / has no live backend, so names can’t be locked here.';
    case 'unknown-predictor':
      return 'That name no longer exists on the board.';
    case 'network':
      return 'Network hiccup — try again in a moment.';
    case 'rate-limited':
      return 'Too many attempts — wait a little and try again.';
    default:
      return status === 0 ? 'Couldn’t reach the server.' : 'Something went wrong — try again.';
  }
}
