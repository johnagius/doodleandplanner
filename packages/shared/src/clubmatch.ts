/**
 * Match-centre data — parses ESPN's public per-event `summary` payload into the
 * compact, display-only shapes the Club Football board shows around a fixture:
 * bookmaker odds (as de-vigged 1/X/2 probabilities + the Over/Under line), each
 * side's recent form, head-to-head history (with dates) and a league-position
 * snapshot. Pure and serialisable, so it unit-tests against a captured payload.
 *
 * Nothing here feeds scoring — it's context only.
 */

export interface ClubOdds {
  provider: string;
  /** De-vigged win/draw/win probabilities (percent, summing to ~100). */
  homePct: number;
  drawPct: number;
  awayPct: number;
  /** The Over/Under goals line (e.g. 2.5) and the implied Over probability. */
  ouLine: number | null;
  overPct: number | null;
}

export interface ClubFormGame {
  date: string;
  result: string; // 'W' | 'D' | 'L'
  score: string; // "2-1"
  opponent: string; // abbreviation
  competition: string; // league abbreviation
  home: boolean; // true if played at home ("vs")
}

export interface ClubTeamForm {
  teamId: string;
  name: string;
  games: ClubFormGame[];
}

export interface ClubH2HGame {
  date: string;
  competition: string;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface ClubStandingRow {
  name: string;
  rank: number;
  points: number;
  played: number;
  record: string; // "W-D-L"
}

export interface ClubMatchInfo {
  odds: ClubOdds | null;
  /** Form per side (home first when identifiable). */
  form: ClubTeamForm[];
  h2h: ClubH2HGame[];
  standings: ClubStandingRow[];
  /** ESPN team ids for the home/away sides, to line up form/standings. */
  homeId?: string;
  awayId?: string;
  homeName?: string;
  awayName?: string;
}

/** American moneyline → implied probability (0–1). */
function impliedProb(ml: number | null | undefined): number | null {
  if (ml == null || !Number.isFinite(ml)) return null;
  return ml > 0 ? 100 / (ml + 100) : -ml / (-ml + 100);
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseOdds(raw: any): ClubOdds | null {
  const pc = raw?.pickcenter?.[0];
  if (!pc) return null;
  const home = impliedProb(pc.homeTeamOdds?.moneyLine);
  const away = impliedProb(pc.awayTeamOdds?.moneyLine);
  const draw = impliedProb(pc.drawOdds?.moneyLine);
  if (home == null || away == null || draw == null) return null;
  const sum = home + draw + away;
  const pct = (v: number) => Math.round((v / sum) * 100);
  const over = impliedProb(pc.overOdds);
  const under = impliedProb(pc.underOdds);
  const overPct = over != null && under != null ? Math.round((over / (over + under)) * 100) : null;
  return {
    provider: pc.provider?.name ?? 'Bookmaker',
    homePct: pct(home),
    drawPct: pct(draw),
    awayPct: pct(away),
    ouLine: typeof pc.overUnder === 'number' ? pc.overUnder : null,
    overPct,
  };
}

function parseForm(raw: any): ClubTeamForm[] {
  const out: ClubTeamForm[] = [];
  for (const t of raw?.lastFiveGames ?? []) {
    if (!t?.team) continue;
    out.push({
      teamId: String(t.team.id ?? ''),
      name: t.team.displayName ?? t.team.name ?? '',
      games: (t.events ?? []).map((e: any) => ({
        date: e.gameDate ?? '',
        result: e.gameResult ?? '',
        score: e.score ?? '',
        opponent: e.opponent?.abbreviation ?? e.opponent?.displayName ?? '',
        competition: e.leagueAbbreviation ?? e.leagueName ?? '',
        home: e.atVs === 'vs',
      })),
    });
  }
  return out;
}

function parseH2H(raw: any): ClubH2HGame[] {
  const grp = raw?.headToHeadGames?.[0];
  if (!grp) return [];
  const subjId = String(grp.team?.id ?? '');
  const subjName = grp.team?.displayName ?? '';
  const games: ClubH2HGame[] = [];
  for (const e of grp.events ?? []) {
    const oppName = e.opponent?.displayName ?? e.opponent?.abbreviation ?? '';
    const subjHome = String(e.homeTeamId ?? '') === subjId;
    games.push({
      date: e.gameDate ?? '',
      competition: e.competitionName ?? e.leagueName ?? e.leagueAbbreviation ?? '',
      homeName: subjHome ? subjName : oppName,
      awayName: subjHome ? oppName : subjName,
      homeScore: num(e.homeTeamScore),
      awayScore: num(e.awayTeamScore),
    });
  }
  return games;
}

function parseStandings(raw: any): ClubStandingRow[] {
  const entries = raw?.standings?.groups?.[0]?.standings?.entries ?? [];
  const rows: ClubStandingRow[] = [];
  for (const e of entries) {
    const stat = (type: string) =>
      (e.stats ?? []).find((s: any) => s?.type === type) as any | undefined;
    const rank = num(stat('rank')?.value ?? stat('rank')?.displayValue);
    if (rank == null) continue;
    rows.push({
      name: typeof e.team === 'string' ? e.team : (e.team?.displayName ?? ''),
      rank,
      points: num(stat('points')?.value ?? stat('points')?.displayValue) ?? 0,
      played: num(stat('gamesplayed')?.value ?? stat('gamesplayed')?.displayValue) ?? 0,
      record: stat('total')?.displayValue ?? '',
    });
  }
  return rows.sort((a, b) => a.rank - b.rank);
}

/** Parse an ESPN event `summary` payload into match-centre context. */
export function parseClubMatch(raw: unknown): ClubMatchInfo {
  const r = raw as any;
  const comp = r?.header?.competitions?.[0];
  const competitors = comp?.competitors ?? [];
  const homeC = competitors.find((c: any) => c.homeAway === 'home');
  const awayC = competitors.find((c: any) => c.homeAway === 'away');
  return {
    odds: parseOdds(r),
    form: parseForm(r),
    h2h: parseH2H(r),
    standings: parseStandings(r),
    homeId: homeC?.team?.id ? String(homeC.team.id) : undefined,
    awayId: awayC?.team?.id ? String(awayC.team.id) : undefined,
    homeName: homeC?.team?.displayName,
    awayName: awayC?.team?.displayName,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Find a team's form (by ESPN id, then name). */
export function formForTeam(
  info: ClubMatchInfo,
  teamId?: string,
  name?: string,
): ClubTeamForm | undefined {
  return info.form.find((f) => (teamId && f.teamId === teamId) || (name && f.name === name));
}

/** Find a team's standings row (by name). */
export function standingForTeam(info: ClubMatchInfo, name?: string): ClubStandingRow | undefined {
  if (!name) return undefined;
  return info.standings.find((s) => s.name === name);
}
