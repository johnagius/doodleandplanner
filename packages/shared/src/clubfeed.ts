/**
 * Club Football fixture feed — parses ESPN's public (no-key) per-competition
 * soccer scoreboard into our {@link ClubFeedFixture} shape, keeping only games
 * that involve one of the tracked clubs.
 *
 * The Worker fetches each competition's scoreboard for a rolling upcoming window
 * (the next week or two) and hands the raw JSON here. Everything in this module
 * is pure and serialisable so it unit-tests against a captured payload.
 */
import {
  CLUB_TEAM_BY_ESPN_ID,
  type ClubFeedFixture,
  type ClubFixtureStatus,
  type ClubSide,
} from './clubleague.js';

interface EspnTeam {
  id?: string;
  displayName?: string;
  shortDisplayName?: string;
  name?: string;
  abbreviation?: string;
  color?: string;
}
interface EspnCompetitor {
  homeAway?: string;
  team?: EspnTeam;
  score?: string | number;
}
interface EspnStatusType {
  state?: string;
  completed?: boolean;
}
interface EspnCompetition {
  competitors?: EspnCompetitor[];
  status?: { type?: EspnStatusType };
}
interface EspnEvent {
  id?: string;
  date?: string;
  competitions?: EspnCompetition[];
  status?: { type?: EspnStatusType };
}

function toStatus(type: EspnStatusType): ClubFixtureStatus {
  if (type.completed || type.state === 'post') return 'final';
  if (type.state === 'in') return 'live';
  return 'scheduled';
}

function num(v: string | number | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function isTracked(espnId: string | undefined): boolean {
  return !!espnId && !!CLUB_TEAM_BY_ESPN_ID[espnId];
}

function toSide(team: EspnTeam): ClubSide {
  const teamId = team.id ? CLUB_TEAM_BY_ESPN_ID[team.id] : undefined;
  const name = team.displayName ?? team.name ?? team.shortDisplayName ?? team.abbreviation ?? 'TBD';
  const short = (team.abbreviation ?? name.slice(0, 3)).toUpperCase();
  const color = team.color ? `#${team.color.replace(/^#/, '')}` : undefined;
  // A tracked club carries its id so the board re-applies our canonical crest.
  return teamId ? { name, short, color, teamId } : { name, short, color };
}

/**
 * Parse one competition's ESPN scoreboard, keeping only fixtures where at least
 * one side is a tracked club. `competitionId` is our own competition id for that
 * ESPN league.
 */
export function parseClubScoreboard(raw: unknown, competitionId: string): ClubFeedFixture[] {
  const events = (raw as { events?: EspnEvent[] } | null)?.events ?? [];
  const out: ClubFeedFixture[] = [];
  for (const ev of events) {
    const comp = ev.competitions?.[0];
    if (!comp || !ev.id || !ev.date) continue;
    const home = comp.competitors?.find((c) => c.homeAway === 'home');
    const away = comp.competitors?.find((c) => c.homeAway === 'away');
    if (!home?.team || !away?.team) continue;
    if (!isTracked(home.team.id) && !isTracked(away.team.id)) continue;

    const type = comp.status?.type ?? ev.status?.type ?? {};
    const status = toStatus(type);
    const fixture: ClubFeedFixture = {
      externalId: `espn:${ev.id}`,
      competitionId,
      kickoff: new Date(ev.date).toISOString(),
      home: toSide(home.team),
      away: toSide(away.team),
      status,
    };
    if (status === 'final') {
      const h = num(home.score);
      const a = num(away.score);
      if (h != null && a != null) fixture.result = { home: h, away: a };
    }
    out.push(fixture);
  }
  return out;
}

/** Merge per-competition fixture lists, de-duplicating by external id (a game
 * between two tracked clubs can only appear in one competition, but be safe). */
export function mergeClubFeeds(lists: ClubFeedFixture[][]): ClubFeedFixture[] {
  const byId = new Map<string, ClubFeedFixture>();
  for (const list of lists) {
    for (const f of list) if (!byId.has(f.externalId)) byId.set(f.externalId, f);
  }
  return [...byId.values()].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}

/** ESPN scoreboard URL for a league slug over a `YYYYMMDD-YYYYMMDD` window. */
export function clubScoreboardUrl(slug: string, from: string, to: string): string {
  return `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${from}-${to}`;
}

/** A rolling window: a few days back (to catch just-finished results) through ~6
 * weeks ahead. The forward reach is wide enough to bridge pre-season and
 * international breaks — otherwise a quiet fortnight (or the summer gap) would
 * show an empty board even though the next round is only three weeks out. Returns
 * both the ESPN `YYYYMMDD` strings and the ISO bounds the board uses to scope
 * pruning. */
export function clubFeedWindow(now: Date): {
  fromYmd: string;
  toYmd: string;
  fromIso: string;
  toIso: string;
} {
  const day = 86_400_000;
  const from = new Date(now.getTime() - 3 * day);
  const to = new Date(now.getTime() + 45 * day);
  const ymd = (d: Date): string =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
      d.getUTCDate(),
    ).padStart(2, '0')}`;
  // Widen the ISO bounds to whole days so a fixture on the edge isn't excluded.
  const fromIso = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const toIso = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate(), 23, 59, 59, 999),
  );
  return {
    fromYmd: ymd(from),
    toYmd: ymd(to),
    fromIso: fromIso.toISOString(),
    toIso: toIso.toISOString(),
  };
}
