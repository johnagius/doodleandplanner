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

export interface ClubLineupPlayer {
  name: string;
  pos?: string;
  jersey?: string;
}

export interface ClubLineup {
  teamId: string;
  name: string;
  formation?: string;
  homeAway?: string;
  starters: ClubLineupPlayer[];
  subs: ClubLineupPlayer[];
}

export interface ClubStatPair {
  label: string;
  home: string;
  away: string;
}

export interface ClubKeyEvent {
  minute: string;
  text: string;
  type: string;
  scoring: boolean;
}

export interface ClubNewsItem {
  headline: string;
  url?: string;
  published?: string;
}

export interface ClubMatchInfo {
  odds: ClubOdds | null;
  /** Form per side (home first when identifiable). */
  form: ClubTeamForm[];
  h2h: ClubH2HGame[];
  standings: ClubStandingRow[];
  /** Team line-ups (formation + starters/subs), when published. */
  lineups: ClubLineup[];
  /** Paired home/away match statistics. */
  stats: ClubStatPair[];
  /** Goals, cards and substitutions in order. */
  keyEvents: ClubKeyEvent[];
  /** Match/club news headlines. */
  news: ClubNewsItem[];
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

function parseLineups(raw: any): ClubLineup[] {
  const out: ClubLineup[] = [];
  for (const r of raw?.rosters ?? []) {
    if (!r?.team) continue;
    const players = (r.roster ?? []).map((p: any) => ({
      name: p.athlete?.displayName ?? '',
      pos: p.position?.abbreviation,
      jersey: p.jersey != null ? String(p.jersey) : undefined,
    }));
    out.push({
      teamId: String(r.team.id ?? ''),
      name: r.team.displayName ?? '',
      formation: r.formation,
      homeAway: r.homeAway,
      starters: (r.roster ?? [])
        .map((p: any, i: number) => ({ p, l: players[i] }))
        .filter((x: any) => x.p.starter)
        .map((x: any) => x.l),
      subs: (r.roster ?? [])
        .map((p: any, i: number) => ({ p, l: players[i] }))
        .filter((x: any) => !x.p.starter)
        .map((x: any) => x.l),
    });
  }
  return out;
}

// Curated home/away stat comparison (ESPN stat name → label).
const STAT_LABELS: [string, string][] = [
  ['possessionPct', 'Possession %'],
  ['totalShots', 'Shots'],
  ['shotsOnTarget', 'On target'],
  ['wonCorners', 'Corners'],
  ['foulsCommitted', 'Fouls'],
  ['yellowCards', 'Yellow cards'],
  ['redCards', 'Red cards'],
  ['offsides', 'Offsides'],
  ['saves', 'Saves'],
];

function parseStats(raw: any): ClubStatPair[] {
  const teams = raw?.boxscore?.teams ?? [];
  const home = teams.find((t: any) => t.homeAway === 'home');
  const away = teams.find((t: any) => t.homeAway === 'away');
  if (!home || !away) return [];
  const val = (t: any, name: string) =>
    (t.statistics ?? []).find((s: any) => s?.name === name)?.displayValue as string | undefined;
  const out: ClubStatPair[] = [];
  for (const [name, label] of STAT_LABELS) {
    const h = val(home, name);
    const a = val(away, name);
    if (h != null && a != null) out.push({ label, home: h, away: a });
  }
  return out;
}

const KEY_EVENT_TYPES = new Set(['Goal', 'Yellow Card', 'Red Card', 'Substitution', 'Penalty']);

function parseKeyEvents(raw: any): ClubKeyEvent[] {
  const out: ClubKeyEvent[] = [];
  for (const e of raw?.keyEvents ?? []) {
    const type = e?.type?.text ?? '';
    const scoring = !!e?.scoringPlay;
    if (!scoring && !KEY_EVENT_TYPES.has(type)) continue;
    out.push({
      minute: e?.clock?.displayValue ?? '',
      text: e?.text ?? '',
      type,
      scoring,
    });
  }
  return out.slice(0, 25);
}

function parseNews(raw: any): ClubNewsItem[] {
  const arts = raw?.news?.articles ?? [];
  return arts.slice(0, 5).map((a: any) => ({
    headline: a.headline ?? '',
    url: a.links?.web?.href,
    published: a.published,
  }));
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
    lineups: parseLineups(r),
    stats: parseStats(r),
    keyEvents: parseKeyEvents(r),
    news: parseNews(r),
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
