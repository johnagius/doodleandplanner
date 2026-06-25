import {
  WC_TIMEZONE,
  achievements,
  cardsWonBy,
  defaultDay,
  fifaRankOf,
  findMatch,
  findTeam,
  leaderboardWithMovement,
  lockingSoon,
  matchDateKey,
  matchOfTheDay,
  matchesOn,
  pendingForMe,
  playedCount,
  predictionCount,
  scorePrediction,
  tournamentDays,
  type Message,
  type WcPredictor,
  type WcWonCard,
  type WorldCupState,
} from '@dap/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Confetti } from '../../components/Confetti.js';
import { useToast } from '../../components/Toast.js';
import { isRealtimeBackend } from '../../lib/storage/index.js';
import { useTitleAlert } from '../../lib/useTitleAlert.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { Countdown } from './Countdown.js';
import { useMatchRoom } from './useMatchRoom.js';
import { useNow } from './useNow.js';
import { BettingView } from './BettingView.js';
import { BracketView } from './BracketView.js';
import { BuzzStrip } from './BuzzStrip.js';
import { CardRevealModal } from './CardRevealModal.js';
import { CardsView } from './CardsView.js';
import { GroupTables } from './GroupTables.js';
import { IdentityModal } from './IdentityModal.js';
import { Leaderboard } from './Leaderboard.js';
import { CinemaView, pickCinemaMatch } from './CinemaView.js';
import { MatchCard } from './MatchCard.js';
import { PerformanceView } from './PerformanceView.js';
import { PredictorBar } from './PredictorBar.js';
import { ScoringLegend } from './ScoringLegend.js';
import { ScorersView } from './ScorersView.js';
import { TimelineView } from './TimelineView.js';
import { hasSession, installWcSaveAuth } from './wcAuthClient.js';
import { mentions } from './wcBanter.js';
import { formatDayLong, formatKickoff } from './wcFormat.js';
import { playSound, useSoundSetting, vibrate } from './wcSound.js';

type Tab =
  | 'fixtures'
  | 'cinema'
  | 'groups'
  | 'bracket'
  | 'scorers'
  | 'leaderboard'
  | 'timeline'
  | 'performance'
  | 'cards'
  | 'bets';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'fixtures', label: 'Fixtures', icon: '📅' },
  { id: 'cinema', label: 'Cinema', icon: '🎬' },
  { id: 'groups', label: 'Groups', icon: '🔢' },
  { id: 'bracket', label: 'Bracket', icon: '🏟️' },
  { id: 'scorers', label: 'Scorers', icon: '🥇' },
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
  const live = useWorldCupStore((s) => s.live);
  const sound = useSoundSetting();
  const [tab, setTab] = useState<Tab>('fixtures');
  // When a nudge fires, jump the Fixtures view to (and flash) this exact match.
  const [focusMatchId, setFocusMatchId] = useState<string | null>(null);
  const jumpToMatch = (id: string | undefined) => {
    if (id) setFocusMatchId(id);
    setTab('fixtures');
  };
  const [identityAsked, setIdentityAsked] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [verifyId, setVerifyId] = useState<string | null>(null);
  // Which live match the "enter the Match Room" banner has been dismissed for.
  const [liveBannerHidden, setLiveBannerHidden] = useState<string | null>(null);
  // Stick the section tabs just under the (sticky) global topbar.
  const [topbarH, setTopbarH] = useState(0);
  useEffect(() => {
    const el = document.querySelector('.topbar');
    if (!el) return;
    const measure = () => setTopbarH(Math.round(el.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
  const lockingList = wc && meId ? lockingSoon(wc, meId, new Date()) : [];
  const lockingCount = lockingList.length;
  useTitleAlert(lockingCount, 'World Cup 2026 Predictions');

  // Celebrate the moment a match I called exactly lands — confetti + a toast.
  const toast = useToast();
  const [confettiKey, setConfettiKey] = useState(0);
  const celebrate = useCallback(
    (message: string) => {
      setConfettiKey((k) => k + 1);
      toast.show(message);
      // Opt-in audio/haptic to match the confetti (no-ops unless sound is on).
      playSound('exact');
      vibrate([20, 40, 20]);
    },
    [toast],
  );
  useExactCelebration(wc, meId, celebrate);
  useTrophyCelebration(wc, meId, celebrate);

  // Pack-opening reveal for cards I newly win: queue them up + pop confetti.
  const [revealCards, setRevealCards] = useState<WcWonCard[]>([]);
  const onCardsWon = useCallback((cards: WcWonCard[]) => {
    setRevealCards((q) => [...q, ...cards]);
    setConfettiKey((k) => k + 1);
  }, []);
  useCardWinCelebration(wc, meId, onCardsWon);

  // Ping me when a mate @mentions me in any match thread.
  useMentionPing(state?.messages, wc?.predictors ?? [], meId, toast.show);

  // A short "story beat" when a match I'm in resolves and shifts my standing.
  useStoryBeat(wc, meId, toast.show);

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
  const liveMatch = wc.matches.find(
    (m) =>
      !m.result &&
      live[m.id] &&
      (live[m.id]!.status === 'IN_PLAY' || live[m.id]!.status === 'PAUSED'),
  );
  const liveCount = wc.matches.filter(
    (m) =>
      !m.result &&
      live[m.id] &&
      (live[m.id]!.status === 'IN_PLAY' || live[m.id]!.status === 'PAUSED'),
  ).length;

  // Matches I still need to pick (nudge chip jumps to the first of these).
  const pendingList = meId ? pendingForMe(wc, meId, new Date()) : [];
  const pendingCount = pendingList.length;

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
      <Confetti fireKey={confettiKey} />
      <CinemaView wc={wc} />
      <CardRevealModal cards={revealCards} wc={wc} onClose={() => setRevealCards([])} />
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
                className={`btn btn-sm wc-sound-toggle ${sound.enabled ? 'btn-primary' : ''}`}
                onClick={sound.toggle}
                aria-pressed={sound.enabled}
                aria-label={sound.enabled ? 'Mute sound and haptics' : 'Enable sound and haptics'}
                title={
                  sound.enabled
                    ? 'Sound & haptics on — tap to mute'
                    : 'Sound & haptics off — tap to enable the immersive cues'
                }
              >
                <span aria-hidden>{sound.enabled ? '🔊' : '🔇'}</span> Sound
              </button>
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

      {lockingCount > 0 ? (
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <button
            className="nudge-chip nudge-urgent"
            onClick={() => jumpToMatch(lockingList[0]?.id)}
          >
            ⏰ {lockingCount} game{lockingCount === 1 ? '' : 's'} kicking off soon you haven’t
            picked — predict before lock-in
          </button>
        </div>
      ) : (
        pendingCount > 0 && (
          <div className="row" style={{ marginTop: '0.75rem' }}>
            <button className="nudge-chip" onClick={() => jumpToMatch(pendingList[0]?.id)}>
              ⏳ You have {pendingCount} match{pendingCount === 1 ? '' : 'es'} to predict
            </button>
          </div>
        )
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

      {liveMatch && liveBannerHidden !== liveMatch.id && (
        <div className="row wc-live-cta" style={{ marginTop: '0.75rem', gap: '0.4rem' }}>
          <button
            className="nudge-chip nudge-urgent"
            onClick={() => useMatchRoom.getState().open(liveMatch.id)}
          >
            🔴 {findTeam(wc, liveMatch.homeId)?.name ?? '?'} v{' '}
            {findTeam(wc, liveMatch.awayId)?.name ?? '?'} is live — enter the Match Room ⤢
          </button>
          <button
            className="btn btn-sm btn-ghost"
            aria-label="Dismiss the live Match Room prompt"
            onClick={() => setLiveBannerHidden(liveMatch.id)}
          >
            ✕
          </button>
        </div>
      )}

      <ScoringLegend />

      <nav
        className="tabs wc-tabs"
        role="tablist"
        aria-label="World Cup sections"
        style={{ marginTop: '1rem', top: topbarH }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={(e) => {
              if (t.id === 'cinema') {
                const m = pickCinemaMatch(wc, live);
                useMatchRoom.getState().open(m?.id ?? 'cinema');
                return;
              }
              setTab(t.id);
              e.currentTarget.scrollIntoView?.({ inline: 'center', block: 'nearest' });
            }}
          >
            <span className="tab-label">
              <span aria-hidden>{t.icon}</span> {t.label}
              {t.id === 'fixtures' && liveCount > 0 && (
                <span className="wc-tab-live" aria-label={`${liveCount} live now`} />
              )}
            </span>
          </button>
        ))}
      </nav>

      <div role="tabpanel">
        {tab === 'fixtures' && (
          <FixturesView focusMatchId={focusMatchId} onFocused={() => setFocusMatchId(null)} />
        )}
        {tab === 'groups' && <GroupTables wc={wc} />}
        {tab === 'bracket' && <BracketView wc={wc} />}
        {tab === 'scorers' && <ScorersView wc={wc} />}
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

/**
 * Fire `onCelebrate` the instant a match the current player called *exactly*
 * lands a result. Tracks which exacts we've already seen for this identity in a
 * ref, so the first observation (and a reload) baselines silently — only a fresh
 * spot-on result during the session pops the confetti. Re-baselines on identity
 * change. A batch of new exacts in one update is celebrated once.
 */
function useExactCelebration(
  wc: WorldCupState | null,
  meId: string | null,
  onCelebrate: (message: string) => void,
) {
  const seen = useRef<Set<string> | null>(null);
  const lastMe = useRef<string | null>(null);

  useEffect(() => {
    if (!wc || !meId) {
      seen.current = null;
      lastMe.current = meId;
      return;
    }
    // Switching who "I" am must not celebrate the new identity's past exacts.
    if (lastMe.current !== meId) {
      seen.current = null;
      lastMe.current = meId;
    }

    const exacts: string[] = [];
    for (const m of wc.matches) {
      if (!m.result) continue;
      const pred = wc.predictions.find((p) => p.matchId === m.id && p.predictorId === meId);
      if (pred && scorePrediction(pred, m.result).category === 'exact') exacts.push(m.id);
    }

    if (seen.current === null) {
      seen.current = new Set(exacts); // first look for this identity → baseline silently
      return;
    }

    const fresh = exacts.filter((id) => !seen.current!.has(id));
    for (const id of fresh) seen.current.add(id);
    if (fresh.length === 1) {
      const m = wc.matches.find((x) => x.id === fresh[0]);
      onCelebrate(`🎯 Spot on! ${m ? matchScoreLabel(wc, m.id) : 'Exact score'} (+5)`);
    } else if (fresh.length > 1) {
      onCelebrate(`🎯 ${fresh.length} exact scores! +${fresh.length * 5}`);
    }
  }, [wc, meId, onCelebrate]);
}

/**
 * Toast a short "story beat" when a match I predicted resolves and it actually
 * shifts my standing — "📖 You climbed to #2 of 8". Baselines on first look and
 * on identity change, so a reload never replays the whole season.
 */
function useStoryBeat(
  wc: WorldCupState | null,
  meId: string | null,
  onBeat: (message: string) => void,
) {
  const seen = useRef<Set<string> | null>(null);
  const lastMe = useRef<string | null>(null);

  useEffect(() => {
    if (!wc || !meId) {
      seen.current = null;
      lastMe.current = meId;
      return;
    }
    if (lastMe.current !== meId) {
      seen.current = null;
      lastMe.current = meId;
    }
    const mine = wc.matches
      .filter(
        (m) => m.result && wc.predictions.some((p) => p.matchId === m.id && p.predictorId === meId),
      )
      .map((m) => m.id);
    if (seen.current === null) {
      seen.current = new Set(mine);
      return;
    }
    const fresh = mine.filter((id) => !seen.current!.has(id));
    for (const id of fresh) seen.current.add(id);
    if (fresh.length === 0) return;
    const rows = leaderboardWithMovement(wc);
    const me = rows.find((r) => r.predictorId === meId);
    if (!me || me.movement === 0) return;
    const verb = me.movement > 0 ? 'climbed to' : 'slipped to';
    onBeat(`📖 You ${verb} #${me.rank} of ${rows.length}`);
  }, [wc, meId, onBeat]);
}

/**
 * Fire `onCelebrate` when the current player unlocks a new trophy this session.
 * Baselines the earned set silently on first load and on identity change, so a
 * fresh unlock pops the confetti — never the whole cabinet on load.
 */
function useTrophyCelebration(
  wc: WorldCupState | null,
  meId: string | null,
  onCelebrate: (message: string) => void,
) {
  const seen = useRef<Set<string> | null>(null);
  const lastMe = useRef<string | null>(null);

  useEffect(() => {
    if (!wc || !meId) {
      seen.current = null;
      lastMe.current = meId;
      return;
    }
    if (lastMe.current !== meId) {
      seen.current = null;
      lastMe.current = meId;
    }
    const earned = achievements(wc, meId).filter((a) => a.earned);
    if (seen.current === null) {
      seen.current = new Set(earned.map((a) => a.id)); // baseline silently
      return;
    }
    const fresh = earned.filter((a) => !seen.current!.has(a.id));
    for (const a of fresh) seen.current.add(a.id);
    if (fresh.length === 1) {
      onCelebrate(`🏅 Trophy unlocked: ${fresh[0]!.label}!`);
    } else if (fresh.length > 1) {
      onCelebrate(`🏅 ${fresh.length} trophies unlocked!`);
    }
  }, [wc, meId, onCelebrate]);
}

/**
 * Hand `onWin` the cards the current player has *newly* won this session, for a
 * pack-opening reveal. Same baseline-on-first-look trick as the other
 * celebrations, so a reload never re-reveals the whole collection; re-baselines
 * on identity change. Cards stay purely derived from results.
 */
function useCardWinCelebration(
  wc: WorldCupState | null,
  meId: string | null,
  onWin: (cards: WcWonCard[]) => void,
) {
  const seen = useRef<Set<string> | null>(null);
  const lastMe = useRef<string | null>(null);

  useEffect(() => {
    if (!wc || !meId) {
      seen.current = null;
      lastMe.current = meId;
      return;
    }
    if (lastMe.current !== meId) {
      seen.current = null;
      lastMe.current = meId;
    }
    const keyOf = (w: WcWonCard) => `${w.matchId}|${w.player.id}`;
    const won = cardsWonBy(wc, meId);
    if (seen.current === null) {
      seen.current = new Set(won.map(keyOf)); // baseline silently
      return;
    }
    const fresh = won.filter((w) => !seen.current!.has(keyOf(w)));
    for (const w of fresh) seen.current.add(keyOf(w));
    if (fresh.length > 0) onWin(fresh);
  }, [wc, meId, onWin]);
}

/**
 * Toast me when a mate *newly* @mentions me in any match thread this session.
 * Same baseline-on-first-look trick as the celebrations, so a reload never
 * re-pings old mentions; re-baselines on identity change.
 */
function useMentionPing(
  messages: Message[] | undefined,
  predictors: WcPredictor[],
  meId: string | null,
  onPing: (message: string) => void,
) {
  const seen = useRef<Set<string> | null>(null);
  const lastMe = useRef<string | null>(null);
  const meName = predictors.find((p) => p.id === meId)?.name ?? null;

  useEffect(() => {
    if (!messages || !meId || !meName) {
      seen.current = null;
      lastMe.current = meId;
      return;
    }
    if (lastMe.current !== meId) {
      seen.current = null;
      lastMe.current = meId;
    }
    const atMe = messages.filter(
      (m) => m.authorId !== meId && !!m.text && mentions(m.text, meName),
    );
    if (seen.current === null) {
      seen.current = new Set(atMe.map((m) => m.id)); // baseline silently
      return;
    }
    const fresh = atMe.filter((m) => !seen.current!.has(m.id));
    for (const m of fresh) seen.current.add(m.id);
    if (fresh.length > 0) {
      const author = predictors.find((p) => p.id === fresh[fresh.length - 1]!.authorId)?.name;
      onPing(`💬 ${author ?? 'Someone'} mentioned you`);
    }
  }, [messages, predictors, meId, meName, onPing]);
}

/** "🇧🇷 BRA 2–1 ARG 🇦🇷" for a resolved match, for a celebration toast. */
function matchScoreLabel(wc: WorldCupState, matchId: string): string {
  const m = wc.matches.find((x) => x.id === matchId);
  if (!m || !m.result) return 'Exact score';
  const home = findTeam(wc, m.homeId);
  const away = findTeam(wc, m.awayId);
  return `${home?.id ?? '?'} ${m.result.home}–${m.result.away} ${away?.id ?? '?'}`;
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

function FixturesView({
  focusMatchId,
  onFocused,
}: {
  focusMatchId: string | null;
  onFocused: () => void;
}) {
  const wc = useWorldCupStore((s) => s.state?.worldCup)!;
  const live = useWorldCupStore((s) => s.live);
  const days = useMemo(() => tournamentDays(wc), [wc]);
  const liveMatch = wc.matches.find(
    (m) =>
      !m.result &&
      live[m.id] &&
      (live[m.id]!.status === 'IN_PLAY' || live[m.id]!.status === 'PAUSED'),
  );
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
  // Jump straight to a specific day (used by the Match of the Day "see fixture").
  const jumpToDay = (d: string) => {
    if (days.includes(d)) setDay(d);
    topRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  // A nudge asked us to surface one exact match: switch to its day, then scroll
  // it into view and flash it. Runs again after `day` updates so the card exists.
  useEffect(() => {
    if (!focusMatchId) return;
    const target = findMatch(wc, focusMatchId);
    if (!target) {
      onFocused();
      return;
    }
    const targetDay = matchDateKey(target);
    if (day !== targetDay) {
      if (days.includes(targetDay)) setDay(targetDay);
      else onFocused(); // not in the calendar — nothing to jump to
      return;
    }
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`wc-fx-${focusMatchId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('wc-focus-flash');
        window.setTimeout(() => el.classList.remove('wc-focus-flash'), 2200);
      }
      onFocused();
    });
    return () => cancelAnimationFrame(raf);
  }, [focusMatchId, day]); // eslint-disable-line -- wc/days are stable here

  return (
    <div className="stack">
      <Spotlight wc={wc} onJump={jumpToDay} />
      <BuzzStrip />

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
        {liveMatch && (
          <>
            <button
              className="btn btn-sm wc-live-jump"
              onClick={() => jumpToDay(matchDateKey(liveMatch))}
            >
              🔴 Jump to live
            </button>
            <button
              className="btn btn-sm btn-primary wc-room-open"
              onClick={() => useMatchRoom.getState().open(liveMatch.id)}
            >
              ⤢ Match Room
            </button>
          </>
        )}
        <button className="btn btn-sm btn-ghost" onClick={() => setDay(defaultDay(wc, new Date()))}>
          Jump to next matches
        </button>
      </div>

      <div className="wc-fixtures">
        {matches.map((m) => (
          <MatchCard key={m.id} matchId={m.id} anchorId={`wc-fx-${m.id}`} />
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

/** Pre-kickoff hype: today's biggest fixture (by stakes, FIFA ranks and how even
 * it is) — or the next match day's when today has none — with a live countdown
 * and a jump to its day. Recomputed at most once a minute; the countdown still
 * ticks per second. */
function Spotlight({ wc, onJump }: { wc: WorldCupState; onJump: (day: string) => void }) {
  const now = useNow(1000);
  const minute = Math.floor(now / 60_000);
  const motd = useMemo(() => matchOfTheDay(wc, new Date(minute * 60_000)), [wc, minute]);
  const m = motd ? findMatch(wc, motd.matchId) : null;
  if (!motd || !m) return null;
  const home = findTeam(wc, m.homeId);
  const away = findTeam(wc, m.awayId);
  const hr = fifaRankOf(m.homeId);
  const ar = fifaRankOf(m.awayId);
  const picks = predictionCount(wc, m.id);
  return (
    <div className="card wc-spotlight">
      <div className="row spread" style={{ alignItems: 'center' }}>
        <span className="wc-spotlight-tag">🔥 Match of the Day</span>
        <Countdown kickoff={m.kickoff} now={now} />
      </div>
      <div className="wc-spotlight-teams">
        <span className="wc-spotlight-team">
          <span className="wc-spotlight-flag" aria-hidden>
            {home?.flag ?? '⚽'}
          </span>
          <span className="wc-spotlight-tname">{home?.name ?? '?'}</span>
          {hr != null && <span className="wc-spotlight-rank muted small">#{hr}</span>}
        </span>
        <span className="wc-spotlight-vs">v</span>
        <span className="wc-spotlight-team">
          <span className="wc-spotlight-flag" aria-hidden>
            {away?.flag ?? '⚽'}
          </span>
          <span className="wc-spotlight-tname">{away?.name ?? '?'}</span>
          {ar != null && <span className="wc-spotlight-rank muted small">#{ar}</span>}
        </span>
      </div>
      <div className="muted small">
        {formatKickoff(m.kickoff)} 🇲🇹{m.venue ? ` · ${m.venue}` : ''}
      </div>
      {motd.reasons.length > 0 && (
        <div className="wc-spotlight-reasons">
          {motd.reasons.map((r) => (
            <span key={r} className="wc-spotlight-chip">
              {r}
            </span>
          ))}
        </div>
      )}
      <div className="row spread" style={{ alignItems: 'center' }}>
        <span className="muted small">
          🗳 {picks}/{wc.predictors.length} have picked it
        </span>
        <span className="row" style={{ gap: '0.4rem' }}>
          <button
            className="btn btn-sm btn-primary wc-room-open"
            onClick={() => useMatchRoom.getState().open(m.id)}
          >
            ⤢ Build-up
          </button>
          <button className="btn btn-sm" onClick={() => onJump(matchDateKey(m))}>
            See fixture →
          </button>
        </span>
      </div>
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
