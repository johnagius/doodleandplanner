/**
 * ESPN's public (unofficial, no-key) soccer scoreboard for the World Cup. It
 * updates roughly in real time and — unlike the football-data.org free tier —
 * carries the live match minute and status detail. We use it as the primary
 * live feed and keep football-data as the official-result source + fallback.
 *
 * Everything here is pure and serialisable so it unit-tests against a captured
 * scoreboard payload. The Worker does the fetching; this just parses + merges.
 */
import type { WcLiveScore } from '@dap/shared';

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
  team?: { abbreviation?: string };
}
interface EspnStatusType {
  name?: string;
  state?: string;
  completed?: boolean;
  description?: string;
  shortDetail?: string;
}
interface EspnCompetition {
  status?: { displayClock?: string; type?: EspnStatusType };
  venue?: { fullName?: string };
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
    // Keep football-data's official finished result; otherwise take ESPN live.
    if (f.status === 'FINISHED') {
      out.push(f);
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
      venue: e.venue ?? f.venue ?? null,
      source: 'espn',
    });
  }

  for (const e of espn) {
    if (!used.has(pairKey(e.homeTla, e.awayTla))) out.push(e);
  }
  return out;
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
