import {
  WC_REACTIONS,
  WC_SCORE_LABEL,
  WC_STAGE_LABEL,
  WC_TIMEZONE,
  climateEdge,
  closestPredictors,
  closestToScore,
  consensusScore,
  crownOdds,
  fifaRankOf,
  findTeam,
  liveRankFlips,
  liveSweat,
  minuteValue,
  teamClimate,
  venueClimate,
  groupOutlook,
  groupStandings,
  impliedOutcome,
  isMatchLocked,
  isMatchReady,
  pendingPredictors,
  predictionCount,
  scorePrediction,
  slotLabel,
  teamRecord,
  type WcGroupOutlookRow,
  type WcMatch,
  type WcMatchEvent,
  type WcMatchOdds,
  type WcScoreCategory,
  type WcTeam,
  type WorldCupState,
} from '@dap/shared';
import { useMemo, useState } from 'react';
import { useToast } from '../../components/Toast.js';
import { useWorldCupStore, type WcLiveInfo } from '../../state/worldCupStore.js';
import { Avatar } from './Avatar.js';
import { Countdown } from './Countdown.js';
import { useHeadToHead, type H2HState } from './h2h.js';
import { LineupView } from './LineupView.js';
import { MatchComments } from './MatchComments.js';
import { ScenariosView } from './ScenariosView.js';
import { ScoreStepper } from './ScoreStepper.js';
import { useNow } from './useNow.js';
import { formatKickoff, legibleScoreColor } from './wcFormat.js';

const POINT_CLASS: Record<WcScoreCategory, string> = {
  exact: 'wc-pts-exact',
  goalDiff: 'wc-pts-diff',
  outcome: 'wc-pts-outcome',
  close: 'wc-pts-close',
  miss: 'wc-pts-miss',
};

/** Malta-time HH:MM:SS for "score as of …" (used only when the feed has no
 * live minute — i.e. the football-data fallback). */
function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: WC_TIMEZONE,
  });
}

/** Live badge/caption text: half-time, the live minute/clock, or just "LIVE". */
function liveLabel(live: WcLiveInfo): string {
  if (live.status === 'PAUSED') return live.detail || 'HT';
  if (live.clock) return live.clock;
  if (live.minute != null) return `${live.minute}'`;
  return 'LIVE';
}

/** A headline when the live score is defying the bookies' pre-match favourite —
 *  the underdog leading, or a heavy favourite held. null when it's going to form. */
function upsetAlert(
  odds: WcMatchOdds | null,
  live: WcLiveInfo,
  home: WcTeam | undefined,
  away: WcTeam | undefined,
): string | null {
  const imp = impliedOutcome(odds);
  if (!imp || live.home == null || live.away == null) return null;
  const asPct = (n: number) => `${Math.round(n * 100)}%`;
  const favHome = imp.home >= imp.away;
  const lead = live.home - live.away;
  if (favHome && lead < 0 && away) {
    return `${away.flag} ${away.name} leading — the ${asPct(imp.away)} shock is on`;
  }
  if (!favHome && lead > 0 && home) {
    return `${home.flag} ${home.name} leading — the ${asPct(imp.home)} shock is on`;
  }
  const favProb = Math.max(imp.home, imp.away);
  if (live.home === live.away && favProb >= 0.6 && (live.minute ?? 0) >= 55) {
    const fav = favHome ? home : away;
    if (fav) {
      return `${fav.flag} ${fav.name} held ${live.home}–${live.away} — they were ${asPct(favProb)} to win`;
    }
  }
  return null;
}

const EVENT_ICON: Record<WcMatchEvent['kind'], string> = {
  goal: '⚽',
  'pen-goal': '⚽',
  'own-goal': '⚽',
  yellow: '🟨',
  red: '🟥',
};
const EVENT_TAG: Partial<Record<WcMatchEvent['kind'], string>> = {
  'pen-goal': ' (pen)',
  'own-goal': ' (OG)',
};

/** Goals + cards for a played/in-play game (from the live feed), interleaved
 *  with the prediction-table flips each goal caused — so you can watch the
 *  standings shuffle in step with the match. */
function MatchEvents({
  events,
  wc,
  match,
}: {
  events?: WcMatchEvent[];
  wc: WorldCupState;
  match: WcMatch;
}) {
  const flips = useMemo(() => liveRankFlips(wc, match.id, events), [wc, match.id, events]);
  if (!events || events.length === 0) return null;

  const items: { sort: number; el: JSX.Element }[] = [
    ...events.map((e, i) => ({
      sort: minuteValue(e.minute),
      el: (
        <li key={`e${i}`} className={`wc-ev wc-ev-${e.kind}`}>
          <span className="wc-ev-min">{e.minute}</span>
          <span aria-hidden>{EVENT_ICON[e.kind]}</span>
          <span className="wc-ev-flag" aria-hidden>
            {findTeam(wc, e.teamTla)?.flag ?? ''}
          </span>
          <span className="wc-ev-player">
            {e.player}
            {EVENT_TAG[e.kind] ?? ''}
            {e.assist && <span className="muted"> · {e.assist}</span>}
          </span>
        </li>
      ),
    })),
    ...flips.map((f, i) => ({
      sort: minuteValue(f.minute) + 0.001, // sit just after the goal that caused it
      el: (
        <li key={`f${i}`} className="wc-ev wc-ev-flip">
          <span className="wc-ev-min">{f.minute}</span>
          <span aria-hidden>{f.topChange ? '👑' : '🔀'}</span>
          <span className="wc-ev-flag" aria-hidden />
          <span className="wc-ev-player">
            <strong>{f.name}</strong>{' '}
            {f.topChange ? 'tops the table' : `up to ${POS_LABEL(f.toRank)}`}
            {f.passed.length > 0 && (
              <span className="muted">
                {' '}
                · pips {f.passed.slice(0, 2).join(', ')}
                {f.passed.length > 2 ? '…' : ''}
              </span>
            )}
            {f.alsoMoved > 0 && <span className="muted"> · +{f.alsoMoved} more</span>}
            <span className="muted">
              {' '}
              · {f.home}–{f.away}
            </span>
          </span>
        </li>
      ),
    })),
  ].sort((a, b) => a.sort - b.sort);

  return <ul className="wc-events">{items.map((it) => it.el)}</ul>;
}

/** Live "how much can this still shake the table" gauge — Monte-Carlo over the
 *  match's remaining goals (scaled by time left), measuring how far the overall
 *  standings could still move from where they sit right now. */
function SweatMeter({ wc, match, live }: { wc: WorldCupState; match: WcMatch; live: WcLiveInfo }) {
  const odds = live.odds ?? wc.odds?.[match.id] ?? null;
  const sweat = useMemo(
    () =>
      liveSweat(wc, match.id, {
        odds,
        live: { home: live.home ?? 0, away: live.away ?? 0, minute: live.minute },
      }),
    [wc, match.id, odds, live.home, live.away, live.minute],
  );
  if (sweat.trials === 0 || predictionCount(wc, match.id) === 0) return null;

  const pct = Math.round(sweat.index * 100);
  const minute = live.minute ?? 0;
  const endgame = minute >= 80 && sweat.index >= 0.3; // late and still in flux
  const band =
    endgame && sweat.index >= 0.45
      ? { cls: 'is-boiling', label: '⏱️ Squeaky-bum time' }
      : sweat.index >= 0.55
        ? { cls: 'is-boiling', label: '🔥 Boiling' }
        : sweat.index >= 0.3
          ? { cls: 'is-hot', label: '😅 Sweaty' }
          : sweat.index >= 0.12
            ? { cls: 'is-warm', label: '🌤️ Simmering' }
            : { cls: 'is-cool', label: '🧊 Settled' };
  return (
    <div className={`wc-sweat ${band.cls}${endgame ? ' is-endgame' : ''}`}>
      <div className="wc-sweat-head">
        <span>🌡️ Sweat-o-meter</span>
        <span className="wc-sweat-band">{band.label}</span>
      </div>
      <div className="wc-sweat-bar" aria-hidden>
        <span className="wc-sweat-fill" style={{ width: `${Math.max(5, pct)}%` }} />
      </div>
      <div className="muted small">
        {sweat.pLeadChange >= 0.01 && sweat.leaderName
          ? `${sweat.leaderName} leads for now — 1st place ${Math.round(sweat.pLeadChange * 100)}% in play`
          : sweat.leaderName
            ? `${sweat.leaderName} sitting tight up top`
            : 'No predictions in yet'}
      </div>
    </div>
  );
}

/** Live race for this match's 🎯 crown (closest pick), via the same odds-driven
 *  simulation as the sweat-o-meter. Shows the top few contenders' chances. */
function CrownRace({ wc, match, live }: { wc: WorldCupState; match: WcMatch; live: WcLiveInfo }) {
  const odds = live.odds ?? wc.odds?.[match.id] ?? null;
  const race = useMemo(
    () =>
      crownOdds(wc, match.id, {
        odds,
        live: { home: live.home ?? 0, away: live.away ?? 0, minute: live.minute },
      }),
    [wc, match.id, odds, live.home, live.away, live.minute],
  );
  if (race.length === 0) return null;
  return (
    <div className="wc-crownrace">
      <span className="wc-crownrace-tag">🎯 Crown race</span>
      {race.slice(0, 3).map((c) => (
        <span key={c.predictorId} className="wc-crownrace-item">
          {c.name} <strong>{Math.round(c.p * 100)}%</strong>
        </span>
      ))}
    </div>
  );
}

/** Optional extras from the live feed: the pre-match odds line and the crowd. */
function MatchFacts({ live, hasResult }: { live?: WcLiveInfo; hasResult: boolean }) {
  if (!live) return null;
  const odds = live.odds;
  const showOdds = !hasResult && !!odds && (odds.overUnder != null || !!odds.details);
  const showAtt = live.attendance != null && live.attendance > 0;
  if (!showOdds && !showAtt) return null;
  const oddsText = [odds?.overUnder != null ? `O/U ${odds.overUnder}` : null, odds?.details ?? null]
    .filter(Boolean)
    .join(' · ');
  return (
    <p className="muted small wc-facts">
      {showOdds && <span title="Pre-match line (DraftKings via ESPN)">📊 {oddsText}</span>}
      {showAtt && <span title="Attendance">👥 {live.attendance!.toLocaleString()}</span>}
    </p>
  );
}

export function MatchCard({ matchId }: { matchId: string }) {
  const wc = useWorldCupStore((s) => s.state?.worldCup) ?? null;
  const meId = useWorldCupStore((s) => s.meId);
  const admin = useWorldCupStore((s) => s.admin);
  const live = useWorldCupStore((s) => s.live[matchId]);
  const liveFetchedAt = useWorldCupStore((s) => s.liveFetchedAt);
  const events = useWorldCupStore((s) => s.matchEvents[matchId]);
  const { predict, unpredict } = useWorldCupStore();
  const { show } = useToast();
  const now = useNow();
  const [view, setView] = useState<CardView>('match');

  if (!wc) return null;
  const match = wc.matches.find((m) => m.id === matchId);
  if (!match) return null;

  const home = findTeam(wc, match.homeId);
  const away = findTeam(wc, match.awayId);
  const ready = isMatchReady(match);
  const locked = isMatchLocked(match, new Date(now));
  const result = match.result;
  const isLive = !result && !!live && (live.status === 'IN_PLAY' || live.status === 'PAUSED');
  const upset =
    isLive && live ? upsetAlert(live.odds ?? wc.odds?.[match.id] ?? null, live, home, away) : null;
  // Who still hasn't predicted this open match (names only — not their picks).
  const stillToPick =
    !result && !locked && ready ? pendingPredictors(wc, matchId, new Date(now)) : [];
  const myPick = meId
    ? wc.predictions.find((p) => p.matchId === matchId && p.predictorId === meId)
    : undefined;

  const canPredict = ready && !locked && !!meId;

  async function adjust(side: 'home' | 'away', delta: number) {
    const h = (myPick?.home ?? 0) + (side === 'home' ? delta : 0);
    const a = (myPick?.away ?? 0) + (side === 'away' ? delta : 0);
    try {
      await predict(matchId, Math.max(0, h), Math.max(0, a));
      show('Pick saved ✓');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not save pick');
    }
  }

  async function clearPick() {
    try {
      await unpredict(matchId);
      show('Pick removed');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not remove pick');
    }
  }

  const stageTag =
    match.stage === 'group'
      ? `Group ${match.group} · MD${match.matchday}`
      : WC_STAGE_LABEL[match.stage];
  const isGroup = match.stage === 'group' && !!match.group;
  // Scenarios are about an upcoming/ongoing match's leaderboard impact.
  const showScenarios = ready && !result;

  return (
    <div className={`card wc-match ${result ? 'is-final' : ''}`}>
      <div className="wc-match-top">
        <span className="wc-stage-tag">{stageTag}</span>
        <span className="wc-meta">
          {formatKickoff(match.kickoff)}
          {match.venue ? ` · ${match.venue}` : ''}
        </span>
        {result ? (
          <span className="badge badge-success wc-ft">FT</span>
        ) : isLive ? (
          <span className="badge wc-ft wc-live">🔴 {liveLabel(live!)}</span>
        ) : locked ? (
          <span className="badge badge-warn wc-ft">🔒 Kicked off</span>
        ) : (
          <Countdown kickoff={match.kickoff} now={now} />
        )}
      </div>

      <CardViewTabs
        view={view}
        onChange={setView}
        showGroup={isGroup}
        showScenarios={showScenarios}
      />

      <div className="wc-fixture">
        <TeamSide wc={wc} team={home} placeholder={slotLabel(wc, match.homeId, match.homeSource)} />

        <div className="wc-centre">
          {result ? (
            <div className="wc-scoreline" aria-label="Final score">
              <span>{result.home}</span>
              <span className="wc-dash">–</span>
              <span>{result.away}</span>
            </div>
          ) : isLive && live!.home != null ? (
            <div className="wc-scoreline wc-live-score" aria-label="Live score">
              <span style={{ color: legibleScoreColor(live!.homeColor) }}>{live!.home}</span>
              <span className="wc-dash">–</span>
              <span style={{ color: legibleScoreColor(live!.awayColor) }}>{live!.away}</span>
            </div>
          ) : canPredict && view === 'match' ? (
            <div className="wc-pick-steppers">
              <ScoreStepper
                value={myPick?.home ?? 0}
                onChange={(n) => adjust('home', n - (myPick?.home ?? 0))}
                label={`${home?.name ?? 'Home'} goals`}
              />
              <span className="wc-dash">–</span>
              <ScoreStepper
                value={myPick?.away ?? 0}
                onChange={(n) => adjust('away', n - (myPick?.away ?? 0))}
                label={`${away?.name ?? 'Away'} goals`}
              />
            </div>
          ) : myPick && view === 'match' ? (
            <div className="wc-scoreline muted" aria-label="Your locked pick">
              <span>{myPick.home}</span>
              <span className="wc-dash">–</span>
              <span>{myPick.away}</span>
            </div>
          ) : (
            <span className="wc-vs">v</span>
          )}
        </div>

        <TeamSide
          wc={wc}
          team={away}
          placeholder={slotLabel(wc, match.awayId, match.awaySource)}
          align="right"
        />
      </div>

      {result?.advancesId && (
        <div className="wc-pens muted small">
          {findTeam(wc, result.advancesId)?.name} won on penalties
        </div>
      )}

      {view === 'match' && (
        <>
          {!result && myPick && (
            <div className="wc-clear-row">
              <span className="wc-saved">✓ Saved</span>
              {locked ? (
                <span className="muted small">🔒 Locked at kickoff</span>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost wc-clear-pick"
                  onClick={clearPick}
                >
                  ✕ Clear my pick
                </button>
              )}
            </div>
          )}
          {!result && canPredict && !myPick && (
            <p className="muted small wc-hint">Tap +/− to predict — it saves automatically.</p>
          )}
          {!result && !meId && ready && !locked && (
            <p className="muted small wc-hint">Pick your name above to predict this match.</p>
          )}
          {stillToPick.length > 0 && stillToPick.length < wc.predictors.length && (
            <p className="muted small wc-hint">
              ⏳ Still to pick: {stillToPick.map((p) => p.name).join(', ')}
            </p>
          )}

          {upset && <div className="wc-upset">😱 {upset}</div>}
          <CrowdPulse wc={wc} match={match} />
          <MatchEvents events={events} wc={wc} match={match} />
          <MatchFacts live={live} hasResult={!!result} />
          {isLive && live!.home != null && live!.away != null && (
            <p className="muted small wc-live-caption">
              {live!.clock || live!.minute != null
                ? `⚡ Live ${liveLabel(live!)} — points if it ends now`
                : `⚡ Live${liveFetchedAt ? ` · score as of ${fmtClock(liveFetchedAt)}` : ''} — points if it ends now`}
            </p>
          )}
          {isLive && live!.home != null && <SweatMeter wc={wc} match={match} live={live!} />}
          {isLive && live!.home != null && <CrownRace wc={wc} match={match} live={live!} />}
          <PredictionsRow
            wc={wc}
            match={match}
            meId={meId}
            revealed={locked}
            liveScore={
              isLive && live!.home != null && live!.away != null
                ? { home: live!.home, away: live!.away }
                : undefined
            }
          />
          <MatchReactions wc={wc} match={match} meId={meId} />
          <MatchComments matchId={match.id} />
          {admin && <ResultEditor wc={wc} match={match} />}
          {admin && <AdminFixPick wc={wc} match={match} />}
        </>
      )}

      {view === 'stats' && <StatsView wc={wc} match={match} />}
      {view === 'lineup' && <LineupView wc={wc} match={match} />}
      {view === 'scenarios' && showScenarios && (
        <ScenariosView wc={wc} match={match} live={live} meId={meId} />
      )}
      {view === 'group' && isGroup && <GroupView wc={wc} group={match.group!} match={match} />}
    </div>
  );
}

type CardView = 'match' | 'stats' | 'lineup' | 'scenarios' | 'group';

const CARD_VIEWS: { id: CardView; icon: string; label: string }[] = [
  { id: 'match', icon: '⚽', label: 'Match' },
  { id: 'stats', icon: '📊', label: 'Stats' },
  { id: 'lineup', icon: '👥', label: 'Lineups' },
  { id: 'scenarios', icon: '🔮', label: 'Scenarios' },
  { id: 'group', icon: '🔢', label: 'Group' },
];

/** The little tabs in the card's top-right that switch its lower panel. */
function CardViewTabs({
  view,
  onChange,
  showGroup,
  showScenarios,
}: {
  view: CardView;
  onChange: (v: CardView) => void;
  showGroup: boolean;
  showScenarios: boolean;
}) {
  const views = CARD_VIEWS.filter(
    (v) => (v.id !== 'group' || showGroup) && (v.id !== 'scenarios' || showScenarios),
  );
  return (
    <div className="wc-card-tabs" role="tablist" aria-label="Card view">
      {views.map((v) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          aria-selected={view === v.id}
          className={`wc-card-tab ${view === v.id ? 'active' : ''}`}
          onClick={() => onChange(v.id)}
          title={v.label}
          aria-label={v.label}
        >
          <span aria-hidden>{v.icon}</span>
        </button>
      ))}
    </div>
  );
}

function TeamSide({
  wc,
  team,
  placeholder,
  align,
}: {
  wc: WorldCupState;
  team: WcTeam | undefined;
  placeholder: string;
  align?: 'right';
}) {
  return (
    <div className={`wc-team ${align === 'right' ? 'wc-team-right' : ''}`}>
      <span className="wc-flag" aria-hidden>
        {team ? team.flag : '⚽'}
      </span>
      <span className="wc-team-info">
        <span className={`wc-team-name ${team ? '' : 'muted'}`}>
          {team ? team.name : placeholder}
        </span>
        {team && <TeamContext wc={wc} teamId={team.id} />}
      </span>
    </div>
  );
}

const ORDINALS = ['', '1st', '2nd', '3rd', '4th'];

/** Group position + recent W/D/L form for a team, from played results only.
 * Renders nothing until the team has actually played in the group. */
function TeamContext({ wc, teamId }: { wc: WorldCupState; teamId: string }) {
  const record = teamRecord(wc, teamId);
  if (!record || record.played === 0 || record.position == null) return null;
  return (
    <span className="wc-team-context">
      <span className="wc-team-pos" title={`Group ${record.group}`}>
        {ORDINALS[record.position] ?? `${record.position}th`}
      </span>
      <FormDots form={record.form} />
    </span>
  );
}

/** Coloured W/D/L pills for a team's recent results (most-recent-first). */
function FormDots({ form }: { form: Array<'W' | 'D' | 'L'> }) {
  if (form.length === 0) return <span className="muted small">—</span>;
  return (
    <span className="wc-form" aria-label={`Recent form ${form.join(' ')}`}>
      {form.slice(0, 5).map((r, i) => (
        <span key={i} className={`wc-form-dot wc-form-${r}`} aria-hidden>
          {r}
        </span>
      ))}
    </span>
  );
}

/** "Stats" view: the two teams' tournament form & record, side by side.
 * (Historical head-to-head is layered on in a later pass.) */
function StatsView({ wc, match }: { wc: WorldCupState; match: WcMatch }) {
  const home = findTeam(wc, match.homeId);
  const away = findTeam(wc, match.awayId);
  const h2h = useHeadToHead(home?.id, away?.id);
  if (!home || !away) {
    return <p className="muted small wc-tab-empty">Teams are decided once the bracket fills in.</p>;
  }
  const hr = teamRecord(wc, home.id);
  const ar = teamRecord(wc, away.id);
  const anyPlayed = (hr?.played ?? 0) + (ar?.played ?? 0) > 0;

  const pos = (r: typeof hr) => (r?.position ? (ORDINALS[r.position] ?? `${r.position}th`) : '—');
  const wdl = (r: typeof hr) => (r ? `${r.won}–${r.drawn}–${r.lost}` : '—');
  const goals = (r: typeof hr) => (r ? `${r.goalsFor}–${r.goalsAgainst}` : '—');
  const avg = (n: number | undefined, d: number | undefined) => (d ? (n! / d).toFixed(1) : '—');
  const rankOf = (t: WcTeam) => {
    const r = fifaRankOf(t.id);
    return r ? `#${r}` : '—';
  };
  // A free pre-game read derived from the FIFA ranking, so even a not-yet-played
  // team's card says something useful.
  const hRank = fifaRankOf(home.id);
  const aRank = fifaRankOf(away.id);
  const fav =
    hRank && aRank && hRank !== aRank
      ? { team: hRank < aRank ? home : away, gap: Math.abs(hRank - aRank) }
      : null;

  return (
    <div className="wc-statsview">
      <div className="wc-statsview-head">
        <span className="wc-flag" aria-hidden>
          {home.flag}
        </span>
        <span className="wc-statsview-title">Form &amp; record</span>
        <span className="wc-flag" aria-hidden>
          {away.flag}
        </span>
      </div>
      {fav && (
        <div className="wc-fav">
          📈 <strong>{fav.team.name}</strong> favoured — {fav.gap} place{fav.gap === 1 ? '' : 's'}{' '}
          higher in the world ranking
        </div>
      )}
      <ClimateView match={match} home={home} away={away} />
      <table className="wc-cmp-table">
        <tbody>
          <CmpRow label="FIFA ranking" h={rankOf(home)} a={rankOf(away)} />
          {anyPlayed && (
            <>
              <CmpRow
                label={`Group ${hr?.group ?? away?.group ?? ''} position`}
                h={pos(hr)}
                a={pos(ar)}
              />
              <CmpRow label="Played" h={`${hr?.played ?? 0}`} a={`${ar?.played ?? 0}`} />
              <CmpRow label="W–D–L" h={wdl(hr)} a={wdl(ar)} />
              <CmpRow label="Goals (F–A)" h={goals(hr)} a={goals(ar)} />
              <CmpRow
                label="Avg scored"
                h={avg(hr?.goalsFor, hr?.played)}
                a={avg(ar?.goalsFor, ar?.played)}
              />
              <CmpRow
                label="Avg conceded"
                h={avg(hr?.goalsAgainst, hr?.played)}
                a={avg(ar?.goalsAgainst, ar?.played)}
              />
              <CmpRow
                label="Clean sheets"
                h={`${hr?.cleanSheets ?? 0}`}
                a={`${ar?.cleanSheets ?? 0}`}
              />
              <CmpRow label="Points" h={`${hr?.points ?? 0}`} a={`${ar?.points ?? 0}`} strong />
              <tr>
                <td className="wc-cmp-h">
                  <FormDots form={hr?.form ?? []} />
                </td>
                <th scope="row" className="wc-cmp-label">
                  Form
                </th>
                <td className="wc-cmp-a">
                  <FormDots form={ar?.form ?? []} />
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      {!anyPlayed && (
        <p className="muted small wc-tab-empty">
          Form &amp; match stats appear once the group is underway.
        </p>
      )}
      <H2HView state={h2h} home={home} away={away} />
    </div>
  );
}

/** Historical head-to-head between the two teams (from the results feed). */
function H2HView({ state, home, away }: { state: H2HState; home: WcTeam; away: WcTeam }) {
  if (state.loading) {
    return <p className="muted small wc-h2h-note">Loading head-to-head…</p>;
  }
  const h2h = state.h2h;
  if (!h2h || h2h.numberOfMatches === 0) {
    return <p className="muted small wc-h2h-note">No recorded head-to-head meetings.</p>;
  }
  const homeRec = h2h.records[home.id] ?? { wins: 0, draws: 0, losses: 0 };
  const homeWins = homeRec.wins;
  const draws = homeRec.draws;
  const awayWins = h2h.records[away.id]?.wins ?? homeRec.losses;
  return (
    <div className="wc-h2h">
      <div className="wc-h2h-head">
        ⚔️ Head-to-head · {h2h.numberOfMatches} meeting{h2h.numberOfMatches === 1 ? '' : 's'}
      </div>
      <div className="wc-h2h-tally">
        <span className="wc-h2h-side">
          <strong>{homeWins}</strong> <span aria-hidden>{home.flag}</span>
        </span>
        <span className="muted small">
          {draws} draw{draws === 1 ? '' : 's'}
        </span>
        <span className="wc-h2h-side">
          <span aria-hidden>{away.flag}</span> <strong>{awayWins}</strong>
        </span>
      </div>
      {h2h.recent.length > 0 && (
        <ul className="wc-h2h-list">
          {h2h.recent.map((m, i) => (
            <li key={i}>
              <span className="muted">{m.date ? m.date.slice(0, 4) : ''}</span> {m.homeTla}{' '}
              <strong>
                {m.homeScore ?? '–'}–{m.awayScore ?? '–'}
              </strong>{' '}
              {m.awayTla}
              {m.competition ? <span className="muted"> · {m.competition}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Altitude & climate read for a fixture — who's built for the venue's altitude
 * and heat. All static data, so it's shown pre-game (no kickoff needed). */
function ClimateView({ match, home, away }: { match: WcMatch; home: WcTeam; away: WcTeam }) {
  const hc = teamClimate(home.id);
  const ac = teamClimate(away.id);
  if (!hc || !ac) return null;
  const venue = venueClimate(match.venue);
  const edge = climateEdge(hc, ac, venue);
  const m = (n: number) => `${n.toLocaleString()} m`;
  return (
    <div className="wc-climate">
      <div className="wc-climate-head">🏔️ Altitude &amp; climate</div>
      {venue && (
        <div className="wc-climate-venue">
          📍 {match.venue} · {m(venue.altitude)} · ~{venue.tempC}°C on match day
        </div>
      )}
      <table className="wc-cmp-table">
        <tbody>
          <CmpRow
            label="Home altitude"
            h={`${m(hc.altitude)}${hc.altitude > ac.altitude ? ' ⬆️' : ''}`}
            a={`${m(ac.altitude)}${ac.altitude > hc.altitude ? ' ⬆️' : ''}`}
          />
          <CmpRow
            label="Home climate"
            h={`${hc.tempC}°C${hc.tempC > ac.tempC ? ' ⬆️' : ''}`}
            a={`${ac.tempC}°C${ac.tempC > hc.tempC ? ' ⬆️' : ''}`}
          />
        </tbody>
      </table>
      {edge.altitude || edge.heat ? (
        <div className="wc-climate-edge">
          {edge.altitude && (
            <div>
              🏔️ <strong>{(edge.altitude === 'home' ? home : away).name}</strong> is built for the
              altitude here.
            </div>
          )}
          {edge.heat && (
            <div>
              🔥 <strong>{(edge.heat === 'home' ? home : away).name}</strong> is more used to this
              heat.
            </div>
          )}
        </div>
      ) : (
        <div className="muted small wc-climate-note">
          {venue
            ? 'Mild conditions here — altitude and heat shouldn’t be decisive.'
            : 'Venue conditions to be confirmed.'}
        </div>
      )}
    </div>
  );
}

function CmpRow({
  label,
  h,
  a,
  strong,
}: {
  label: string;
  h: string;
  a: string;
  strong?: boolean;
}) {
  return (
    <tr className={strong ? 'wc-cmp-strong' : ''}>
      <td className="wc-cmp-h">{h}</td>
      <th scope="row" className="wc-cmp-label">
        {label}
      </th>
      <td className="wc-cmp-a">{a}</td>
    </tr>
  );
}

const POS_LABEL = (n: number): string => ORDINALS[n] ?? `${n}th`;

/** What each team's remaining games could still produce. */
function outlookLabel(o: WcGroupOutlookRow): { icon: string; text: string; cls: string } {
  if (o.guaranteedTop2) return { icon: '✅', text: 'Through', cls: 'wc-ol-through' };
  if (o.bestPosition >= 4) return { icon: '❌', text: 'Eliminated', cls: 'wc-ol-out' };
  if (!o.canFinishTop2) return { icon: '🟡', text: '3rd-place hopeful', cls: 'wc-ol-maybe' };
  return { icon: '🎯', text: 'In the hunt', cls: 'wc-ol-live' };
}

/** "Group" view: the live standings for this match's group (top 2 highlighted,
 * the two teams playing here emphasised), plus the permutations of what the
 * remaining games can still produce. */
function GroupView({ wc, group, match }: { wc: WorldCupState; group: string; match: WcMatch }) {
  const rows = groupStandings(wc, group);
  const here = new Set([match.homeId, match.awayId].filter(Boolean));
  const outlook = groupOutlook(wc, group);
  const started = rows.some((r) => r.played > 0);
  const decided = outlook.length > 0 && outlook.every((o) => o.decided);
  return (
    <div className="wc-groupview">
      <div className="wc-statsview-head">
        <span className="wc-statsview-title">Group {group}</span>
      </div>
      <table className="wc-mini-table">
        <thead>
          <tr>
            <th aria-label="Position">#</th>
            <th className="wc-mini-team">Team</th>
            <th>P</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>GD</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const t = findTeam(wc, r.teamId);
            return (
              <tr
                key={r.teamId}
                className={`${i < 2 ? 'wc-qual' : ''} ${here.has(r.teamId) ? 'wc-here' : ''}`}
              >
                <td>{i + 1}</td>
                <td className="wc-mini-team">
                  <span aria-hidden>{t?.flag}</span> {t?.name ?? r.teamId}
                </td>
                <td>{r.played}</td>
                <td>{r.won}</td>
                <td>{r.drawn}</td>
                <td>{r.lost}</td>
                <td>
                  {r.goalDiff > 0 ? '+' : ''}
                  {r.goalDiff}
                </td>
                <td className="wc-mini-pts">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {started && !decided ? (
        <div className="wc-outlook">
          <div className="wc-outlook-title">🔮 What can still happen</div>
          {rows.map((r) => {
            const o = outlook.find((x) => x.teamId === r.teamId);
            if (!o) return null;
            const t = findTeam(wc, r.teamId);
            const lab = outlookLabel(o);
            const range =
              o.bestPosition === o.worstPosition
                ? POS_LABEL(o.bestPosition)
                : `${POS_LABEL(o.bestPosition)}–${POS_LABEL(o.worstPosition)}`;
            return (
              <div key={r.teamId} className="wc-outlook-row">
                <span className="wc-outlook-team">
                  <span aria-hidden>{t?.flag}</span> {t?.name ?? r.teamId}
                </span>
                <span className={`wc-outlook-tag ${lab.cls}`}>
                  {lab.icon} {lab.text}
                </span>
                <span className="muted small wc-outlook-range">can finish {range}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted small">Top 2 advance; the best third-placed teams also go through.</p>
      )}
    </div>
  );
}

/** A little "crowd" read-out: how many are in before kickoff (a count only, no
 * picks revealed), and the most-popular scoreline once a result is in. */
function CrowdPulse({ wc, match }: { wc: WorldCupState; match: WcMatch }) {
  const count = predictionCount(wc, match.id);
  if (count === 0) return null;

  if (match.result) {
    const consensus = consensusScore(wc, match.id);
    if (!consensus) return null;
    return (
      <div className="wc-pulse">
        <span className="wc-pulse-tag">Crowd pick</span>
        <span className="wc-pulse-score">
          {consensus.home}–{consensus.away}
        </span>
        <span className="muted small">
          {consensus.count} of {count}
        </span>
      </div>
    );
  }

  const total = wc.predictors.length;
  return (
    <div className="wc-pulse">
      <span className="wc-pulse-tag">🔮 Crowd</span>
      <span className="wc-pulse-meter" aria-hidden>
        {'●'.repeat(count)}
        {'○'.repeat(Math.max(0, total - count))}
      </span>
      <span className="muted small">
        {count} of {total} predicted
      </span>
    </div>
  );
}

/** Quick, prediction-free emoji reactions on a match (🔥😱🎉💩). */
function MatchReactions({
  wc,
  match,
  meId,
}: {
  wc: WorldCupState;
  match: WcMatch;
  meId: string | null;
}) {
  const { reactMatch } = useWorldCupStore();
  const { show } = useToast();
  const tally = wc.matchReactions?.[match.id] ?? {};

  async function react(emoji: string) {
    if (!meId) {
      show('Pick your name above to react');
      return;
    }
    try {
      await reactMatch(match.id, emoji);
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not react');
    }
  }

  return (
    <div className="wc-reactions">
      {WC_REACTIONS.map((emoji) => {
        const who = tally[emoji] ?? [];
        const mine = !!meId && who.includes(meId);
        return (
          <button
            key={emoji}
            type="button"
            className={`wc-reaction ${mine ? 'mine' : ''}`}
            onClick={() => void react(emoji)}
            aria-pressed={mine}
            aria-label={`React ${emoji}`}
          >
            <span aria-hidden>{emoji}</span>
            {who.length > 0 && <span className="wc-reaction-count">{who.length}</span>}
          </button>
        );
      })}
    </div>
  );
}

function PredictionsRow({
  wc,
  match,
  meId,
  revealed,
  liveScore,
}: {
  wc: WorldCupState;
  match: WcMatch;
  meId: string | null;
  /** Whether everyone's picks are shown (true once the match has kicked off). */
  revealed: boolean;
  /** Current in-play score, for provisional "if it ends now" points + crown. */
  liveScore?: { home: number; away: number };
}) {
  const picks = wc.predictions.filter((p) => p.matchId === match.id);
  if (picks.length === 0) return null;
  // Stable order: by predictor list order.
  const order = new Map(wc.predictors.map((p, i) => [p.id, i]));
  picks.sort((a, b) => (order.get(a.predictorId) ?? 99) - (order.get(b.predictorId) ?? 99));

  // Until kickoff, hide everyone else's picks (no copying) — only your own shows.
  const shown = revealed ? picks : picks.filter((p) => p.predictorId === meId);
  const hidden = picks.length - shown.length;
  // Closest pick(s) get a 🎯 crown once resolved — or provisionally while live.
  const crowned = match.result
    ? new Set(closestPredictors(wc, match.id))
    : liveScore
      ? new Set(closestToScore(wc, match.id, liveScore.home, liveScore.away))
      : null;

  return (
    <div className="wc-picks">
      {shown.map((p) => (
        <PickChip
          key={p.predictorId}
          wc={wc}
          match={match}
          pick={p}
          meId={meId}
          crowned={crowned?.has(p.predictorId) ?? false}
          liveScore={liveScore}
          // You can react to a revealed pick that isn't your own.
          canReact={revealed && !!meId && p.predictorId !== meId}
        />
      ))}
      {hidden > 0 && (
        <span className="wc-pick-chip wc-pick-hidden" title="Everyone’s picks reveal at kickoff">
          🔒 {hidden} more · hidden until kickoff
        </span>
      )}
    </div>
  );
}

/** One predictor's pick chip, with its points/crown and (once revealed) the
 * ability to react to a mate's pick. */
function PickChip({
  wc,
  match,
  pick,
  meId,
  crowned,
  canReact,
  liveScore,
}: {
  wc: WorldCupState;
  match: WcMatch;
  pick: WorldCupState['predictions'][number];
  meId: string | null;
  crowned: boolean;
  canReact: boolean;
  liveScore?: { home: number; away: number };
}) {
  const { reactPick } = useWorldCupStore();
  const [picker, setPicker] = useState(false);
  const predictor = wc.predictors.find((x) => x.id === pick.predictorId) ?? null;
  const name = predictor?.name ?? '?';
  // Provisional points while a game is in play; real points once it's finished.
  const provisional = !match.result && !!liveScore;
  const scored = match.result
    ? scorePrediction(pick, match.result)
    : liveScore
      ? scorePrediction(pick, liveScore)
      : null;
  const reactions = Object.entries(pick.reactions ?? {});

  return (
    <span className="wc-pick">
      <span
        className={`wc-pick-chip ${scored && !provisional ? POINT_CLASS[scored.category] : ''} ${
          provisional ? 'is-provisional' : ''
        } ${pick.predictorId === meId ? 'is-me' : ''}`}
        title={
          provisional
            ? `If it ends now: ${scored ? WC_SCORE_LABEL[scored.category] : 'no points'}`
            : scored
              ? WC_SCORE_LABEL[scored.category]
              : 'Prediction'
        }
      >
        <Avatar predictor={predictor} size={22} />
        {crowned && (
          <span
            className="wc-pick-crown"
            title={provisional ? 'Closest right now' : 'Closest pick'}
            aria-label={provisional ? 'Closest right now' : 'Closest pick'}
          >
            🎯
          </span>
        )}
        <span className="wc-pick-name">{name}</span>
        <span className="wc-pick-score">
          {pick.home}–{pick.away}
        </span>
        {scored && (scored.points > 0 || !provisional) && (
          <span className="wc-pick-pts">+{scored.points}</span>
        )}
      </span>

      {(reactions.length > 0 || canReact) && (
        <span className="wc-pick-reactions">
          {reactions.map(([emoji, who]) => (
            <button
              key={emoji}
              type="button"
              className={`reaction-chip ${meId && who.includes(meId) ? 'mine' : ''}`}
              onClick={() => {
                if (canReact) void reactPick(match.id, pick.predictorId, emoji);
              }}
              disabled={!canReact}
              title={`React ${emoji}`}
            >
              {emoji} {who.length}
            </button>
          ))}
          {canReact && (
            <span className="reaction-add-wrap">
              <button
                type="button"
                className="reaction-add"
                aria-expanded={picker}
                aria-label={`React to ${name}'s pick`}
                onClick={() => setPicker((v) => !v)}
              >
                ＋
              </button>
              {picker && (
                <span className="reaction-picker">
                  {WC_REACTIONS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="reaction-option"
                      onClick={() => {
                        void reactPick(match.id, pick.predictorId, e);
                        setPicker(false);
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </span>
              )}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function ResultEditor({ wc, match }: { wc: WorldCupState; match: WcMatch }) {
  const { enterResult, clearMatchResult } = useWorldCupStore();
  const { show } = useToast();
  const [home, setHome] = useState(match.result?.home ?? 0);
  const [away, setAway] = useState(match.result?.away ?? 0);
  const [advancesId, setAdvancesId] = useState(match.result?.advancesId ?? '');

  const ready = isMatchReady(match);
  const isKnockout = match.stage !== 'group';
  const needsAdvance = isKnockout && home === away;

  async function save() {
    try {
      await enterResult(match.id, home, away, needsAdvance ? advancesId : undefined);
      show('Result saved ⚽');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not save result');
    }
  }

  if (!ready) {
    return (
      <div className="wc-result-editor muted small">
        Result entry unlocks once both teams are known.
      </div>
    );
  }

  return (
    <div className="wc-result-editor">
      <span className="wc-result-label">Enter result</span>
      <div className="wc-result-controls">
        <ScoreStepper value={home} onChange={setHome} label="Home result goals" />
        <span className="wc-dash">–</span>
        <ScoreStepper value={away} onChange={setAway} label="Away result goals" />
        {needsAdvance && (
          <select
            className="select wc-advance"
            value={advancesId}
            onChange={(e) => setAdvancesId(e.target.value)}
            aria-label="Who advanced on penalties"
          >
            <option value="">Advances…</option>
            <option value={match.homeId}>{findTeam(wc, match.homeId)?.name} (pens)</option>
            <option value={match.awayId}>{findTeam(wc, match.awayId)?.name} (pens)</option>
          </select>
        )}
        <button className="btn btn-sm btn-primary" onClick={save}>
          Save
        </button>
        {match.result && (
          <button className="btn btn-sm btn-danger" onClick={() => clearMatchResult(match.id)}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

/** Organiser-only: set or restore any predictor's pick, even after kickoff —
 * for fixing one lost to a glitch (normal clears are blocked at kickoff). */
function AdminFixPick({ wc, match }: { wc: WorldCupState; match: WcMatch }) {
  const { adminSetPrediction } = useWorldCupStore();
  const { show } = useToast();
  const [pid, setPid] = useState('');
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);

  async function save() {
    if (!pid) return;
    try {
      await adminSetPrediction(match.id, pid, home, away);
      show('Pick restored ✓');
      setPid('');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not set pick');
    }
  }

  return (
    <div className="wc-result-editor">
      <span className="wc-result-label">Fix a pick (organiser)</span>
      <div className="wc-result-controls">
        <select
          className="select wc-advance"
          value={pid}
          onChange={(e) => setPid(e.target.value)}
          aria-label="Predictor whose pick to fix"
        >
          <option value="">Whose pick…</option>
          {wc.predictors.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <ScoreStepper value={home} onChange={setHome} label="Fix home goals" />
        <span className="wc-dash">–</span>
        <ScoreStepper value={away} onChange={setAway} label="Fix away goals" />
        <button className="btn btn-sm btn-primary" onClick={save} disabled={!pid}>
          Set pick
        </button>
      </div>
    </div>
  );
}
