/**
 * The amphitheatre — red theatre seats facing the big screen, filled by everyone
 * in this match's Room (you, plus live watchers from presence, plus anyone whose
 * comment is currently floating). When someone chats, their words pop as a speech
 * bubble above their seat. Pure presentation; nothing persisted, scoring untouched.
 */
import { findPredictor, type WorldCupState } from '@dap/shared';
import { Avatar } from './Avatar.js';
import type { Bubble } from './useCommentBubbles.js';
import type { Watcher } from './useWatchers.js';

const SEATS = 10;

interface SeatPerson {
  key: string;
  predictorId: string | null;
  name: string | null;
  isMe?: boolean;
}

export function CinemaSeats({
  wc,
  me,
  watchers,
  bubbles = [],
}: {
  wc: WorldCupState;
  me: { id: string; name: string | null } | null;
  watchers: Watcher[];
  bubbles?: Bubble[];
}) {
  // Latest bubble text per author (a newer line replaces an older one).
  const bubbleBy = new Map<string, string>();
  for (const b of bubbles) bubbleBy.set(b.authorId, b.text);

  // Audience, de-duped: me first, then watchers, then anyone mid-comment (so a
  // chatter who isn't formally "watching" still gets a seat for their bubble).
  const audience: SeatPerson[] = [];
  const seen = new Set<string>();
  const add = (p: SeatPerson) => {
    if (seen.has(p.key)) return;
    seen.add(p.key);
    audience.push(p);
  };
  if (me) add({ key: me.id, predictorId: me.id, name: me.name, isMe: true });
  for (const w of watchers) add({ key: w.memberId, predictorId: w.memberId, name: w.name });
  for (const b of bubbles) add({ key: b.authorId, predictorId: b.authorId, name: b.name });

  const taken = audience.slice(0, SEATS);
  const empties = Math.max(0, SEATS - taken.length);

  return (
    <div className="wc-amphi" aria-label={`${taken.length} watching this match`}>
      <ul className="wc-seats">
        {taken.map((p) => {
          const predictor = p.predictorId ? (findPredictor(wc, p.predictorId) ?? null) : null;
          const bubble = p.predictorId ? bubbleBy.get(p.predictorId) : undefined;
          return (
            <li
              key={p.key}
              className={`wc-seat is-taken ${p.isMe ? 'is-me' : ''}`}
              title={p.isMe ? 'You' : (p.name ?? 'Watching')}
            >
              {bubble && (
                <span className="wc-seat-bubble" role="status">
                  {bubble}
                </span>
              )}
              <span className="wc-seat-occupant">
                {predictor ? (
                  <Avatar predictor={predictor} size={26} />
                ) : (
                  <span className="wc-seat-anon" aria-hidden>
                    {p.name ? p.name.slice(0, 1).toUpperCase() : '👤'}
                  </span>
                )}
              </span>
              <span className="wc-seat-name">{p.isMe ? 'You' : (p.name ?? '—')}</span>
            </li>
          );
        })}
        {Array.from({ length: empties }, (_, i) => (
          <li key={`empty-${i}`} className="wc-seat" aria-hidden>
            <span className="wc-seat-empty" />
          </li>
        ))}
      </ul>
      <p className="wc-amphi-caption muted small">
        🎬 {taken.length} in the house{taken.length === 1 ? ' — pull up a friend' : ''}
      </p>
    </div>
  );
}
