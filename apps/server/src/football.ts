/**
 * Map football-data.org's World Cup matches response to our compact live-score
 * shape. Teams are keyed by their three-letter code (`tla`), which matches our
 * team ids exactly, so the web client can line scores up with board matches.
 */
import type { WcLiveScore } from '@dap/shared';

interface FdMatch {
  status?: string;
  minute?: number | null;
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
