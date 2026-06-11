import { defaultDay, matchesOn, playedCount, tournamentDays } from '@dap/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isRealtimeBackend } from '../../lib/storage/index.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { BracketView } from './BracketView.js';
import { GroupTables } from './GroupTables.js';
import { Leaderboard } from './Leaderboard.js';
import { MatchCard } from './MatchCard.js';
import { PredictorBar } from './PredictorBar.js';
import { ScoringLegend } from './ScoringLegend.js';
import { formatDayLong } from './wcFormat.js';

type Tab = 'fixtures' | 'groups' | 'bracket' | 'leaderboard';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'fixtures', label: 'Fixtures', icon: '📅' },
  { id: 'groups', label: 'Groups', icon: '🔢' },
  { id: 'bracket', label: 'Bracket', icon: '🏟️' },
  { id: 'leaderboard', label: 'Leaderboard', icon: '🏆' },
];

export function WorldCupPage() {
  const { load, leave, setAdmin } = useWorldCupStore();
  const state = useWorldCupStore((s) => s.state);
  const loading = useWorldCupStore((s) => s.loading);
  const error = useWorldCupStore((s) => s.error);
  const admin = useWorldCupStore((s) => s.admin);
  const [tab, setTab] = useState<Tab>('fixtures');

  useEffect(() => {
    void load();
    return () => leave();
  }, [load, leave]);

  const wc = state?.worldCup ?? null;

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

  return (
    <div className="container">
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
                className={`badge ${isRealtimeBackend() ? 'badge-success' : ''}`}
                title={
                  isRealtimeBackend()
                    ? 'Predictions sync live to everyone'
                    : 'Saved on this device and synced across your tabs'
                }
              >
                {isRealtimeBackend() ? '🟢 Live sync' : '🔵 This device'}
              </span>
              <button
                className={`btn btn-sm ${admin ? 'btn-primary' : ''}`}
                onClick={() => setAdmin(!admin)}
                aria-pressed={admin}
                title="Reveal result-entry controls on each match"
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
      </div>
    </div>
  );
}

function FixturesView() {
  const wc = useWorldCupStore((s) => s.state?.worldCup)!;
  const days = useMemo(() => tournamentDays(wc), [wc]);
  // Land on the soonest day with an unplayed match the first time in. The match
  // calendar never changes, so initialising once is enough.
  const [day, setDay] = useState<string>(() => defaultDay(wc, new Date()));

  const index = days.indexOf(day);
  const matches = day ? matchesOn(wc, day) : [];
  const go = (delta: number) => {
    const next = days[index + delta];
    if (next) setDay(next);
  };

  return (
    <div className="stack">
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
            Day {index + 1} of {days.length} · {matches.length} match
            {matches.length === 1 ? '' : 'es'}
          </div>
        </div>
        <button
          className="btn btn-sm"
          onClick={() => go(1)}
          disabled={index >= days.length - 1}
          aria-label="Next day"
        >
          Next ›
        </button>
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
    </div>
  );
}
