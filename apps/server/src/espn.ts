/**
 * ESPN's public (unofficial, no-key) soccer scoreboard for the World Cup. It
 * updates roughly in real time and — unlike the football-data.org free tier —
 * carries the live match minute and status detail. We use it as the primary
 * live feed and keep football-data as the official-result source + fallback.
 *
 * Everything here is pure and serialisable so it unit-tests against a captured
 * scoreboard payload. The Worker does the fetching; this just parses + merges.
 */
import type {
  WcLineupPlayer,
  WcLiveScore,
  WcMatchEvent,
  WcMatchLeader,
  WcMatchOdds,
  WcMatchStatRow,
  WcMatchSummary,
} from '@dap/shared';

/**
 * ESPN national-team abbreviations are FIFA-style and line up with our team ids
 * (ESP, BRA, KSA, URU, …). Add an entry here only for any code ESPN spells
 * differently; unmapped codes pass through unchanged, and an unmatched game just
 * falls back to the football-data feed.
 */
export const ESPN_ALIAS: Record<string, string> = {};

const alias = (code: string): string => ESPN_ALIAS[code] ?? code;

interface EspnCompetitor {
  homeAway?: string;
  winner?: boolean;
  score?: string | number;
  form?: string;
  team?: { id?: string; abbreviation?: string; color?: string; alternateColor?: string; logo?: string }; // prettier-ignore
}
interface EspnDetail {
  type?: { text?: string };
  clock?: { displayValue?: string };
  team?: { id?: string };
  scoringPlay?: boolean;
  redCard?: boolean;
  yellowCard?: boolean;
  penaltyKick?: boolean;
  ownGoal?: boolean;
  athletesInvolved?: { displayName?: string }[];
}
interface EspnStatusType {
  name?: string;
  state?: string;
  completed?: boolean;
  description?: string;
  shortDetail?: string;
}
interface EspnOddsSide {
  close?: { odds?: string };
  open?: { odds?: string };
}
interface EspnOdds {
  details?: string;
  overUnder?: number;
  moneyline?: { home?: EspnOddsSide; away?: EspnOddsSide; draw?: EspnOddsSide };
}
interface EspnCompetition {
  status?: { displayClock?: string; type?: EspnStatusType };
  venue?: { fullName?: string; address?: { city?: string; country?: string } };
  attendance?: number;
  odds?: EspnOdds[];
  details?: EspnDetail[];
  competitors?: EspnCompetitor[];
}
interface EspnEvent {
  id?: string | number;
  competitions?: EspnCompetition[];
}

const intOrNull = (v: unknown): number | null => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : null;
};

const hex = (c: string | undefined): string | null => (c ? `#${c.replace(/^#/, '')}` : null);

/** Map ESPN's odds block to our compact shape (American moneyline + O/U line). */
function parseOdds(odds: EspnOdds[] | undefined): WcMatchOdds | null {
  const o = odds?.[0];
  if (!o) return null;
  const ml = (s?: EspnOddsSide) => intOrNull(s?.close?.odds ?? s?.open?.odds);
  const out: WcMatchOdds = {
    details: o.details ?? null,
    overUnder: typeof o.overUnder === 'number' ? o.overUnder : null,
    homeML: ml(o.moneyline?.home),
    awayML: ml(o.moneyline?.away),
    drawML: ml(o.moneyline?.draw),
  };
  // Drop entirely-empty odds so the UI can treat null as "no line".
  return out.details || out.overUnder != null || out.homeML != null ? out : null;
}

/** Normalise ESPN's status into our feed vocabulary (matches football-data). */
function normaliseStatus(type: EspnStatusType): WcLiveScore['status'] {
  if (type.completed === true) return 'FINISHED';
  if (type.name === 'STATUS_HALFTIME') return 'PAUSED';
  if (type.state === 'in') return 'IN_PLAY';
  if (type.state === 'post') return 'FINISHED';
  return 'SCHEDULED';
}

/** Parse a list of ESPN scoreboard events into our compact live-score shape. */
export function parseEspnEvents(events: EspnEvent[]): WcLiveScore[] {
  const out: WcLiveScore[] = [];
  for (const ev of events) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors?.find((c) => c.homeAway === 'home');
    const away = comp.competitors?.find((c) => c.homeAway === 'away');
    const hAbbr = home?.team?.abbreviation;
    const aAbbr = away?.team?.abbreviation;
    if (!hAbbr || !aAbbr) continue;

    const type = comp.status?.type ?? {};
    const status = normaliseStatus(type);
    const playing = status === 'IN_PLAY' || status === 'PAUSED' || status === 'FINISHED';
    const displayClock = comp.status?.displayClock ?? null;
    const city = comp.venue?.address?.city;
    const country = comp.venue?.address?.country;

    out.push({
      homeTla: alias(hAbbr),
      awayTla: alias(aAbbr),
      status,
      // Minute only ticks while in play; "45'+2'" → 45.
      minute:
        status === 'IN_PLAY'
          ? intOrNull(String(displayClock ?? '').replace(/[^0-9].*$/, ''))
          : null,
      home: playing ? intOrNull(home?.score) : null,
      away: playing ? intOrNull(away?.score) : null,
      winner: home?.winner ? 'HOME_TEAM' : away?.winner ? 'AWAY_TEAM' : null,
      clock: status === 'IN_PLAY' ? displayClock : null,
      detail: type.shortDetail ?? type.description ?? null,
      venue: comp.venue?.fullName ?? null,
      venueCity: [city, country].filter(Boolean).join(', ') || null,
      attendance: comp.attendance && comp.attendance > 0 ? comp.attendance : null,
      homeColor: hex(home?.team?.color),
      awayColor: hex(away?.team?.color),
      homeLogo: home?.team?.logo ?? null,
      awayLogo: away?.team?.logo ?? null,
      odds: parseOdds(comp.odds),
      source: 'espn',
    });
  }
  return out;
}

/** Parse a full ESPN scoreboard response (`{ events: [...] }`). */
export function parseEspnScoreboard(raw: unknown): WcLiveScore[] {
  const events = (raw as { events?: EspnEvent[] } | null)?.events ?? [];
  return parseEspnEvents(events);
}

const pairKey = (a: string, b: string): string => [a, b].sort().join('|');

/**
 * Merge the two feeds. football-data is the base (canonical codes + the official
 * full-time results that score predictions); ESPN overlays its fresher live
 * fields onto any match in progress, matched by the unordered team pair and
 * applied **by team code** so a home/away orientation mismatch can't swap the
 * score. A match football-data has already marked FINISHED is left as the
 * official record. ESPN-only games (e.g. football-data lagging) are appended.
 */
export function mergeLiveScores(fd: WcLiveScore[], espn: WcLiveScore[]): WcLiveScore[] {
  const espnByPair = new Map<string, WcLiveScore>();
  for (const e of espn) espnByPair.set(pairKey(e.homeTla, e.awayTla), e);

  const used = new Set<string>();
  const out: WcLiveScore[] = [];

  for (const f of fd) {
    const key = pairKey(f.homeTla, f.awayTla);
    const e = espnByPair.get(key);
    if (!e) {
      out.push(f);
      continue;
    }
    used.add(key);
    // ESPN's team-level metadata, mapped by code so it attaches to the right
    // side regardless of either feed's home/away orientation.
    const colorOf: Record<string, string | null> = { [e.homeTla]: e.homeColor ?? null, [e.awayTla]: e.awayColor ?? null }; // prettier-ignore
    const logoOf: Record<string, string | null> = { [e.homeTla]: e.homeLogo ?? null, [e.awayTla]: e.awayLogo ?? null }; // prettier-ignore
    const meta = {
      venue: f.venue ?? e.venue ?? null,
      venueCity: e.venueCity ?? null,
      attendance: e.attendance ?? null,
      odds: e.odds ?? null,
      homeColor: colorOf[f.homeTla] ?? null,
      awayColor: colorOf[f.awayTla] ?? null,
      homeLogo: logoOf[f.homeTla] ?? null,
      awayLogo: logoOf[f.awayTla] ?? null,
    };
    // Keep football-data's official finished result; just enrich its metadata.
    if (f.status === 'FINISHED') {
      out.push({ ...f, ...meta });
      continue;
    }
    // Overlay ESPN by team code so orientation differences can't swap goals.
    const scoreOf: Record<string, number | null> = {
      [e.homeTla]: e.home,
      [e.awayTla]: e.away,
    };
    const winnerCode =
      e.winner === 'HOME_TEAM' ? e.homeTla : e.winner === 'AWAY_TEAM' ? e.awayTla : null;
    out.push({
      homeTla: f.homeTla,
      awayTla: f.awayTla,
      status: e.status,
      minute: e.minute ?? null,
      home: scoreOf[f.homeTla] ?? null,
      away: scoreOf[f.awayTla] ?? null,
      winner:
        winnerCode === f.homeTla ? 'HOME_TEAM' : winnerCode === f.awayTla ? 'AWAY_TEAM' : null,
      clock: e.clock ?? null,
      detail: e.detail ?? null,
      ...meta,
      source: 'espn',
    });
  }

  for (const e of espn) {
    if (!used.has(pairKey(e.homeTla, e.awayTla))) out.push(e);
  }
  return out;
}

function detailKind(d: EspnDetail): WcMatchEvent['kind'] | null {
  if (d.ownGoal) return 'own-goal';
  if (d.scoringPlay) return d.penaltyKick ? 'pen-goal' : 'goal';
  if (d.redCard) return 'red';
  if (d.yellowCard) return 'yellow';
  return null;
}

/**
 * Parse goals + cards out of a scoreboard's per-match `details` arrays, keyed by
 * the (sorted) team pair so the client can line them up with board matches.
 * Best-effort assists (a goal's second athlete). Cards/goals only — other plays
 * (subs, etc.) are skipped.
 */
export function parseEspnMatchEvents(raw: unknown): Record<string, WcMatchEvent[]> {
  const events = (raw as { events?: EspnEvent[] } | null)?.events ?? [];
  const out: Record<string, WcMatchEvent[]> = {};
  for (const ev of events) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors?.find((c) => c.homeAway === 'home');
    const away = comp.competitors?.find((c) => c.homeAway === 'away');
    const hAbbr = home?.team?.abbreviation;
    const aAbbr = away?.team?.abbreviation;
    if (!hAbbr || !aAbbr) continue;
    const idToCode: Record<string, string> = {};
    if (home?.team?.id) idToCode[home.team.id] = alias(hAbbr);
    if (away?.team?.id) idToCode[away.team.id] = alias(aAbbr);

    const list: WcMatchEvent[] = [];
    for (const d of comp.details ?? []) {
      const kind = detailKind(d);
      if (!kind) continue;
      const teamTla = d.team?.id ? idToCode[d.team.id] : undefined;
      const player = d.athletesInvolved?.[0]?.displayName;
      if (!teamTla || !player) continue;
      const goal = kind === 'goal' || kind === 'pen-goal' || kind === 'own-goal';
      const assist = goal ? d.athletesInvolved?.[1]?.displayName : undefined;
      list.push({ minute: d.clock?.displayValue ?? '', kind, teamTla, player, ...(assist ? { assist } : {}) }); // prettier-ignore
    }
    if (list.length) out[pairKey(alias(hAbbr), alias(aAbbr))] = list;
  }
  return out;
}

/** ESPN event id keyed by the (sorted) team pair, so the client can resolve a
 * board match to its ESPN event (for the per-match summary / lineups). */
export function parseEspnEventIds(raw: unknown): Record<string, string> {
  const events = (raw as { events?: EspnEvent[] } | null)?.events ?? [];
  const out: Record<string, string> = {};
  for (const ev of events) {
    if (ev.id == null) continue;
    const comp = ev.competitions?.[0];
    const home = comp?.competitors?.find((c) => c.homeAway === 'home')?.team?.abbreviation;
    const away = comp?.competitors?.find((c) => c.homeAway === 'away')?.team?.abbreviation;
    if (!home || !away) continue;
    out[pairKey(alias(home), alias(away))] = String(ev.id);
  }
  return out;
}

interface EspnRosterEntry {
  athlete?: { displayName?: string };
  displayName?: string;
  jersey?: string;
  starter?: boolean;
  position?: { abbreviation?: string };
  formationPlace?: string;
}
interface EspnRoster {
  team?: { abbreviation?: string };
  roster?: EspnRosterEntry[];
}

const intOrNullStr = (v: string | undefined): number | null => {
  if (v == null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

/** Parse a match summary's `rosters` into starting-XI players, keyed by team code. */
export function parseEspnLineups(raw: unknown): Record<string, WcLineupPlayer[]> {
  const rosters = (raw as { rosters?: EspnRoster[] } | null)?.rosters ?? [];
  const out: Record<string, WcLineupPlayer[]> = {};
  for (const r of rosters) {
    const code = r.team?.abbreviation ? alias(r.team.abbreviation) : null;
    if (!code) continue;
    const players: WcLineupPlayer[] = [];
    for (const e of r.roster ?? []) {
      const name = e.athlete?.displayName ?? e.displayName;
      if (!name) continue;
      players.push({
        name,
        jersey: intOrNullStr(e.jersey),
        pos: e.position?.abbreviation ?? '',
        starter: e.starter === true,
        formationPlace: intOrNullStr(e.formationPlace),
      });
    }
    if (players.length) out[code] = players;
  }
  return out;
}

interface EspnStatEntry {
  name?: string;
  value?: number;
  displayValue?: string;
}
interface EspnBoxscoreTeam {
  homeAway?: string;
  team?: { abbreviation?: string };
  statistics?: EspnStatEntry[];
}
interface EspnLeaderAthlete {
  displayValue?: string;
  value?: number;
  athlete?: { displayName?: string };
}
interface EspnLeaderCategory {
  name?: string;
  displayName?: string;
  leaders?: EspnLeaderAthlete[];
}
interface EspnLeaderTeam {
  team?: { abbreviation?: string };
  leaders?: EspnLeaderCategory[];
}
interface EspnOfficial {
  fullName?: string;
  displayName?: string;
  position?: { name?: string; id?: string };
}
interface EspnSummary {
  boxscore?: { teams?: EspnBoxscoreTeam[] };
  leaders?: EspnLeaderTeam[];
  gameInfo?: {
    officials?: EspnOfficial[];
    venue?: { fullName?: string; address?: { city?: string; country?: string } };
  };
}

/** The curated team stats we surface, in display order, mapped to ESPN's stat
 * `name`s. `pct` rows are already percentages (shown as each side's own %). */
const SUMMARY_STAT_ROWS: { key: string; label: string; espn: string; pct?: boolean }[] = [
  { key: 'possession', label: 'Possession', espn: 'possessionPct', pct: true },
  { key: 'shots', label: 'Shots', espn: 'totalShots' },
  { key: 'onTarget', label: 'Shots on target', espn: 'shotsOnTarget' },
  { key: 'corners', label: 'Corners', espn: 'wonCorners' },
  { key: 'fouls', label: 'Fouls', espn: 'foulsCommitted' },
  { key: 'offsides', label: 'Offsides', espn: 'offsides' },
  { key: 'passAcc', label: 'Pass accuracy', espn: 'passPct', pct: true },
  { key: 'saves', label: 'Saves', espn: 'saves' },
  { key: 'tackles', label: 'Tackles', espn: 'totalTackles' },
];

const numOrNull = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** Everything we mine from one ESPN match summary besides the lineups: team
 * stats by code, standout performers, referee and venue. Orientation to the
 * board's home/away is applied later by {@link orientMatchSummary}. */
export interface EspnSummaryParsed {
  /** ESPN stat name → value, keyed by team code. */
  teamStats: Record<string, Record<string, number | null>>;
  leaders: WcMatchLeader[];
  referee: string | null;
  venue: string | null;
  venueCity: string | null;
}

/** Parse the non-lineup detail out of an ESPN match summary payload. */
export function parseEspnSummary(raw: unknown): EspnSummaryParsed {
  const s = (raw ?? {}) as EspnSummary;

  const teamStats: Record<string, Record<string, number | null>> = {};
  for (const t of s.boxscore?.teams ?? []) {
    const code = t.team?.abbreviation ? alias(t.team.abbreviation) : null;
    if (!code) continue;
    const stats: Record<string, number | null> = {};
    for (const st of t.statistics ?? []) {
      if (st.name) stats[st.name] = numOrNull(st.value ?? st.displayValue);
    }
    teamStats[code] = stats;
  }

  const leaders: WcMatchLeader[] = [];
  for (const lt of s.leaders ?? []) {
    const code = lt.team?.abbreviation ? alias(lt.team.abbreviation) : null;
    if (!code) continue;
    for (const cat of lt.leaders ?? []) {
      const top = cat.leaders?.[0];
      const name = top?.athlete?.displayName;
      if (!name) continue;
      const value = top.displayValue ?? (top.value != null ? String(top.value) : '');
      leaders.push({ teamTla: code, category: cat.displayName ?? cat.name ?? '', name, value });
    }
  }

  const officials = s.gameInfo?.officials ?? [];
  const ref =
    officials.find((o) => (o.position?.name ?? '').toLowerCase() === 'referee') ?? officials[0];
  const venue = s.gameInfo?.venue?.fullName ?? null;
  const city = s.gameInfo?.venue?.address?.city;
  const country = s.gameInfo?.venue?.address?.country;

  return {
    teamStats,
    leaders,
    referee: ref?.fullName ?? ref?.displayName ?? null,
    venue,
    venueCity: [city, country].filter(Boolean).join(', ') || null,
  };
}

/** Orient a parsed summary to the board's home/away codes: build the side-by-side
 * stat rows (dropping rows neither side has) and keep the rest. */
export function orientMatchSummary(
  parsed: EspnSummaryParsed,
  homeTla: string,
  awayTla: string,
): WcMatchSummary {
  const rows: WcMatchStatRow[] = [];
  for (const r of SUMMARY_STAT_ROWS) {
    const home = parsed.teamStats[homeTla]?.[r.espn] ?? null;
    const away = parsed.teamStats[awayTla]?.[r.espn] ?? null;
    if (home == null && away == null) continue;
    rows.push({ key: r.key, label: r.label, home, away, pct: !!r.pct });
  }
  return {
    homeTla,
    awayTla,
    stats: rows,
    leaders: parsed.leaders,
    referee: parsed.referee,
    venue: parsed.venue,
    venueCity: parsed.venueCity,
  };
}

/**
 * UTC `YYYYMMDD` keys for yesterday, today and tomorrow. World Cup kick-offs run
 * into the small hours of **Malta** time and straddle the UTC/US day boundary,
 * so polling a three-day window guarantees we catch every live or just-finished
 * game regardless of how ESPN buckets the date. (Deduped by event id upstream.)
 */
export function espnDateWindow(now: Date): string[] {
  const day = 86_400_000;
  const fmt = (d: Date): string =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
      d.getUTCDate(),
    ).padStart(2, '0')}`;
  return [-1, 0, 1].map((delta) => fmt(new Date(now.getTime() + delta * day)));
}
