import { ROOM_TEMPLATES } from '@dap/shared';
import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeroCanvas } from '../../components/HeroCanvas.js';
import { GoogleSignInButton } from '../../components/GoogleSignInButton.js';
import { Reveal, RevealItem, RevealStagger } from '../../components/Reveal.js';

// The heavy three.js scene is code-split so it never blocks first paint.
const Hero3D = lazy(() => import('../../components/Hero3D.js'));
import {
  getPreferredName,
  getRepository,
  setPreferredName,
  type RoomSummary,
} from '../../lib/storage/index.js';
import { createAndStoreRoom } from '../../lib/roomLifecycle.js';
import { parseRoomFile } from '../../lib/roomFile.js';

export function HomePage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);

  useEffect(() => {
    getRepository().listRooms().then(setRooms);
  }, []);

  async function importRoom(file: File): Promise<void> {
    const state = parseRoomFile(await file.text());
    const repo = getRepository();
    try {
      await repo.createRoom(state);
    } catch {
      await repo.saveRoom(state); // already present — refresh it
    }
    navigate(`/r/${state.room.slug}`);
  }

  return (
    <div className="container">
      <section className="hero">
        <HeroCanvas className="hero-canvas" />
        <Suspense fallback={null}>
          <Hero3D className="hero-3d-layer" />
        </Suspense>
        <div className="hero-inner">
          <span className="hero-eyebrow">Plans, polls &amp; doodles — together</span>
          <h1 className="hero-title">
            Plan it together,
            <br />
            doodle along the way
          </h1>
          <p className="hero-sub">
            Spin up a room, invite friends, and let smart Google Calendar suggestions find a time
            that actually works — then sketch ideas, split the costs, and lock the plan in.
          </p>
          <div className="hero-chips">
            <span className="chip">🗳️ Scheduling polls</span>
            <span className="chip">📅 Calendar-aware</span>
            <span className="chip">🎨 Shared doodle</span>
            <span className="chip">💰 Cost split</span>
          </div>
        </div>
      </section>

      <Reveal className="grid grid-2">
        <CreateRoomCard onCreated={(slug) => navigate(`/r/${slug}`)} />
        <JoinRoomCard onJoin={(code) => navigate(`/r/${code.trim()}`)} onImport={importRoom} />
      </Reveal>

      {rooms.length > 0 && (
        <section className="stack" style={{ marginTop: '1.75rem' }}>
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

      <FeatureSection />
    </div>
  );
}

const FEATURES: { icon: string; title: string; body: string }[] = [
  {
    icon: '🗳️',
    title: 'Vote on a time',
    body: 'Propose slots and everyone votes 👍/🤔/👎. A weighted tally surfaces the winner.',
  },
  {
    icon: '📅',
    title: 'Calendar-aware',
    body: 'Connect Google Calendar to see who’s free — and exactly which event blocks a slot.',
  },
  {
    icon: '🎨',
    title: 'Doodle together',
    body: 'A live shared canvas with shapes, sticky notes and everyone’s cursors.',
  },
  {
    icon: '🎒',
    title: 'Who brings what',
    body: 'A checklist with costs that split fairly and a tidy “who pays whom”.',
  },
  {
    icon: '🎉',
    title: 'Plan the day',
    body: 'Collect activities, build a running order, and RSVP the final events.',
  },
  {
    icon: '🔗',
    title: 'Share in a tap',
    body: 'Every room has an invite link and optional password. Installs as an app, works offline.',
  },
];

function FeatureSection() {
  return (
    <section className="feature-section">
      <Reveal className="feature-head">
        <span className="hero-eyebrow">Everything in one room</span>
        <h2 className="feature-title">From “we should hang out” to a real plan</h2>
      </Reveal>
      <RevealStagger className="feature-grid">
        {FEATURES.map((f) => (
          <RevealItem key={f.title} className="feature-card">
            <span className="feature-icon" aria-hidden>
              {f.icon}
            </span>
            <h3 className="feature-card-title">{f.title}</h3>
            <p className="muted small" style={{ margin: 0 }}>
              {f.body}
            </p>
          </RevealItem>
        ))}
      </RevealStagger>
    </section>
  );
}

function CreateRoomCard({ onCreated }: { onCreated: (slug: string) => void }) {
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState(getPreferredName());
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [templateId, setTemplateId] = useState('blank');
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
        templateId,
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
      <GoogleSignInButton
        onSignedIn={(profile) => {
          if (profile.name) {
            setOwnerName(profile.name);
            setPreferredName(profile.name);
          }
        }}
      />
      <div className="field">
        Start from a template
        <div className="template-grid" role="radiogroup" aria-label="Room template">
          {ROOM_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={templateId === t.id}
              className={`template-chip ${templateId === t.id ? 'selected' : ''}`}
              onClick={() => setTemplateId(t.id)}
              title={t.description}
            >
              <span aria-hidden>{t.icon}</span> {t.name}
            </button>
          ))}
        </div>
      </div>
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

function JoinRoomCard({
  onJoin,
  onImport,
}: {
  onJoin: (code: string) => void;
  onImport: (file: File) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setError(null);
    try {
      await onImport(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import that file');
    }
  }

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
      {error && <div className="banner banner-danger">{error}</div>}
      <label className="muted small" style={{ cursor: 'pointer' }}>
        or import a room file
        <input
          type="file"
          accept="application/json,.json"
          onChange={handleFile}
          aria-label="Import a room file"
          style={{ display: 'block', marginTop: 4 }}
        />
      </label>
    </form>
  );
}
