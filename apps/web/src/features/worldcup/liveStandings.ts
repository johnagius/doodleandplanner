/**
 * One definition of "the table as it stands" — in-play games folded into the
 * leaderboard provisionally (final results take over once they land). Used by
 * the Leaderboard tab and the immersive Match Room's live board, so they never
 * drift apart. Pure reuse of the frozen `leaderboardWithMovement` ranking — no
 * new scoring math.
 */
import {
  findMatch,
  leaderboardWithMovement,
  type WcLeaderRowMoved,
  type WorldCupState,
} from '@dap/shared';
import { useMemo } from 'react';
import { useWorldCupStore, type WcLiveInfo } from '../../state/worldCupStore.js';

/** In-play scorelines (no final result yet) keyed by match id, for provisional points. */
export function liveScoresFromLive(
  wc: WorldCupState,
  live: Record<string, WcLiveInfo>,
): Record<string, { home: number; away: number }> {
  const out: Record<string, { home: number; away: number }> = {};
  for (const [mid, info] of Object.entries(live)) {
    const inPlay = info.status === 'IN_PLAY' || info.status === 'PAUSED';
    const m = findMatch(wc, mid);
    if (inPlay && info.home != null && info.away != null && m && !m.result) {
      out[mid] = { home: info.home, away: info.away };
    }
  }
  return out;
}

/** The live-folded leaderboard with movement, memoised on the board + live map. */
export function useLiveLeaderboard(wc: WorldCupState): WcLeaderRowMoved[] {
  const live = useWorldCupStore((s) => s.live);
  return useMemo(() => {
    const liveScores = liveScoresFromLive(wc, live);
    const count = Object.keys(liveScores).length;
    return leaderboardWithMovement(wc, count ? liveScores : undefined);
  }, [wc, live]);
}
