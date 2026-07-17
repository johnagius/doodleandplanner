import type { ClubLeagueState, ClubLiveInfo, ClubResult } from '@dap/shared';

/** Turn the store's ephemeral live map into a fixtureId → score map for the
 * "as it stands" leaderboard — only in-play fixtures that have no final result. */
export function liveScoresFromStore(
  club: ClubLeagueState,
  live: Record<string, ClubLiveInfo>,
): Record<string, ClubResult> {
  const out: Record<string, ClubResult> = {};
  for (const f of club.fixtures) {
    if (f.result) continue;
    const l = live[f.id];
    if (l) out[f.id] = { home: l.home, away: l.away };
  }
  return out;
}
