import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getPreferredName,
  getRepository,
  setPreferredName,
  type RoomSummary,
} from '../../lib/storage/index.js';
import { createAndStoreRoom } from '../../lib/roomLifecycle.js';

export function HomePage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);

  useEffect(() => {
    getRepository().listRooms().then(setRooms);
  }, []);

  return (
    <div className="container">
      <section className="stack" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '2rem' }}>Plan it together, doodle along the way ✏️🗓️</h1>
        <p className="muted" style={{ maxWidth: 620, margin: '0 auto' }}>
          Create a room, invite your friends, find a time that works with smart calendar
          suggestions, sketch ideas on a shared doodle, and sort out who brings what.
        </p>
      </section>

      <div className="grid grid-2">
        <CreateRoomCard onCreated={(slug) => navigate(`/r/${slug}`)} />
        <JoinRoomCard onJoin={(code) => navigate(`/r/${code.trim()}`)} />
      </div>

      {rooms.length > 0 && (
        <section className="stack" style={{ marginTop: '1.5rem' }}>
          <h2 className="card-title">Your rooms</h2>
          <div className="grid grid-2">
            {rooms.map((r) => (
              <button
                key={r.slug}
                className="card row spread"
                style={{ cursor: 'pointer', textAlign: 'left' }}
                onClick={() => navigate(`/r/${r.slug}`)}
              >
                <div>
                  <div className="card-title">{r.name}</div>
                  <div className="muted small">
                    {r.memberCount} member{r.memberCount === 1 ? '' : 's'} · code {r.slug}
                  </div>
                </div>
                <span aria-hidden>→</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CreateRoomCard({ onCreated }: { onCreated: (slug: string) => void }) {
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState(getPreferredName());
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setPreferredName(ownerName);
      const { slug } = await createAndStoreRoom({
        name,
        ownerName,
        description: description || undefined,
        password: password || undefined,
      });
      onCreated(slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create room');
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={handleSubmit} aria-label="Create a room">
      <h2 className="card-title">Start a new room</h2>
      <label className="field">
        Room name
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Summer BBQ, Ski trip…"
          required
        />
      </label>
      <label className="field">
        Your name
        <input
          className="input"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          placeholder="How friends know you"
          required
        />
      </label>
      <label className="field">
        Description <span className="muted small">(optional)</span>
        <textarea
          className="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's the plan?"
        />
      </label>
      <label className="field">
        Password <span className="muted small">(optional)</span>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Protect the room"
          autoComplete="new-password"
        />
      </label>
      {error && <div className="banner banner-danger">{error}</div>}
      <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create room'}
      </button>
    </form>
  );
}

function JoinRoomCard({ onJoin }: { onJoin: (code: string) => void }) {
  const [code, setCode] = useState('');
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) onJoin(code);
      }}
      aria-label="Join a room"
    >
      <h2 className="card-title">Join with a code</h2>
      <p className="muted small">Got an invite link or a room code from a friend? Hop in.</p>
      <label className="field">
        Room code
        <input
          className="input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. k7m2qp"
          autoCapitalize="none"
          autoCorrect="off"
        />
      </label>
      <button className="btn btn-block" type="submit" disabled={!code.trim()}>
        Go to room
      </button>
    </form>
  );
}
