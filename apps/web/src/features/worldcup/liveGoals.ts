/**
 * Goal-moment detection for the immersive theatrics — display-only, no scoring
 * impact. The live store replaces its `live` map wholesale each ~15s poll and
 * keeps no previous score, so we diff against the last value we saw in a local
 * ref (the same "baseline the first sighting silently" trick the celebration
 * hooks use), rather than adding state to the store.
 */
import { useEffect, useRef } from 'react';
import { useWorldCupStore } from '../../state/worldCupStore.js';

interface Score {
  home: number | null;
  away: number | null;
}

export interface WcGoalDiff {
  side: 'home' | 'away';
  /** The full scoreline after the goal. */
  total: { home: number; away: number };
  /** The scoreline before the goal — for a provisional points delta. */
  prevTotal: { home: number; away: number };
}

/**
 * A goal is a *strict upward* change on one side between two ticks. Downward
 * corrections (the feed occasionally walks a score back) never fire. Returns
 * null until both sides have a number to compare. If both sides somehow jump in
 * one tick, the home side is reported.
 */
export function goalDiff(prev: Score | undefined, curr: Score | undefined): WcGoalDiff | null {
  if (!prev || !curr || curr.home == null || curr.away == null) return null;
  const ph = prev.home ?? 0;
  const pa = prev.away ?? 0;
  if (prev.home == null || prev.away == null) return null; // first real sighting baselines
  const prevTotal = { home: ph, away: pa };
  if (curr.home > ph)
    return { side: 'home', total: { home: curr.home, away: curr.away }, prevTotal };
  if (curr.away > pa)
    return { side: 'away', total: { home: curr.home, away: curr.away }, prevTotal };
  return null;
}

/**
 * Fire `onGoal` once each time this match's live score ticks up. The first
 * observation (and any remount) baselines silently, so opening a card mid-match
 * never replays past goals. Pass a stable `onGoal` (useCallback).
 */
export function useGoalEvents(matchId: string, onGoal: (g: WcGoalDiff) => void): void {
  const live = useWorldCupStore((s) => s.live[matchId]);
  const last = useRef<Score | null>(null);
  const baselined = useRef(false);

  useEffect(() => {
    const curr: Score | null = live ? { home: live.home, away: live.away } : null;
    if (!baselined.current) {
      baselined.current = true;
      last.current = curr;
      return;
    }
    const g = goalDiff(last.current ?? undefined, curr ?? undefined);
    last.current = curr;
    if (g) onGoal(g);
  }, [live, onGoal]);
}
