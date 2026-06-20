/**
 * The immersive Live Match Room — a full-bleed overlay that turns watching one
 * match into an event: a giant scoreboard, who's watching now, the live win
 * probability / sweat-o-meter / crown race, floating reactions + banter in one
 * place, and the standings bumping live as goals go in. Reuses the existing live
 * components and the frozen ranking helpers — pure presentation, scoring
 * untouched. Pre-match / in-play / full-time states are derived exactly as the
 * fixture card does.
 */
import { findTeam, isMatchReady, type WcMatch, type WcTeam, type WorldCupState } from '@dap/shared';
import type { CSSProperties } from 'react';
import { Modal } from '../../components/Modal.js';
import { useWorldCupStore, type WcLiveInfo } from '../../state/worldCupStore.js';
import { CinemaSeats } from './CinemaSeats.js';
import { CommentaryFeed } from './CommentaryFeed.js';
import { GoalOverlay } from './GoalOverlay.js';
import { LiveBoard } from './LiveBoard.js';
import { useLiveLeaderboard } from './liveStandings.js';
import { CrownRace, GroupView, StatsView, SweatMeter } from './MatchCard.js';
import { MatchComments } from './MatchComments.js';
import { PreMatchHype } from './PreMatchHype.js';
import { StageReactions } from './StageReactions.js';
import { StakesBanner } from './StakesBanner.js';
import { useCommentBubbles } from './useCommentBubbles.js';
import { useMatchRoom } from './useMatchRoom.js';
import { useNow } from './useNow.js';
import { useWatchers } from './useWatchers.js';
import { legibleScoreColor } from './wcFormat.js';

/** Short status line for an in-play game. */
function liveStatus(live: WcLiveInfo): string {
  if (live.status === 'PAUSED') return `🔴 ${live.detail || 'Half time'}`;
  if (live.clock) return `🔴 ${live.clock}`;
  if (live.minute != null) return `🔴 ${live.minute}'`;
  return '🔴 Live';
}

function Side({ team, align }: { team?: WcTeam; align: 'left' | 'right' }) {
  return (
    <div className={`wc-room-side wc-room-side-${align}`}>
      <span className="wc-room-flag" aria-hidden>
        {team?.flag ?? '⚽'}
      </span>
      <span className="wc-room-team">{team?.name ?? 'TBD'}</span>
    </div>
  );
}

export function MatchRoom() {
  const openId = useMatchRoom((s) => s.openId);
  const close = useMatchRoom((s) => s.close);
  const wc = useWorldCupStore((s) => s.state?.worldCup) ?? null;
  const match = wc && openId ? (wc.matches.find((m) => m.id === openId) ?? null) : null;
  // Mount the per-second / presence hooks only while the Room is actually open.
  if (!wc || !match) return null;
  return <RoomInner wc={wc} match={match} onClose={close} />;
}

function RoomInner({
  wc,
  match,
  onClose,
}: {
  wc: WorldCupState;
  match: WcMatch;
  onClose: () => void;
}) {
  const meId = useWorldCupStore((s) => s.meId);
  const live = useWorldCupStore((s) => s.live[match.id]);
  const now = useNow();

  const home = findTeam(wc, match.homeId);
  const away = findTeam(wc, match.awayId);
  const result = match.result;
  const isLive = !result && !!live && (live.status === 'IN_PLAY' || live.status === 'PAUSED');
  const ready = isMatchReady(match);
  // Tint the room with the home team's brand colour when the feed carries it.
  const accent = live?.homeColor ? legibleScoreColor(live.homeColor) : null;
  // Who currently leads our sweepstake — spotlit on the screen, swinging live.
  const standings = useLiveLeaderboard(wc);
  const leader = standings[0] && standings[0].points > 0 ? standings[0] : null;

  const mePredictor = meId ? (wc.predictors.find((p) => p.id === meId) ?? null) : null;
  const watchers = useWatchers(
    match.id,
    mePredictor ? { id: mePredictor.id, name: mePredictor.name } : null,
  );
  const bubbles = useCommentBubbles(match.id);

  const title = (
    <span className="wc-room-title-text">
      <span aria-hidden>{home?.flag ?? '⚽'}</span> {home?.name ?? 'TBD'}{' '}
      <span className="muted">v</span> {away?.name ?? 'TBD'}{' '}
      <span aria-hidden>{away?.flag ?? '⚽'}</span>
    </span>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      className="wc-room-panel"
      labelledBy="wc-room-title"
    >
      <div className="wc-room" style={accent ? ({ ['--c']: accent } as CSSProperties) : undefined}>
        {isLive && <GoalOverlay wc={wc} match={match} meId={meId} />}
        <div className="wc-stage">
          {leader && (
            <div className="wc-stage-leader" aria-live="polite">
              👑 {leader.name} leads
            </div>
          )}
          <div className="wc-room-scoreboard">
            <Side team={home} align="left" />
            <div className="wc-room-centre">
              <div className="wc-room-score">
                {result ? (
                  <span>
                    {result.home}
                    <i className="wc-room-dash">–</i>
                    {result.away}
                  </span>
                ) : isLive && live!.home != null ? (
                  <span className="is-live">
                    <span style={{ color: legibleScoreColor(live!.homeColor) }}>{live!.home}</span>
                    <i className="wc-room-dash">–</i>
                    <span style={{ color: legibleScoreColor(live!.awayColor) }}>{live!.away}</span>
                  </span>
                ) : (
                  <span className="wc-room-vs">v</span>
                )}
              </div>
              <div className={`wc-room-status ${isLive ? 'is-live' : ''}`}>
                {result ? 'Full time' : isLive ? liveStatus(live!) : '⏳ Build-up'}
              </div>
            </div>
            <Side team={away} align="right" />
          </div>
          {isLive && <StageReactions matchId={match.id} />}
        </div>

        <CinemaSeats
          wc={wc}
          me={mePredictor ? { id: mePredictor.id, name: mePredictor.name } : null}
          watchers={watchers}
          bubbles={bubbles}
        />

        {!result && <StakesBanner wc={wc} meId={meId} match={match} />}

        {!result && !isLive && ready && <PreMatchHype wc={wc} match={match} now={now} />}

        {isLive && (
          <div className="wc-room-live">
            <SweatMeter wc={wc} match={match} live={live!} />
            <CrownRace wc={wc} match={match} live={live!} meId={meId} />
          </div>
        )}

        {(isLive || result) && (
          <section className="wc-room-section" aria-label="Live commentary">
            <h3 className="wc-room-h">📣 Commentary</h3>
            <CommentaryFeed wc={wc} match={match} />
          </section>
        )}

        {ready && (
          <section className="wc-room-section" aria-label="Match stats">
            <h3 className="wc-room-h">📊 Stats</h3>
            <StatsView wc={wc} match={match} live={live} />
          </section>
        )}

        {match.stage === 'group' && match.group && (
          <section className="wc-room-section" aria-label="Group picture">
            <h3 className="wc-room-h">🔢 What it means for the group</h3>
            <GroupView wc={wc} group={match.group} match={match} />
          </section>
        )}

        <section className="wc-room-section" aria-label="Live standings">
          <h3 className="wc-room-h">🏆 Standings — as it stands</h3>
          <LiveBoard wc={wc} meId={meId} />
        </section>

        <section className="wc-room-section" aria-label="Match chat">
          <MatchComments matchId={match.id} phase={result ? 'ft' : isLive ? 'live' : 'pre'} />
        </section>
      </div>
    </Modal>
  );
}
