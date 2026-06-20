/**
 * Pure assembly for the Cinema's Interval Report — the Half-Time / Full-Time card
 * that recaps the match on the big screen. Reads the frozen live score, the
 * match-event feed and (optional) ESPN team stats; produces a tidy, side-by-side
 * summary. Display-only — it never touches scoring. Own goals follow the project
 * convention: `event.teamTla` is the conceding side, so the goal credits the other.
 */
import {
  findTeam,
  minuteValue,
  type WcMatch,
  type WcMatchEvent,
  type WcMatchSummary,
  type WorldCupState,
} from '@dap/shared';

export type IntervalPhase = 'ht' | 'ft';

export interface IntervalGoal {
  player: string;
  minute: string;
  own: boolean;
  pen: boolean;
}

export interface IntervalSide {
  tla: string;
  name: string;
  flag: string;
  score: number;
  goals: IntervalGoal[];
}

export interface IntervalStat {
  label: string;
  home: number;
  away: number;
  /** Bar width for each side (0–100), already oriented home/away. */
  homePct: number;
  awayPct: number;
  /** True when the values are percentages (shown with a %). */
  pct: boolean;
}

export interface IntervalVerdict {
  /** Which side won, or null for a draw. */
  winner: 'home' | 'away' | null;
  /** Short line, e.g. "England win" | "Honours even". */
  text: string;
}

export interface IntervalStar {
  name: string;
  /** Canonical team code the star belongs to (for colour/orientation). */
  teamTla: string;
  /** Why they stand out, e.g. "Rating 8.4" or "2 goals". */
  note: string;
}

export interface IntervalReportData {
  phase: IntervalPhase;
  /** "Half Time" | "Full Time". */
  label: string;
  home: IntervalSide;
  away: IntervalSide;
  /** A few headline stats (possession, shots, on target); empty before stats land. */
  stats: IntervalStat[];
  /** The result in words — only at Full Time, null at the half. */
  verdict: IntervalVerdict | null;
  /** The standout performer — top match rating, else the leading scorer; null if neither. */
  star: IntervalStar | null;
  /** Broadcast footnote bits (referee, venue, attendance); empty without detail. */
  meta: string[];
}

interface LiveLike {
  status?: string;
  home?: number | null;
  away?: number | null;
  attendance?: number | null;
}

/** Which break we're at, if any. Full Time wins over Half Time. */
export function intervalPhase(
  live: LiveLike | undefined,
  result: WcMatch['result'] | undefined,
): IntervalPhase | null {
  if (result || live?.status === 'FINISHED') return 'ft';
  if (live?.status === 'PAUSED') return 'ht';
  return null;
}

/** The headline stats we surface on the card, in display order. */
const HEADLINE_STATS = ['possession', 'shots', 'onTarget'];

function sideOf(match: WcMatch, tla: string): 'home' | 'away' | null {
  if (tla === match.homeId) return 'home';
  if (tla === match.awayId) return 'away';
  return null;
}

function opposite(s: 'home' | 'away' | null): 'home' | 'away' | null {
  return s === 'home' ? 'away' : s === 'away' ? 'home' : null;
}

/**
 * The match's standout performer: ESPN's highest rated player across both sides
 * when ratings are given, otherwise the leading goalscorer (penalties count, own
 * goals don't). Null when there's nothing to celebrate yet.
 */
function pickStar(
  summary: WcMatchSummary | null,
  events: WcMatchEvent[] | undefined,
): IntervalStar | null {
  let bestRating: { name: string; teamTla: string; rating: number } | null = null;
  for (const l of summary?.leaders ?? []) {
    if (!/rating/i.test(l.category)) continue;
    const rating = Number.parseFloat(l.value);
    if (Number.isNaN(rating)) continue;
    if (!bestRating || rating > bestRating.rating) {
      bestRating = { name: l.name, teamTla: l.teamTla, rating };
    }
  }
  if (bestRating) {
    return {
      name: bestRating.name,
      teamTla: bestRating.teamTla,
      note: `Rating ${bestRating.rating.toFixed(1)}`,
    };
  }

  const tally = new Map<string, { teamTla: string; goals: number }>();
  for (const e of events ?? []) {
    if (e.kind !== 'goal' && e.kind !== 'pen-goal') continue;
    const cur = tally.get(e.player) ?? { teamTla: e.teamTla, goals: 0 };
    cur.goals += 1;
    tally.set(e.player, cur);
  }
  let top: { name: string; teamTla: string; goals: number } | null = null;
  for (const [name, t] of tally) {
    if (!top || t.goals > top.goals) top = { name, teamTla: t.teamTla, goals: t.goals };
  }
  if (top) {
    return {
      name: top.name,
      teamTla: top.teamTla,
      note: `${top.goals} goal${top.goals > 1 ? 's' : ''}`,
    };
  }
  return null;
}

function barPercents(home: number, away: number, pct: boolean): { home: number; away: number } {
  if (pct) {
    const clamp = (n: number) => Math.max(0, Math.min(100, n));
    return { home: clamp(home), away: clamp(away) };
  }
  const tot = home + away;
  if (tot <= 0) return { home: 0, away: 0 };
  return { home: (home / tot) * 100, away: (away / tot) * 100 };
}

/**
 * Assemble the interval card, or `null` when the match isn't at a break. The
 * scoreline is authoritative — the official result at Full Time when present,
 * otherwise the live score; goals are grouped per side from the event feed.
 */
export function buildIntervalReport(
  wc: WorldCupState,
  match: WcMatch,
  live: LiveLike | undefined,
  events: WcMatchEvent[] | undefined,
  summary: WcMatchSummary | null,
): IntervalReportData | null {
  const phase = intervalPhase(live, match.result);
  if (!phase) return null;

  const home = findTeam(wc, match.homeId);
  const away = findTeam(wc, match.awayId);
  const score = match.result ?? { home: live?.home ?? 0, away: live?.away ?? 0 };

  const homeGoals: IntervalGoal[] = [];
  const awayGoals: IntervalGoal[] = [];
  const sorted = [...(events ?? [])].sort((a, b) => minuteValue(a.minute) - minuteValue(b.minute));
  for (const e of sorted) {
    if (e.kind !== 'goal' && e.kind !== 'pen-goal' && e.kind !== 'own-goal') continue;
    const credited =
      e.kind === 'own-goal' ? opposite(sideOf(match, e.teamTla)) : sideOf(match, e.teamTla);
    if (!credited) continue;
    const goal: IntervalGoal = {
      player: e.player,
      minute: e.minute,
      own: e.kind === 'own-goal',
      pen: e.kind === 'pen-goal',
    };
    (credited === 'home' ? homeGoals : awayGoals).push(goal);
  }

  const stats: IntervalStat[] = [];
  for (const key of HEADLINE_STATS) {
    const row = summary?.stats.find((s) => s.key === key);
    if (!row || row.home == null || row.away == null) continue;
    const bars = barPercents(row.home, row.away, row.pct);
    stats.push({
      label: row.label,
      home: row.home,
      away: row.away,
      homePct: bars.home,
      awayPct: bars.away,
      pct: row.pct,
    });
  }

  const meta: string[] = [];
  if (summary?.referee) meta.push(`🧑‍⚖️ ${summary.referee}`);
  const place = summary?.venue
    ? summary.venueCity
      ? `${summary.venue}, ${summary.venueCity}`
      : summary.venue
    : (summary?.venueCity ?? null);
  if (place) meta.push(`📍 ${place}`);
  if (live?.attendance && live.attendance > 0) {
    meta.push(`👥 ${live.attendance.toLocaleString('en-GB')}`);
  }

  const homeName = home?.name ?? match.homeId ?? 'TBD';
  const awayName = away?.name ?? match.awayId ?? 'TBD';
  let verdict: IntervalVerdict | null = null;
  if (phase === 'ft') {
    if (score.home > score.away) verdict = { winner: 'home', text: `${homeName} win` };
    else if (score.away > score.home) verdict = { winner: 'away', text: `${awayName} win` };
    else verdict = { winner: null, text: 'Honours even' };
  }

  return {
    phase,
    label: phase === 'ft' ? 'Full Time' : 'Half Time',
    home: {
      tla: match.homeId ?? '',
      name: homeName,
      flag: home?.flag ?? '⚽',
      score: score.home,
      goals: homeGoals,
    },
    away: {
      tla: match.awayId ?? '',
      name: awayName,
      flag: away?.flag ?? '⚽',
      score: score.away,
      goals: awayGoals,
    },
    stats,
    verdict,
    star: pickStar(summary, events),
    meta,
  };
}

/** "Kane (pen) 67'", "Mbappé 90'+2'", "Maguire (OG) 31'". */
export function goalLabel(g: IntervalGoal): string {
  const tag = g.own ? ' (OG)' : g.pen ? ' (pen)' : '';
  return `${g.player}${tag} ${g.minute}`.trim();
}

/** Display value for a stat side, e.g. "58%" or "7". */
export function statValue(stat: IntervalStat, side: 'home' | 'away'): string {
  const n = side === 'home' ? stat.home : stat.away;
  return stat.pct ? `${n}%` : `${n}`;
}
