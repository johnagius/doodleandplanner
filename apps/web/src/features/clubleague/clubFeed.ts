import {
  CLUB_ESPN_LEAGUES,
  clubFeedWindow,
  clubScoreboardUrl,
  mergeClubFeeds,
  parseClubScoreboard,
  type ClubFeedFixture,
  type ISODateTime,
} from '@dap/shared';

export interface ClubFeedResult {
  fixtures: ClubFeedFixture[];
  /** The window the feed covered, so the board scopes pruning to it. */
  window: { from: ISODateTime; to: ISODateTime } | null;
  fetchedAt: string | null;
}

/**
 * Pull every tracked competition's fixtures for a rolling upcoming window,
 * straight from ESPN's public scoreboard. ESPN serves permissive CORS, so this
 * runs directly in the browser — no backend of our own is required for fixtures
 * to appear. Each league is fetched in parallel and per-league failures are
 * tolerated; we only return what we actually got.
 */
export async function fetchClubFixtures(
  now: Date = new Date(),
  opts: { uclFinalAfter?: ISODateTime } = {},
): Promise<ClubFeedResult> {
  const win = clubFeedWindow(now);
  const finalAfterMs = opts.uclFinalAfter ? Date.parse(opts.uclFinalAfter) : null;
  const lists = await Promise.all(
    CLUB_ESPN_LEAGUES.map(async (league) => {
      try {
        const res = await fetch(clubScoreboardUrl(league.slug, win.fromYmd, win.toYmd));
        if (!res.ok) return [];
        const raw = await res.json();
        const tracked = parseClubScoreboard(raw, league.competitionId);
        // The Champions League final must always be on the board (it decides the
        // Meister Cup) even between non-tracked clubs. For the UCL feed, also keep
        // any match kicking off after the leagues finish — that's the final.
        if (league.competitionId === 'ucl' && finalAfterMs != null) {
          const all = parseClubScoreboard(raw, league.competitionId, { keepUntracked: true });
          const seen = new Set(tracked.map((f) => f.externalId));
          for (const f of all) {
            if (!seen.has(f.externalId) && Date.parse(f.kickoff) >= finalAfterMs) tracked.push(f);
          }
        }
        return tracked;
      } catch {
        return [];
      }
    }),
  );
  const fixtures = mergeClubFeeds(lists);
  // If every league failed there's nothing to apply — signal "no data" so callers
  // leave the board untouched rather than pruning everything.
  if (fixtures.length === 0 && lists.every((l) => l.length === 0)) {
    return { fixtures: [], window: null, fetchedAt: null };
  }
  return {
    fixtures,
    window: { from: win.fromIso, to: win.toIso },
    fetchedAt: now.toISOString(),
  };
}
