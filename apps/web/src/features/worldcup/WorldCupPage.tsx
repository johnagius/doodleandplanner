import {
  WC_TIMEZONE,
  defaultDay,
  lockingSoon,
  matchesOn,
  pendingForMe,
  playedCount,
  tournamentDays,
} from '@dap/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { isRealtimeBackend } from '../../lib/storage/index.js';
import { useTitleAlert } from '../../lib/useTitleAlert.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { BettingView } from './BettingView.js';
import { BracketView } from './BracketView.js';
import { CardsView } from './CardsView.js';
import { GroupTables } from './GroupTables.js';
import { IdentityModal } from './IdentityModal.js';
import { Leaderboard } from './Leaderboard.js';
import { MatchCard } from './MatchCard.js';
import { PerformanceView } from './PerformanceView.js';
import { PredictorBar } from './PredictorBar.js';
import { ScoringLegend } from './ScoringLegend.js';
import { TimelineView } from './TimelineView.js';
import { hasSession, installWcSaveAuth } from './wcAuthClient.js';
import { formatDayLong } from './wcFormat.js';

type Tab =
  | 'fixtures'
  | 'groups'
  | 'bracket'
  | 'leaderboard'
  | 'timeline'
  | 'performance'
  | 'cards'
  | 'bets';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'fixtures', label: 'Fixtures', icon: '📅' },
  { id: 'groups', label: 'Groups', icon: '🔢' },
  { id: 'bracket', label: 'Bracket', icon: '🏟️' },
  { id: 'leaderboard', label: 'Leaderboard', icon: '🏆' },
  { id: 'timeline', label: 'Timeline', icon: '📈' },
  { id: 'performance', label: 'Performance', icon: '📋' },
  { id: 'cards', label: 'Cards', icon: '🃏' },
  { id: 'bets', label: 'Bets', icon: '💶' },
];

export function WorldCupPage() {
  const { load, leave, setAdmin } = useWorldCupStore();
  const state = useWorldCupStore((s) => s.state);
  const loading = useWorldCupStore((s) => s.loading);
  const error = useWorldCupStore((s) => s.error);
  const offline = useWorldCupStore((s) => s.offline);
  const admin = useWorldCupStore((s) => s.admin);
  const meId = useWorldCupStore((s) => s.meId);
  const [tab, setTab] = useState<Tab>('fixtures');
  const [identityAsked, setIdentityAsked] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [verifyId, setVerifyId] = useState<string | null>(null);

  // Attach the current name's verified session token to every room save.
  useEffect(() => {
    installWcSaveAuth(() => useWorldCupStore.getState().meId);
  }, []);

  useEffect(() => {
    void load();
    return () => leave();
  }, [load, leave]);

  // Only start polling once the board has actually loaded — otherwise the first
  // tick fires before load() resolves, finds no board, and bails, leaving live
  // scores/goals/cards blank until the next interval.
  const boardReady = !!state?.worldCup;

  // Poll the football feed: auto-fill finished results and refresh in-play info.
  useEffect(() => {
    if (!isRealtimeBackend() || !boardReady) return;
    const tick = () => void useWorldCupStore.getState().syncLiveScores();
    tick();
    // Poll ~every 15s to follow live games; the Worker caches the feed for the
    // same window, so many devices never exceed the upstream rate limits.
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [boardReady]);

  // Poll goals + cards on a slower cadence (the Worker caches the whole-tournament
  // pull ~1 min; they change far less often than the live score).
  useEffect(() => {
    if (!isRealtimeBackend() || !boardReady) return;
    const tick = () => void useWorldCupStore.getState().syncMatchEvents();
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [boardReady]);

  const wc = state?.worldCup ?? null;

  // Tab-title reminder for matches I haven't picked that kick off soon.
  const lockingCount = wc && meId ? lockingSoon(wc, meId, new Date()).length : 0;
  useTitleAlert(lockingCount, 'World Cup 2026 Predictions');

  if (loading && !wc) {
    return (
      <div className="container container-narrow">
        <div className="empty">Setting up the World Cup board…</div>
      </div>
    );
  }

  if (!wc) {
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

  const played = playedCount(wc);
  const total = wc.matches.length;

  // How many matches I still need to pick (nudge chip).
  const pendingCount = meId ? pendingForMe(wc, meId, new Date()).length : 0;

  // Nudge to lock your name: realtime backend, you've picked a name, but this
  // browser isn't verified for it yet (so anyone could still edit your picks).
  const myPredictor = meId ? wc.predictors.find((p) => p.id === meId) : undefined;
  const needsLock = !!myPredictor && isRealtimeBackend() && !offline && !hasSession(myPredictor.id);
  const openVerify = (id: string) => {
    setVerifyId(id);
    setIdentityOpen(true);
  };

  return (
    <div className="container">
      <IdentityModal
        open={(!meId && !identityAsked) || identityOpen}
        onClose={() => {
          setIdentityAsked(true);
          setIdentityOpen(false);
          setVerifyId(null);
        }}
        wc={wc}
        initialId={verifyId}
      />

      <section className="wc-hero">
        <div className="wc-hero-body">
          <div className="row spread row-wrap" style={{ gap: '0.75rem' }}>
            <div style={{ minWidth: 0 }}>
              <h1 className="wc-hero-title">⚽ World Cup 2026 Predictions</h1>
              <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                Predict every scoreline. The closer your guess, the more you score.
              </p>
            </div>
            <div className="row row-wrap" style={{ gap: '0.4rem' }}>
              <span className="badge">
                {played} / {total} played
              </span>
              <span
                className={`badge ${isRealtimeBackend() && !offline ? 'badge-success' : ''}`}
                title={
                  isRealtimeBackend() && !offline
                    ? 'Predictions sync live to everyone'
                    : offline
                      ? 'Backend unreachable — saved on this device for now'
                      : 'Saved on this device and synced across your tabs'
                }
              >
                {isRealtimeBackend() && !offline ? '🟢 Live sync' : '🔵 This device'}
              </span>
              <button
                className={`btn btn-sm ${admin ? 'btn-primary' : ''}`}
                onClick={() => {
                  if (admin) {
                    setAdmin(false);
                    return;
                  }
                  // Guard against accidental taps — only the organiser should
                  // enter official results (it scores everyone's predictions).
                  if (
                    window.confirm(
                      'Turn on organiser mode? Only the organiser should use this — ' +
                        "it lets you enter official full-time results that score everyone's " +
                        'predictions. Most people should leave it off.',
                    )
                  ) {
                    setAdmin(true);
                  }
                }}
                aria-pressed={admin}
                title="Organiser only: enter official results"
              >
                🔧 Organiser {admin ? 'on' : 'off'}
              </button>
              <Link className="btn btn-sm btn-ghost" to="/">
                ← Home
              </Link>
            </div>
          </div>

          <PredictorBar wc={wc} />
        </div>
      </section>

      {error && <div className="banner banner-danger no-print">{error}</div>}

      {pendingCount > 0 && (
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <button className="nudge-chip" onClick={() => setTab('fixtures')}>
            ⏳ You have {pendingCount} match{pendingCount === 1 ? '' : 'es'} to predict
          </button>
        </div>
      )}

      {needsLock && (
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <button className="nudge-chip" onClick={() => openVerify(myPredictor!.id)}>
            {myPredictor!.claimed
              ? `🔒 Log in as ${myPredictor!.name} to edit your picks`
              : `🔒 Lock “${myPredictor!.name}” with your email so only you can edit`}
          </button>
        </div>
      )}

      <ScoringLegend />

      <nav
        className="tabs"
        role="tablist"
        aria-label="World Cup sections"
        style={{ marginTop: '1rem' }}
      >
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
        {tab === 'fixtures' && <FixturesView />}
        {tab === 'groups' && <GroupTables wc={wc} />}
        {tab === 'bracket' && <BracketView wc={wc} />}
        {tab === 'leaderboard' && <Leaderboard wc={wc} />}
        {tab === 'timeline' && <TimelineView wc={wc} />}
        {tab === 'performance' && <PerformanceView wc={wc} />}
        {tab === 'cards' && <CardsView wc={wc} />}
        {tab === 'bets' && <BettingView wc={wc} />}
      </div>

      <BuildStamp />
    </div>
  );
}

/** Which commit is live — baked in at build time so a deploy is verifiable at a
 * glance (no more guessing whether a push has propagated). The SHA links to the
 * commit; 'dev' shows for a local build with no CI commit env. */
function BuildStamp() {
  const sha = __APP_VERSION__;
  let when = __BUILD_TIME__;
  try {
    when = new Date(__BUILD_TIME__).toLocaleString('en-GB', {
      timeZone: WC_TIMEZONE,
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    // keep the raw ISO string if the runtime can't format it
  }
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
      · {when}
    </footer>
  );
}

function FixturesView() {
  const wc = useWorldCupStore((s) => s.state?.worldCup)!;
  const days = useMemo(() => tournamentDays(wc), [wc]);
  // Land on the soonest day with an unplayed match the first time in. The match
  // calendar never changes, so initialising once is enough.
  const [day, setDay] = useState<string>(() => defaultDay(wc, new Date()));
  const topRef = useRef<HTMLDivElement>(null);

  const index = days.indexOf(day);
  const matches = day ? matchesOn(wc, day) : [];
  const go = (delta: number) => {
    const next = days[index + delta];
    if (next) setDay(next);
  };
  // The bottom flip changes the day and brings you back up to the new day's
  // first match, so a long fixture list never leaves you stranded at the foot.
  const goFromBottom = (delta: number) => {
    go(delta);
    topRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="stack">
      <div ref={topRef}>
        <DayNav
          day={day}
          index={index}
          dayCount={days.length}
          matchCount={matches.length}
          go={go}
        />
      </div>

      <div className="row row-wrap" style={{ gap: '0.4rem', justifyContent: 'center' }}>
        <button className="btn btn-sm btn-ghost" onClick={() => setDay(defaultDay(wc, new Date()))}>
          Jump to next matches
        </button>
      </div>

      <div className="wc-fixtures">
        {matches.map((m) => (
          <MatchCard key={m.id} matchId={m.id} />
        ))}
      </div>

      {/* Repeat the day flip at the foot so you can move to the next/previous
          day without scrolling back up to the top control. */}
      <DayNav
        day={day}
        index={index}
        dayCount={days.length}
        matchCount={matches.length}
        go={goFromBottom}
      />
    </div>
  );
}

/** The day flip: ‹ Prev · date + count · Next ›. Rendered at the top and the
 * foot of the fixtures list so you can change day from either end. */
function DayNav({
  day,
  index,
  dayCount,
  matchCount,
  go,
}: {
  day: string;
  index: number;
  dayCount: number;
  matchCount: number;
  go: (delta: number) => void;
}) {
  return (
    <div className="wc-day-nav">
      <button
        className="btn btn-sm"
        onClick={() => go(-1)}
        disabled={index <= 0}
        aria-label="Previous day"
      >
        ‹ Prev
      </button>
      <div className="wc-day-label">
        <div className="wc-day-date">{formatDayLong(day)}</div>
        <div className="muted small">
          Day {index + 1} of {dayCount} · {matchCount} match
          {matchCount === 1 ? '' : 'es'} · 🇲🇹 Malta time
        </div>
      </div>
      <button
        className="btn btn-sm"
        onClick={() => go(1)}
        disabled={index >= dayCount - 1}
        aria-label="Next day"
      >
        Next ›
      </button>
    </div>
  );
}
