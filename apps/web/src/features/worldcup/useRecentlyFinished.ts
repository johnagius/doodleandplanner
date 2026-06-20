/**
 * Tracks the match that *just* finished while we're watching, so the Cinema can
 * linger on it (and show the Full-Time report) instead of cutting straight to the
 * next fixture. We only linger on a match we actually saw *transition* from in-play
 * to FINISHED: a game that was already over when we arrived — or one that merely
 * surfaces in the feed already finished (ESPN keeps finished games on the
 * scoreboard, and entries fill in over time) — never hijacks the screen. Returns
 * that match id while the finish is fresh, else null. Display-only; no scoring impact.
 */
import { useEffect, useRef } from 'react';
import { useNow } from './useNow.js';

interface LiveLike {
  status?: string;
}

/** How long to linger on a just-finished match before moving on. */
export const FINISH_LINGER_MS = 7 * 60_000;

function isInPlay(s: string | undefined): boolean {
  return s === 'IN_PLAY' || s === 'PAUSED';
}

export function useRecentlyFinished(live: Record<string, LiveLike | undefined>): string | null {
  // Matches we've watched be in play, and when one we watched hit full time.
  const seenInPlay = useRef<Set<string>>(new Set());
  const finishedAt = useRef<Map<string, number>>(new Map());
  const now = useNow();

  useEffect(() => {
    for (const [id, info] of Object.entries(live)) {
      const status = info?.status;
      if (isInPlay(status)) {
        seenInPlay.current.add(id);
      } else if (
        status === 'FINISHED' &&
        seenInPlay.current.has(id) &&
        !finishedAt.current.has(id)
      ) {
        // We watched this one go from play to full time — let it linger.
        finishedAt.current.set(id, Date.now());
      }
    }
  }, [live]);

  // The most recently finished match still inside the linger window.
  let best: string | null = null;
  let bestAt = 0;
  for (const [id, at] of finishedAt.current) {
    if (now - at > FINISH_LINGER_MS) continue;
    if (live[id]?.status !== 'FINISHED') continue;
    if (at > bestAt) {
      bestAt = at;
      best = id;
    }
  }
  return best;
}
