/**
 * Tracks the match that *just* finished while we're watching, so the Cinema can
 * linger on it (and show the Full-Time report) instead of cutting straight to the
 * next fixture. ESPN keeps finished games on the scoreboard all day, so we baseline
 * whatever's already finished on the first live snapshot — those never linger — and
 * only hold on a match we actually see *transition* to FINISHED, and only for a
 * short window. Returns that match id, else null. Display-only; no scoring impact.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useNow } from './useNow.js';

interface LiveLike {
  status?: string;
}

/** How long to linger on a just-finished match before moving on. */
export const FINISH_LINGER_MS = 7 * 60_000;

export function useRecentlyFinished(live: Record<string, LiveLike | undefined>): string | null {
  const finishedAt = useRef<Map<string, number>>(new Map());
  const baselined = useRef(false);
  const now = useNow();

  const finishedIds = useMemo(
    () =>
      Object.keys(live)
        .filter((id) => live[id]?.status === 'FINISHED')
        .sort(),
    [live],
  );

  useEffect(() => {
    if (!baselined.current) {
      // Wait for the first real snapshot, then mark everything already finished as
      // "pre-existing" (sentinel 0) so an old result never hijacks the screen.
      if (Object.keys(live).length === 0) return;
      baselined.current = true;
      for (const id of finishedIds) finishedAt.current.set(id, 0);
      return;
    }
    for (const id of finishedIds) {
      if (!finishedAt.current.has(id)) finishedAt.current.set(id, Date.now());
    }
  }, [live, finishedIds]);

  // The most recently finished match still inside the linger window.
  let best: string | null = null;
  let bestAt = 0;
  for (const [id, at] of finishedAt.current) {
    if (at <= 0 || now - at > FINISH_LINGER_MS) continue;
    if (live[id]?.status !== 'FINISHED') continue;
    if (at > bestAt) {
      bestAt = at;
      best = id;
    }
  }
  return best;
}
