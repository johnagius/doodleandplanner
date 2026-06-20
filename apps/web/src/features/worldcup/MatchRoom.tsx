/**
 * The immersive Live Match Room — a full-bleed overlay that turns watching one
 * match into an event: a giant scoreboard, who's watching now, the live win
 * probability / sweat-o-meter / crown race, floating reactions + banter in one
 * place, and the standings bumping live as goals go in. Reuses the existing live
 * components and the frozen ranking helpers — pure presentation, scoring
 * untouched. Pre-match / in-play / full-time states are derived exactly as the
 * fixture card does.
 */
import {
  findTeam,
  isMatchReady,
  predictionCount,
  type WcMatch,
  type WcTeam,
  type WorldCupState,
} from '@dap/shared';
import { Modal } from '../../components/Modal.js';
import { useWorldCupStore, type WcLiveInfo } from '../../state/worldCupStore.js';
import { Countdown } from './Countdown.js';
import { GoalOverlay } from './GoalOverlay.js';
import { LiveBoard } from './LiveBoard.js';
import { CrownRace, LiveReactions, SweatMeter, WinProbBar } from './MatchCard.js';
import { MatchComments } from './MatchComments.js';
import { StakesBanner } from './StakesBanner.js';
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
  const odds = live?.odds ?? wc.odds?.[match.id] ?? null;

  const mePredictor = meId ? (wc.predictors.find((p) => p.id === meId) ?? null) : null;
  const watchers = useWatchers(
    match.id,
    mePredictor ? { id: mePredictor.id, name: mePredictor.name } : null,
  );
  const watching = watchers.length + 1; // +1 for me

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
      <div className="wc-room">
        {isLive && <GoalOverlay wc={wc} match={match} meId={meId} />}
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
            <div className="wc-room-status">
              {result ? (
                'Full time'
              ) : isLive ? (
                liveStatus(live!)
              ) : (
                <Countdown kickoff={match.kickoff} now={now} />
              )}
            </div>
          </div>
          <Side team={away} align="right" />
        </div>

        <p className="wc-room-watchers" aria-live="polite">
          <span aria-hidden>👀</span>{' '}
          {watching === 1 ? "You're watching" : `${watching} watching now`}
          {watchers.slice(0, 8).map((w) => (
            <span key={w.memberId} className="wc-room-watcher" title={w.name ?? 'Someone'}>
              {w.name ? w.name.slice(0, 1).toUpperCase() : '•'}
            </span>
          ))}
        </p>

        {!result && <StakesBanner wc={wc} meId={meId} match={match} />}

        {!result && !isLive && ready && (
          <p className="wc-room-lockin">
            <span aria-hidden>🗳</span> Picks locking in… {predictionCount(wc, match.id)} of{' '}
            {wc.predictors.length} are in
          </p>
        )}

        {isLive && (
          <div className="wc-room-live">
            {odds && home && away && <WinProbBar odds={odds} home={home} away={away} />}
            <SweatMeter wc={wc} match={match} live={live!} />
            <CrownRace wc={wc} match={match} live={live!} meId={meId} />
            <LiveReactions matchId={match.id} />
          </div>
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
