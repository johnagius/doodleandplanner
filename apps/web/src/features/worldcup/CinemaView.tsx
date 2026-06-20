/**
 * The Cinema — a full-screen watch-together modal. One match only (the live game,
 * else the next one up), shown on a dominant amphitheatre screen that auto-rotates
 * a living broadcast (commentary + stats + our table + group + chat). ~10 big
 * seats fill with whoever's here. A prominent chat dock makes it a proper mobile
 * companion while the match is on the telly. Opened from the 🎬 Cinema button and
 * every "Watch together"; closes back to the page. Pure presentation; scoring
 * untouched.
 */
import { findTeam, type WcMatch, type WorldCupState } from '@dap/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { EmptyState } from '../../components/EmptyState.js';
import { Modal } from '../../components/Modal.js';
import { useToast } from '../../components/Toast.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { Amphitheatre } from './Amphitheatre.js';
import { CinemaFeed } from './CinemaFeed.js';
import { GoalOverlay } from './GoalOverlay.js';
import { HighlightOverlay } from './HighlightOverlay.js';
import { IntervalReport } from './IntervalReport.js';
import { KickoffCue } from './KickoffCue.js';
import { useGoalEvents } from './liveGoals.js';
import { PreMatchHype } from './PreMatchHype.js';
import { StageReactions } from './StageReactions.js';
import { StakesBanner } from './StakesBanner.js';
import { useCommentBubbles } from './useCommentBubbles.js';
import { useMatchRoom } from './useMatchRoom.js';
import { useNow } from './useNow.js';
import { useRecentlyFinished } from './useRecentlyFinished.js';
import { useWatchers } from './useWatchers.js';
import { legibleScoreColor } from './wcFormat.js';

function isInPlay(s: string | undefined): boolean {
  return s === 'IN_PLAY' || s === 'PAUSED';
}

/** Grace after kickoff to keep a match selected while the feed catches up to in-play. */
const KICKOFF_GRACE_MS = 20 * 60_000;

const REACTIONS = ['🔥', '⚽', '😱', '👏', '🙌'];

/**
 * The one match the Cinema concerns: the current in-play game, else a match that
 * *just* finished (so Full Time gets its moment), else the one being played now
 * (kicked off, feed yet to flip to in-play), else the next up. A game the feed
 * marks FINISHED is never offered as "next" — only the linger can hold on it.
 */
export function pickCinemaMatch(
  wc: WorldCupState,
  liveMap: Record<string, { status?: string }>,
  lingerFinishedId?: string | null,
): WcMatch | null {
  const inPlay = wc.matches.find((m) => !m.result && isInPlay(liveMap[m.id]?.status));
  if (inPlay) return inPlay;
  if (lingerFinishedId) {
    const lingering = wc.matches.find((m) => m.id === lingerFinishedId);
    if (lingering) return lingering;
  }
  const now = Date.now();
  const pending = wc.matches.filter(
    (m) =>
      !m.result && liveMap[m.id]?.status !== 'FINISHED' && !Number.isNaN(Date.parse(m.kickoff)),
  );
  // A match whose kickoff has just passed is the one being played now — hold on it
  // through the lag before the feed flips to in-play, rather than skipping ahead.
  const justKicked = pending
    .filter((m) => {
      const t = Date.parse(m.kickoff);
      return t <= now && now - t <= KICKOFF_GRACE_MS;
    })
    .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));
  if (justKicked[0]) return justKicked[0];
  const future = pending
    .filter((m) => Date.parse(m.kickoff) >= now)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  if (future[0]) return future[0];
  const recent = [...pending].sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));
  return recent[0] ?? wc.matches.find((m) => !m.result) ?? null;
}

export function CinemaView({ wc }: { wc: WorldCupState }) {
  const openId = useMatchRoom((s) => s.openId);
  const close = useMatchRoom((s) => s.close);
  const liveMap = useWorldCupStore((s) => s.live);
  const open = openId != null;
  const lingerId = useRecentlyFinished(liveMap);
  const match = useMemo(() => pickCinemaMatch(wc, liveMap, lingerId), [wc, liveMap, lingerId]);

  const home = match ? findTeam(wc, match.homeId) : null;
  const away = match ? findTeam(wc, match.awayId) : null;
  const title = (
    <span className="wc-cinema-title">
      🎬 Cinema
      {home && away && (
        <span className="wc-cinema-title-vs">
          {' · '}
          {home.id}–{away.id}
        </span>
      )}
    </span>
  );

  return (
    <Modal open={open} onClose={close} className="wc-cinema-modal" title={title}>
      {match ? (
        <CinemaStage wc={wc} match={match} />
      ) : (
        <EmptyState
          icon="🎬"
          title="Nothing on right now"
          hint="When a match is live — or coming up next — pull up a seat here to watch it together."
        />
      )}
    </Modal>
  );
}

function CinemaStage({ wc, match }: { wc: WorldCupState; match: WcMatch }) {
  const meId = useWorldCupStore((s) => s.meId);
  const live = useWorldCupStore((s) => s.live[match.id]);
  const now = useNow();

  const home = findTeam(wc, match.homeId);
  const away = findTeam(wc, match.awayId);
  const result = match.result;
  const isLive = !result && !!live && isInPlay(live.status);
  const finished = !result && live?.status === 'FINISHED';
  const preMatch = !result && !isLive && !finished;
  const accent = live?.homeColor ? legibleScoreColor(live.homeColor) : null;

  const mePredictor = meId ? (wc.predictors.find((p) => p.id === meId) ?? null) : null;
  const watchers = useWatchers(
    match.id,
    mePredictor ? { id: mePredictor.id, name: mePredictor.name } : null,
  );
  const bubbles = useCommentBubbles(match.id);

  // The seats erupt on a goal (~2.6s window).
  const [cheering, setCheering] = useState(false);
  const cheerTimer = useRef<number | null>(null);
  const onGoal = useCallback(() => {
    setCheering(true);
    if (cheerTimer.current) window.clearTimeout(cheerTimer.current);
    cheerTimer.current = window.setTimeout(() => setCheering(false), 2600);
  }, []);
  useGoalEvents(match.id, onGoal);
  useEffect(() => () => void (cheerTimer.current && window.clearTimeout(cheerTimer.current)), []);

  return (
    <div className="wc-cinema" style={accent ? ({ ['--c']: accent } as CSSProperties) : undefined}>
      <div className="wc-cinema-stage">
        <Amphitheatre
          wc={wc}
          me={mePredictor ? { id: mePredictor.id, name: mePredictor.name } : null}
          watchers={watchers}
          bubbles={bubbles}
          cheering={cheering}
        >
          <div className="wc-screen">
            {isLive && <GoalOverlay wc={wc} match={match} meId={meId} />}
            {isLive && <HighlightOverlay wc={wc} match={match} />}
            {isLive && <StageReactions matchId={match.id} />}
            <KickoffCue matchId={match.id} />
            <IntervalReport wc={wc} match={match} />

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
                ) : (isLive || finished) && live!.home != null ? (
                  <>
                    <span style={{ color: legibleScoreColor(live!.homeColor) }}>{live!.home}</span>
                    <i>–</i>
                    <span style={{ color: legibleScoreColor(live!.awayColor) }}>{live!.away}</span>
                  </>
                ) : (
                  <span className="wc-screen-vs">v</span>
                )}
                <span className="wc-screen-clock">
                  {result || finished
                    ? 'FT'
                    : isLive
                      ? (live!.clock ?? `${live!.minute ?? 0}'`)
                      : null}
                </span>
              </span>
              <span className="wc-screen-side wc-screen-side-right">
                <span className="wc-screen-flag" aria-hidden>
                  {away?.flag ?? '⚽'}
                </span>
                {away?.name ?? 'TBD'}
              </span>
            </div>

            {!result && meId && (
              <div className="wc-screen-stakes">
                <StakesBanner wc={wc} meId={meId} match={match} compact />
              </div>
            )}

            {preMatch && (
              <div className="wc-screen-hype">
                <PreMatchHype wc={wc} match={match} now={now} />
              </div>
            )}

            <div className="wc-screen-body">
              <CinemaFeed wc={wc} match={match} />
            </div>
          </div>
        </Amphitheatre>
      </div>

      <ChatDock wc={wc} matchId={match.id} meId={meId} />
    </div>
  );
}

/** The prominent room chat — a mobile companion while the match is on the telly. */
function ChatDock({
  wc,
  matchId,
  meId,
}: {
  wc: WorldCupState;
  matchId: string;
  meId: string | null;
}) {
  const messages = useWorldCupStore((s) => s.state?.messages);
  const { postComment } = useWorldCupStore();
  const { show } = useToast();
  const [draft, setDraft] = useState('');

  const recent = useMemo(
    () =>
      (messages ?? [])
        .filter((m) => m.matchId === matchId && m.text && m.text.trim())
        .slice(-8)
        .map((m) => ({
          id: m.id,
          who: wc.predictors.find((p) => p.id === m.authorId)?.name ?? 'Someone',
          mine: m.authorId === meId,
          text: m.text,
        })),
    [messages, matchId, wc, meId],
  );

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [recent.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      await postComment(matchId, text);
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not post');
    }
  }

  return (
    <div className="wc-chat">
      <div className="wc-chat-head">
        💬 Room chat <span className="wc-chat-sub">— text the lads while you watch</span>
      </div>
      <div className="wc-chat-log" ref={logRef} aria-live="polite">
        {recent.length === 0 ? (
          <p className="wc-chat-empty">Be the first to say something…</p>
        ) : (
          recent.map((m) => (
            <div key={m.id} className={`wc-chat-msg ${m.mine ? 'is-mine' : ''}`}>
              <strong className="wc-chat-who">{m.mine ? 'You' : m.who}</strong>
              <span className="wc-chat-text">{m.text}</span>
            </div>
          ))
        )}
      </div>
      <form className="wc-chat-form" onSubmit={send}>
        <div className="wc-chat-emoji" aria-hidden={!meId}>
          {REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              className="wc-chat-emoji-btn"
              disabled={!meId}
              onClick={() => setDraft((d) => (d + e).slice(0, 200))}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="wc-chat-row">
          <input
            className="input wc-chat-input"
            placeholder={meId ? 'Message the room…' : 'Pick your name above to chat'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!meId}
            aria-label="Message the room"
            maxLength={200}
          />
          <button
            className="btn btn-primary wc-chat-send"
            type="submit"
            disabled={!meId || !draft.trim()}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
