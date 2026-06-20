/**
 * "What's at stake for ME in this match" — pure composition of the frozen
 * ranking helpers (rivalry + scenarioBoard), no new scoring math. Gives the
 * Match Room / card a personal, dramatic read: where you stand, your nearest
 * rival to chase or hold off, and where you'd land if this result stood.
 */
import { rivalry, scenarioBoard, type WorldCupState } from '@dap/shared';
import type { WcLiveInfo } from '../../state/worldCupStore.js';

export interface WcStakes {
  rank: number;
  of: number;
  /** The nearest rival — to chase (one above) or to hold off (one below). */
  nemesis: { name: string; gap: number; direction: 'chase' | 'defend' } | null;
  /** Where this match's current scoreline would move you. Null pre-kickoff. */
  ifStands: { fromRank: number; toRank: number; delta: number; gain: number } | null;
}

export function liveStakes(
  wc: WorldCupState,
  meId: string,
  matchId: string,
  live: WcLiveInfo | undefined,
): WcStakes | null {
  const riv = rivalry(wc, meId);
  if (!riv) return null;

  const nemesis = riv.ahead
    ? { name: riv.ahead.name, gap: riv.ahead.gap, direction: 'chase' as const }
    : riv.behind
      ? { name: riv.behind.name, gap: riv.behind.gap, direction: 'defend' as const }
      : null;

  let ifStands: WcStakes['ifStands'] = null;
  if (live && live.home != null && live.away != null) {
    const row = scenarioBoard(wc, matchId, live.home, live.away).find(
      (r) => r.predictorId === meId,
    );
    if (row) {
      ifStands = {
        fromRank: row.prevRank,
        toRank: row.rank,
        delta: row.prevRank - row.rank, // > 0 = climbing
        gain: row.gain,
      };
    }
  }

  return { rank: riv.rank, of: riv.of, nemesis, ifStands };
}
