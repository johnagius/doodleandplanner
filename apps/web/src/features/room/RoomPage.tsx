import { verifyInvite, verifyPassword } from '@dap/shared';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getPreferredName, setPreferredName } from '../../lib/storage/index.js';
import { useGoogleStore } from '../../state/googleStore.js';
import { useRoomStore } from '../../state/roomStore.js';
import { RoomWorkspace } from './RoomWorkspace.js';

const unlockedKey = (roomId: string) => `dap:unlocked:${roomId}`;

export function RoomPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const inviteToken = params.get('invite') ?? undefined;

  const { state, meId, loading, loadRoom, leave, refreshIdentity } = useRoomStore();
  const googleProfile = useGoogleStore((s) => s.profile);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    void loadRoom(slug);
    return () => leave();
  }, [slug, loadRoom, leave]);

  // Signing in (e.g. on a new device) may reveal that I'm already a member.
  useEffect(() => {
    if (googleProfile) refreshIdentity();
  }, [googleProfile, refreshIdentity]);

  useEffect(() => {
    if (state?.room) {
      setUnlocked(
        !state.room.passwordHash || sessionStorage.getItem(unlockedKey(state.room.id)) === '1',
      );
    }
  }, [state?.room]);

  if (loading) {
    return (
      <div className="container container-narrow">
        <div className="empty">Loading room…</div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="container container-narrow">
        <div className="card stack" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem' }} aria-hidden>
            🕳️
          </div>
          <h1>Room not found</h1>
          <p className="muted">
            No room with the code <code>{slug}</code> is stored on this device. Ask a friend for a
            fresh invite link.
          </p>
          <div>
            <Link className="btn btn-primary" to="/">
              Back home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!unlocked) {
    return <PasswordGate roomId={state.room.id} onUnlock={() => setUnlocked(true)} />;
  }

  if (!meId) {
    return <JoinForm inviteToken={inviteToken} />;
  }

  return <RoomWorkspace />;
}

function PasswordGate({ roomId, onUnlock }: { roomId: string; onUnlock: () => void }) {
  const state = useRoomStore((s) => s.state);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!state?.room.passwordHash) return;
    setBusy(true);
    setError(null);
    const ok = await verifyPassword(password, state.room.passwordHash);
    setBusy(false);
    if (ok) {
      sessionStorage.setItem(unlockedKey(roomId), '1');
      onUnlock();
    } else {
      setError('Incorrect password');
    }
  }

  return (
    <div className="container container-narrow">
      <form className="card stack" onSubmit={handleSubmit} aria-label="Room password">
        <h1 className="card-title">🔒 {state?.room.name}</h1>
        <p className="muted">This room is password protected.</p>
        <label className="field">
          Password
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </label>
        {error && <div className="banner banner-danger">{error}</div>}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy || !password}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}

function JoinForm({ inviteToken }: { inviteToken?: string }) {
  const { state, joinRoom } = useRoomStore();
  const [name, setName] = useState(getPreferredName());
  const [busy, setBusy] = useState(false);

  const inviteValid = useMemo(
    () => (state ? verifyInvite(state.room, inviteToken) : false),
    [state, inviteToken],
  );
  const canJoin = state?.room.settings.openJoin || inviteValid;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setPreferredName(name);
    await joinRoom(name);
  }

  if (!state) return null;

  return (
    <div className="container container-narrow">
      <form className="card stack" onSubmit={handleSubmit} aria-label="Join room">
        <h1 className="card-title">{state.room.name}</h1>
        {state.room.description && <p className="muted">{state.room.description}</p>}
        {inviteValid && <div className="banner">🎉 You’ve been invited to join.</div>}
        {!canJoin ? (
          <div className="banner banner-danger">
            This room is invite-only. Ask the organiser for a valid invite link.
          </div>
        ) : (
          <>
            <label className="field">
              Your name
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="How friends know you"
                autoFocus
                required
              />
            </label>
            <button
              className="btn btn-primary btn-block"
              type="submit"
              disabled={busy || !name.trim()}
            >
              {busy ? 'Joining…' : 'Join room'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
