/**
 * Map football-data.org's World Cup matches response to our compact live-score
 * shape. Teams are keyed by their three-letter code (`tla`), which matches our
 * team ids exactly, so the web client can line scores up with board matches.
 */
import type { WcTeamH2H, WcLiveScore } from '@dap/shared';

interface FdMatch {
  id?: number;
  utcDate?: string;
  status?: string;
  minute?: number | null;
  competition?: { name?: string };
  homeTeam?: { tla?: string | null };
  awayTeam?: { tla?: string | null };
  score?: {
    winner?: string | null;
    fullTime?: { home?: number | null; away?: number | null };
  };
}

export function mapWorldCupScores(raw: unknown): WcLiveScore[] {
  const matches = (raw as { matches?: FdMatch[] } | null)?.matches ?? [];
  const out: WcLiveScore[] = [];
  for (const m of matches) {
    const homeTla = m.homeTeam?.tla;
    const awayTla = m.awayTeam?.tla;
    if (!homeTla || !awayTla) continue;
    out.push({
      homeTla,
      awayTla,
      status: m.status ?? 'SCHEDULED',
      minute: m.minute ?? null,
      home: m.score?.fullTime?.home ?? null,
      away: m.score?.fullTime?.away ?? null,
      winner: m.score?.winner ?? null,
    });
  }
  return out;
}

/**
 * Find the football-data match between two teams (by their three-letter codes,
 * in either order) in the WC fixtures, returning its id and the feed's own
 * home/away tla ordering — needed to query and map head-to-head data.
 */
export function findWcMatch(
  raw: unknown,
  aTla: string,
  bTla: string,
): { id: number; homeTla: string; awayTla: string } | null {
  const matches = (raw as { matches?: FdMatch[] } | null)?.matches ?? [];
  for (const m of matches) {
    const h = m.homeTeam?.tla;
    const a = m.awayTeam?.tla;
    if (!h || !a || typeof m.id !== 'number') continue;
    if ((h === aTla && a === bTla) || (h === bTla && a === aTla)) {
      return { id: m.id, homeTla: h, awayTla: a };
    }
  }
  return null;
}

interface FdH2H {
  aggregates?: {
    numberOfMatches?: number;
    homeTeam?: { wins?: number; draws?: number; losses?: number };
    awayTeam?: { wins?: number; draws?: number; losses?: number };
  };
  matches?: FdMatch[];
}

/**
 * Map football-data's head-to-head response into our compact, tla-keyed shape.
 * `homeTla`/`awayTla` are the feed's ordering for the queried match, used to
 * attach the aggregate win/draw/loss records to the right team codes.
 */
export function mapHeadToHead(raw: unknown, homeTla: string, awayTla: string): WcTeamH2H | null {
  const data = raw as FdH2H | null;
  const agg = data?.aggregates;
  if (!agg) return null;
  const rec = (t?: { wins?: number; draws?: number; losses?: number }) => ({
    wins: t?.wins ?? 0,
    draws: t?.draws ?? 0,
    losses: t?.losses ?? 0,
  });
  const recent: WcTeamH2H['recent'] = [];
  for (const m of (data?.matches ?? []).slice(0, 5)) {
    const h = m.homeTeam?.tla;
    const a = m.awayTeam?.tla;
    if (!h || !a) continue;
    recent.push({
      date: m.utcDate ?? '',
      homeTla: h,
      awayTla: a,
      homeScore: m.score?.fullTime?.home ?? null,
      awayScore: m.score?.fullTime?.away ?? null,
      competition: m.competition?.name,
    });
  }
  return {
    numberOfMatches: agg.numberOfMatches ?? 0,
    records: { [homeTla]: rec(agg.homeTeam), [awayTla]: rec(agg.awayTeam) },
    recent,
  };
}
