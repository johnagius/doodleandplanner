import {
  clubLockingSoon,
  clubPendingForMe,
  clubPlayedCount,
  orderedFixtures,
  type ClubFixture,
  type ClubLeagueState,
} from '@dap/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isRealtimeBackend } from '../../lib/storage/index.js';
import { useClubLeagueStore } from '../../state/clubLeagueStore.js';
import { ClubRules } from './ClubRules.js';
import { ClubTable } from './ClubTable.js';
import { DivisionsView } from './DivisionsView.js';
import { FixtureCard } from './FixtureCard.js';
import { IdentityBar } from './IdentityBar.js';
import { formatFixtureDayLong } from './clubFormat.js';

type Tab = 'fixtures' | 'table' | 'divisions' | 'rules';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'fixtures', label: 'Fixtures', icon: '📅' },
  { id: 'table', label: 'Season table', icon: '🏆' },
  { id: 'divisions', label: 'Divisions', icon: '🗂️' },
  { id: 'rules', label: 'Rules', icon: '📖' },
];

export function ClubLeaguePage() {
  const { load, leave, setAdmin } = useClubLeagueStore();
  const state = useClubLeagueStore((s) => s.state);
  const loading = useClubLeagueStore((s) => s.loading);
  const error = useClubLeagueStore((s) => s.error);
  const offline = useClubLeagueStore((s) => s.offline);
  const admin = useClubLeagueStore((s) => s.admin);
  const meId = useClubLeagueStore((s) => s.meId);
  const [tab, setTab] = useState<Tab>('fixtures');

  useEffect(() => {
    void load();
    return () => leave();
  }, [load, leave]);

  const club = state?.clubLeague ?? null;
  const boardReady = !!club;

  // Pull the automatic fixture feed once the board is open, then poll it. Fixtures
  // come straight from ESPN's public scoreboard (CORS-open), so this works without
  // any backend of our own; when the realtime backend is on, the reconcile is
  // shared to everyone.
  useEffect(() => {
    if (!boardReady) return;
    const tick = () => void useClubLeagueStore.getState().syncFixtures();
    tick();
    const id = setInterval(tick, 3 * 60_000);
    return () => clearInterval(id);
  }, [boardReady]);

  if (loading && !club) {
    return (
      <div className="container container-narrow">
        <div className="empty">Setting up the Club Football board…</div>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="container container-narrow">
        <div className="card stack" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem' }} aria-hidden>
            ⚽
          </div>
          <h1>Couldn’t open the board</h1>
          <p className="muted">{error ?? 'Please try again in a moment.'}</p>
          <div>
            <button className="btn btn-primary" onClick={() => void load()}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const played = clubPlayedCount(club);
  const total = club.fixtures.length;
  const pending = meId ? clubPendingForMe(club, meId, new Date()) : [];
  const locking = meId ? clubLockingSoon(club, meId, new Date()) : [];

  return (
    <div className="container">
      <section className="club-hero">
        <div className="row spread row-wrap" style={{ gap: '0.75rem' }}>
          <div style={{ minWidth: 0 }}>
            <h1 className="club-hero-title">⚽ Club Football Predictions</h1>
            <p className="muted" style={{ margin: '0.25rem 0 0' }}>
              {club.season} · every game our clubs play, three markets each, promotion &amp;
              relegation.
            </p>
          </div>
          <div className="row row-wrap" style={{ gap: '0.4rem' }}>
            <span className="badge">
              {played} / {total} played
            </span>
            <span className={`badge ${isRealtimeBackend() && !offline ? 'badge-success' : ''}`}>
              {isRealtimeBackend() && !offline ? '🟢 Live sync' : '🔵 This device'}
            </span>
            <button
              className={`btn btn-sm ${admin ? 'btn-primary' : ''}`}
              onClick={() => {
                if (admin) {
                  setAdmin(false);
                  return;
                }
                if (
                  window.confirm(
                    'Turn on organiser mode? Fixtures and results are automatic — this is only for ' +
                      'the rare correction, e.g. an extra-time cup tie, and it scores everyone.',
                  )
                ) {
                  setAdmin(true);
                }
              }}
              aria-pressed={admin}
              title="Organiser only: correct a result in an edge case"
            >
              🔧 Organiser {admin ? 'on' : 'off'}
            </button>
            <Link className="btn btn-sm btn-ghost" to="/">
              ← Home
            </Link>
          </div>
        </div>

        <IdentityBar club={club} />
      </section>

      {error && <div className="banner banner-danger no-print">{error}</div>}

      {locking.length > 0 ? (
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <button className="nudge-chip nudge-urgent" onClick={() => setTab('fixtures')}>
            ⏰ {locking.length} fixture{locking.length === 1 ? '' : 's'} kicking off soon you
            haven’t finished — predict before lock-in
          </button>
        </div>
      ) : (
        pending.length > 0 && (
          <div className="row" style={{ marginTop: '0.75rem' }}>
            <button className="nudge-chip" onClick={() => setTab('fixtures')}>
              ⏳ You have {pending.length} fixture{pending.length === 1 ? '' : 's'} left to predict
            </button>
          </div>
        )
      )}

      <nav className="tabs club-tabs" role="tablist" aria-label="Club Football sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-label">
              <span aria-hidden>{t.icon}</span> {t.label}
            </span>
          </button>
        ))}
      </nav>

      <div role="tabpanel">
        {tab === 'fixtures' && <FixturesView club={club} />}
        {tab === 'table' && <ClubTable club={club} />}
        {tab === 'divisions' && <DivisionsView club={club} />}
        {tab === 'rules' && <ClubRules club={club} />}
      </div>

      <BuildStamp />
    </div>
  );
}

function FixturesView({ club }: { club: ClubLeagueState }) {
  const [compFilter, setCompFilter] = useState<string>('all');
  const [showPlayed, setShowPlayed] = useState(true);

  const fixtures = useMemo(() => {
    let list = orderedFixtures(club);
    if (compFilter !== 'all') list = list.filter((f) => f.competitionId === compFilter);
    if (!showPlayed) list = list.filter((f) => !f.result);
    return list;
  }, [club, compFilter, showPlayed]);

  const grouped = useMemo(() => groupByDay(fixtures), [fixtures]);

  return (
    <div className="stack">
      <div className="club-fixtures-toolbar row row-wrap" style={{ gap: '0.5rem' }}>
        <select
          className="select"
          value={compFilter}
          onChange={(e) => setCompFilter(e.target.value)}
          aria-label="Filter by competition"
        >
          <option value="all">All competitions</option>
          {club.competitions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>
        <label className="row" style={{ gap: '0.3rem', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={showPlayed}
            onChange={(e) => setShowPlayed(e.target.checked)}
          />
          <span className="small">Show played</span>
        </label>
        <span className="muted small club-feed-note">🔄 Fixtures update automatically</span>
      </div>

      {grouped.length === 0 ? (
        <div className="empty">Loading the upcoming fixtures for our clubs…</div>
      ) : (
        grouped.map(({ day, items }) => (
          <div key={day} className="stack" style={{ gap: '0.5rem' }}>
            <h3 className="club-day-head">{formatFixtureDayLong(items[0]!.kickoff)}</h3>
            {items.map((f) => (
              <FixtureCard key={f.id} club={club} fixture={f} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function groupByDay(fixtures: ClubFixture[]): { day: string; items: ClubFixture[] }[] {
  const map = new Map<string, ClubFixture[]>();
  for (const f of fixtures) {
    // Group by the calendar date portion of the ISO kickoff (already ordered).
    const day = f.kickoff.slice(0, 10);
    const list = map.get(day) ?? [];
    list.push(f);
    map.set(day, list);
  }
  return [...map.entries()].map(([day, items]) => ({ day, items }));
}

/** Build stamp — which commit is live (baked in at build time). */
function BuildStamp() {
  const sha = __APP_VERSION__;
  return (
    <footer className="wc-build muted small">
      {sha === 'dev' ? (
        <span>build dev</span>
      ) : (
        <a
          href={`https://github.com/johnagius/doodleandplanner/commit/${sha}`}
          target="_blank"
          rel="noreferrer"
        >
          build {sha}
        </a>
      )}{' '}
      · {__BUILD_TIME__}
    </footer>
  );
}
