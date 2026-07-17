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
import { ClubBackdrop } from './ClubBackdrop.js';
import { ClubExplainer } from './ClubExplainer.js';
import { ClubIdentityModal } from './ClubIdentityModal.js';
import { ClubRules } from './ClubRules.js';
import { installWcSaveAuth } from '../worldcup/wcAuthClient.js';
import { ClubTable } from './ClubTable.js';
import { DivisionsView } from './DivisionsView.js';
import { FixtureCard } from './FixtureCard.js';
import { IdentityBar } from './IdentityBar.js';
import { formatFixtureDayLong, maltaDayKey } from './clubFormat.js';

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
  const [claimId, setClaimId] = useState<string | null>(null);

  // Attach the current name's verified session token to every club-room save.
  useEffect(() => {
    installWcSaveAuth(() => useClubLeagueStore.getState().meId);
  }, []);

  useEffect(() => {
    void load();
    return () => leave();
  }, [load, leave]);

  const club = state?.clubLeague ?? null;
  const boardReady = !!club;

  // Pull the automatic fixture feed once the board is open, then poll it. Fixtures
  // come straight from ESPN's public scoreboard (CORS-open), so this works without
  // any backend of our own. Ticks every 30s: it actually fetches every tick while
  // a game is live (fast, ~real-time scores), else every ~3 minutes.
  useEffect(() => {
    if (!boardReady) return;
    let n = 0;
    const tick = () => {
      const hasLive = Object.keys(useClubLeagueStore.getState().live).length > 0;
      if (hasLive || n % 6 === 0) void useClubLeagueStore.getState().syncFixtures();
      n++;
    };
    tick();
    const id = setInterval(tick, 30_000);
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
        <ClubBackdrop />
        <div className="club-hero-scrim" aria-hidden />
        <div className="row spread row-wrap" style={{ gap: '0.75rem' }}>
          <div style={{ minWidth: 0 }}>
            <h1 className="club-hero-title">⚽ Club Football</h1>
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

        <IdentityBar club={club} onClaim={(id) => setClaimId(id)} />
      </section>

      <ClubIdentityModal
        open={claimId !== null}
        onClose={() => setClaimId(null)}
        club={club}
        initialId={claimId}
      />

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
        {tab === 'rules' && (
          <div className="stack">
            <ClubExplainer />
            <ClubRules club={club} />
          </div>
        )}
      </div>

      <BuildStamp />
    </div>
  );
}

function FixturesView({ club }: { club: ClubLeagueState }) {
  const [compFilter, setCompFilter] = useState<string>('all');

  // Group fixtures into match-days (Malta calendar days), already time-ordered.
  const days = useMemo(() => {
    const list =
      compFilter === 'all'
        ? orderedFixtures(club)
        : orderedFixtures(club).filter((f) => f.competitionId === compFilter);
    const map = new Map<string, ClubFixture[]>();
    for (const f of list) {
      const key = maltaDayKey(f.kickoff);
      (map.get(key) ?? map.set(key, []).get(key)!).push(f);
    }
    return [...map.entries()].map(([key, items]) => ({ key, items }));
  }, [club, compFilter]);

  // Land on the next match-day that still has an unplayed game, else the last.
  const defaultIdx = useMemo(() => {
    const now = Date.now();
    const i = days.findIndex((d) =>
      d.items.some((f) => !f.result && new Date(f.kickoff).getTime() >= now),
    );
    return i >= 0 ? i : Math.max(0, days.length - 1);
  }, [days]);

  const [dayIdx, setDayIdx] = useState(defaultIdx);
  // Clamp when the day list changes (feed refresh / filter switch).
  const idx = Math.min(dayIdx, Math.max(0, days.length - 1));
  const current = days[idx];

  return (
    <div className="stack">
      <div className="row row-wrap" style={{ gap: '0.5rem', alignItems: 'center' }}>
        <select
          className="select"
          style={{ maxWidth: '13rem' }}
          value={compFilter}
          onChange={(e) => {
            setCompFilter(e.target.value);
            setDayIdx(0);
          }}
          aria-label="Filter by competition"
        >
          <option value="all">All competitions</option>
          {club.competitions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setDayIdx(defaultIdx)}
          title="Jump to the next matches"
        >
          ⏭ Next matches
        </button>
        <span className="muted small club-feed-note">🔄 Auto-updated</span>
      </div>

      {!current ? (
        <div className="empty">Loading the upcoming fixtures for our clubs…</div>
      ) : (
        <>
          <DayFlipper
            label={formatFixtureDayLong(current.items[0]!.kickoff)}
            count={current.items.length}
            index={idx}
            total={days.length}
            onGo={(delta) => setDayIdx(idx + delta)}
          />
          <div className="stack" style={{ gap: '0.5rem' }}>
            {current.items.map((f) => (
              <FixtureCard key={f.id} club={club} fixture={f} />
            ))}
          </div>
          <DayFlipper
            label={formatFixtureDayLong(current.items[0]!.kickoff)}
            count={current.items.length}
            index={idx}
            total={days.length}
            onGo={(delta) => setDayIdx(idx + delta)}
          />
        </>
      )}
    </div>
  );
}

/** ‹ Prev · date + count · Next › day navigator. */
function DayFlipper({
  label,
  count,
  index,
  total,
  onGo,
}: {
  label: string;
  count: number;
  index: number;
  total: number;
  onGo: (delta: number) => void;
}) {
  return (
    <div className="club-day-flipper">
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => onGo(-1)}
        disabled={index <= 0}
        aria-label="Previous match-day"
      >
        ‹ Prev
      </button>
      <div className="club-day-flip-label">
        <div className="club-day-flip-date">{label}</div>
        <div className="muted small">
          Match-day {index + 1} of {total} · {count} game{count === 1 ? '' : 's'} · 🇲🇹
        </div>
      </div>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => onGo(1)}
        disabled={index >= total - 1}
        aria-label="Next match-day"
      >
        Next ›
      </button>
    </div>
  );
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
