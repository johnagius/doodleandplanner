/**
 * The dedicated Cinema tab — a watch-together amphitheatre. The screen is the
 * show: a live feed of everything (commentary + chat) auto-scrolling to the
 * newest, with the screen flippable to Stats / Group / Table "channels". The
 * tiered seats face it. Reachable from the nav and from each fixture's "Watch
 * together" button. Pure presentation; scoring untouched.
 */
import {
  defaultDay,
  findTeam,
  isMatchReady,
  matchesOn,
  type WcMatch,
  type WorldCupState,
} from '@dap/shared';
import { useMemo, useState, type CSSProperties } from 'react';
import { EmptyState } from '../../components/EmptyState.js';
import { useToast } from '../../components/Toast.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { CinemaFeed } from './CinemaFeed.js';
import { CinemaSeats } from './CinemaSeats.js';
import { Countdown } from './Countdown.js';
import { GoalOverlay } from './GoalOverlay.js';
import { LiveBoard } from './LiveBoard.js';
import { useLiveLeaderboard } from './liveStandings.js';
import { GroupView, StatsView } from './MatchCard.js';
import { PreMatchHype } from './PreMatchHype.js';
import { StageReactions } from './StageReactions.js';
import { StakesBanner } from './StakesBanner.js';
import { useCommentBubbles } from './useCommentBubbles.js';
import { useMatchRoom } from './useMatchRoom.js';
import { useNow } from './useNow.js';
import { useWatchers } from './useWatchers.js';
import { legibleScoreColor } from './wcFormat.js';

type Channel = 'feed' | 'stats' | 'group' | 'table';

function isInPlay(s: string | undefined): boolean {
  return s === 'IN_PLAY' || s === 'PAUSED';
}

export function CinemaView({ wc }: { wc: WorldCupState }) {
  const liveMap = useWorldCupStore((s) => s.live);
  const selectedId = useMatchRoom((s) => s.openId);
  const select = useMatchRoom((s) => s.open);

  // Matches worth watching now: anything in-play, then today's fixtures.
  const pickable = useMemo(() => {
    const liveOnes = wc.matches.filter((m) => !m.result && isInPlay(liveMap[m.id]?.status));
    const today = matchesOn(wc, defaultDay(wc, new Date()));
    const seen = new Set<string>();
    const out: WcMatch[] = [];
    for (const m of [...liveOnes, ...today]) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        out.push(m);
      }
    }
    return out.slice(0, 12);
  }, [wc, liveMap]);

  const match =
    (selectedId && wc.matches.find((m) => m.id === selectedId)) ??
    wc.matches.find((m) => !m.result && isInPlay(liveMap[m.id]?.status)) ??
    pickable[0] ??
    null;

  if (!match) {
    return (
      <EmptyState
        icon="🎬"
        title="No match to watch yet"
        hint="When a game is on — or coming up today — pull up a seat here to watch it together."
      />
    );
  }

  return (
    <div className="stack">
      {pickable.length > 1 && (
        <div className="wc-cinema-picker" role="group" aria-label="Choose a match to watch">
          {pickable.map((m) => {
            const h = findTeam(wc, m.homeId);
            const a = findTeam(wc, m.awayId);
            const on = isInPlay(liveMap[m.id]?.status) && !m.result;
            return (
              <button
                key={m.id}
                type="button"
                className={`wc-cinema-chip ${m.id === match.id ? 'is-active' : ''}`}
                onClick={() => select(m.id)}
              >
                {on && <span className="wc-cinema-chip-live" aria-label="live" />}
                <span aria-hidden>{h?.flag ?? '⚽'}</span> {h?.id ?? '?'}–{a?.id ?? '?'}{' '}
                <span aria-hidden>{a?.flag ?? '⚽'}</span>
              </button>
            );
          })}
        </div>
      )}
      <CinemaStage wc={wc} match={match} />
    </div>
  );
}

function CinemaStage({ wc, match }: { wc: WorldCupState; match: WcMatch }) {
  const meId = useWorldCupStore((s) => s.meId);
  const live = useWorldCupStore((s) => s.live[match.id]);
  const { postComment } = useWorldCupStore();
  const { show } = useToast();
  const now = useNow();
  const [channel, setChannel] = useState<Channel>('feed');
  const [draft, setDraft] = useState('');

  const home = findTeam(wc, match.homeId);
  const away = findTeam(wc, match.awayId);
  const result = match.result;
  const isLive = !result && !!live && isInPlay(live.status);
  const ready = isMatchReady(match);
  const isGroup = match.stage === 'group' && !!match.group;
  const accent = live?.homeColor ? legibleScoreColor(live.homeColor) : null;

  const standings = useLiveLeaderboard(wc);
  const leader = standings[0] && standings[0].points > 0 ? standings[0] : null;
  const mePredictor = meId ? (wc.predictors.find((p) => p.id === meId) ?? null) : null;
  const watchers = useWatchers(
    match.id,
    mePredictor ? { id: mePredictor.id, name: mePredictor.name } : null,
  );
  const bubbles = useCommentBubbles(match.id);

  const channels: { id: Channel; label: string; show: boolean }[] = [
    { id: 'feed', label: '📣 Feed', show: true },
    { id: 'stats', label: '📊 Stats', show: ready },
    { id: 'group', label: '🔢 Group', show: isGroup },
    { id: 'table', label: '🏆 Table', show: true },
  ];
  const active = channels.find((c) => c.id === channel)?.show ? channel : 'feed';

  async function sendComment(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      await postComment(match.id, text);
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not post');
    }
  }

  return (
    <div className="wc-cinema" style={accent ? ({ ['--c']: accent } as CSSProperties) : undefined}>
      <div className="wc-screen-wrap">
        <div className="wc-screen">
          {isLive && <GoalOverlay wc={wc} match={match} meId={meId} />}
          {isLive && <StageReactions matchId={match.id} />}
          {leader && (
            <div className="wc-stage-leader" aria-live="polite">
              👑 {leader.name} leads
            </div>
          )}

          <div className="wc-screen-head">
            <span className="wc-screen-side">
              <span className="wc-screen-flag" aria-hidden>
                {home?.flag ?? '⚽'}
              </span>
              {home?.name ?? 'TBD'}
            </span>
            <span className="wc-screen-score">
              {result ? (
                <>
                  {result.home}
                  <i>–</i>
                  {result.away}
                </>
              ) : isLive && live!.home != null ? (
                <>
                  <span style={{ color: legibleScoreColor(live!.homeColor) }}>{live!.home}</span>
                  <i>–</i>
                  <span style={{ color: legibleScoreColor(live!.awayColor) }}>{live!.away}</span>
                </>
              ) : (
                <span className="wc-screen-vs">v</span>
              )}
              <span className="wc-screen-clock">
                {result ? 'FT' : isLive ? (live!.clock ?? `${live!.minute ?? 0}'`) : null}
                {!result && !isLive && <Countdown kickoff={match.kickoff} now={now} />}
              </span>
            </span>
            <span className="wc-screen-side wc-screen-side-right">
              <span className="wc-screen-flag" aria-hidden>
                {away?.flag ?? '⚽'}
              </span>
              {away?.name ?? 'TBD'}
            </span>
          </div>

          <div className="wc-screen-channels" role="tablist" aria-label="Screen channels">
            {channels
              .filter((c) => c.show)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={active === c.id}
                  className={`wc-screen-chan ${active === c.id ? 'is-active' : ''}`}
                  onClick={() => setChannel(c.id)}
                >
                  {c.label}
                </button>
              ))}
          </div>

          <div className="wc-screen-body">
            {active === 'feed' ? (
              <CinemaFeed wc={wc} match={match} />
            ) : (
              <div className="wc-screen-panel">
                {active === 'stats' && <StatsView wc={wc} match={match} live={live} />}
                {active === 'group' && isGroup && (
                  <GroupView wc={wc} group={match.group!} match={match} />
                )}
                {active === 'table' && <LiveBoard wc={wc} meId={meId} />}
              </div>
            )}
          </div>
        </div>
      </div>

      {!result && <StakesBanner wc={wc} meId={meId} match={match} />}
      {!result && !isLive && ready && <PreMatchHype wc={wc} match={match} now={now} />}

      <CinemaSeats
        wc={wc}
        me={mePredictor ? { id: mePredictor.id, name: mePredictor.name } : null}
        watchers={watchers}
        bubbles={bubbles}
      />

      <form className="wc-cinema-composer" onSubmit={sendComment}>
        <input
          className="input"
          placeholder={meId ? 'Say something to the room…' : 'Pick your name above to chat'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!meId}
          aria-label="Message the room"
        />
        <button className="btn btn-primary btn-sm" type="submit" disabled={!meId || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
