/**
 * World Cup predictions — a self-contained tournament engine.
 *
 * Friends predict the scoreline of every match. After each game the organiser
 * enters the real result; points are awarded for how close each guess was
 * (exact score scores most, a correct margin next, the right winner next, then
 * a small consolation for being a goal or two off). Once the group results are
 * in, the knockout bracket populates itself from the standings, and the same
 * predict-and-score loop continues all the way to the final.
 *
 * Everything here is **pure, immutable and serialisable** so it can live inside
 * a {@link RoomState} and sync through the same Repository as the rest of the
 * app. The web UI only ever renders this state and calls these helpers.
 */
import { generateId } from './ids.js';
import { toMs } from './time.js';
import type { ISODateTime } from './types.js';

/** Tournament stages, ordered from earliest to latest. */
export type WcStage = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final';

/** A participating national team. */
export interface WcTeam {
  /** Stable short code, e.g. "BRA". Also used as the team id. */
  id: string;
  name: string;
  /** Emoji flag shown in the UI. */
  flag: string;
  /** Group letter "A".."L". */
  group: string;
}

/**
 * How a knockout slot is filled once results are known. Group matches don't use
 * a source (their teams are fixed); every knockout slot does.
 */
export interface WcSource {
  kind: 'winner-group' | 'runner-group' | 'best-third' | 'winner-match' | 'loser-match';
  /** Group letter for `winner-group` / `runner-group`. */
  group?: string;
  /** 1-based rank for `best-third` (1 = best third-placed team overall). */
  thirdRank?: number;
  /** Referenced match id for `winner-match` / `loser-match`. */
  matchId?: string;
}

/** The real-world result of a match, entered by the organiser. */
export interface WcResult {
  home: number;
  away: number;
  /**
   * For a drawn knockout match: the id of the team that advanced (won on
   * penalties). Required when `home === away` and the stage isn't the group
   * stage; ignored otherwise.
   */
  advancesId?: string;
}

export interface WcMatch {
  id: string;
  stage: WcStage;
  /** Group letter for group-stage matches. */
  group?: string;
  /** Matchday 1..3 for group-stage matches. */
  matchday?: number;
  /** Global ordering, used for stable display and bracket layout. */
  order: number;
  kickoff: ISODateTime;
  venue?: string;
  /** Resolved home team id (always set for group matches; set once a knockout
   * slot is populated from results). */
  homeId?: string;
  awayId?: string;
  /** How the home/away slot is filled (knockout matches only). */
  homeSource?: WcSource;
  awaySource?: WcSource;
  result?: WcResult;
}

/** One person's predicted scoreline for one match. */
export interface WcPrediction {
  matchId: string;
  predictorId: string;
  home: number;
  away: number;
  updatedAt: ISODateTime;
}

/** A person making predictions (no login — just a name). */
export interface WcPredictor {
  id: string;
  name: string;
}

/** The complete, serialisable World Cup state. */
export interface WorldCupState {
  /** Season label, e.g. "2026". */
  season: string;
  title: string;
  /** Seed-data version, bumped when teams/fixtures change so stale boards can be
   * refreshed in place (see {@link WC_SEED_VERSION}). Absent ⇒ version 1. */
  version?: number;
  teams: WcTeam[];
  matches: WcMatch[];
  predictors: WcPredictor[];
  predictions: WcPrediction[];
  createdAt: ISODateTime;
}

/** Bump when the seeded teams or fixtures change; boards below this re-seed. */
export const WC_SEED_VERSION = 2;

// --- Scoring ---------------------------------------------------------------

/** Points awarded per prediction quality. Tunable; surfaced in the UI legend. */
export const WC_POINTS = {
  /** Spot-on scoreline. */
  exact: 5,
  /** Correct goal difference / margin (e.g. predicted 2-1, actual 3-2). */
  goalDiff: 4,
  /** Correct winner or a draw, but wrong margin. */
  outcome: 3,
  /** Wrong outcome but only one goal off in total. */
  close1: 2,
  /** Wrong outcome but two goals off in total. */
  close2: 1,
  /** Way off. */
  miss: 0,
} as const;

export type WcScoreCategory = 'exact' | 'goalDiff' | 'outcome' | 'close' | 'miss';

export interface WcScoreResult {
  points: number;
  category: WcScoreCategory;
}

const sign = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0);

/**
 * Score a single prediction against the actual scoreline. Higher = closer:
 * exact > correct margin > correct winner > near-miss > miss.
 */
export function scorePrediction(
  pred: { home: number; away: number },
  actual: { home: number; away: number },
): WcScoreResult {
  if (pred.home === actual.home && pred.away === actual.away) {
    return { points: WC_POINTS.exact, category: 'exact' };
  }
  const pd = pred.home - pred.away;
  const ad = actual.home - actual.away;
  // Equal goal difference implies the same winner/draw, so this also rewards a
  // correctly-called draw with the wrong scoreline (e.g. 1-1 vs 2-2).
  if (pd === ad) return { points: WC_POINTS.goalDiff, category: 'goalDiff' };
  if (sign(pd) === sign(ad)) return { points: WC_POINTS.outcome, category: 'outcome' };
  const err = Math.abs(pred.home - actual.home) + Math.abs(pred.away - actual.away);
  if (err === 1) return { points: WC_POINTS.close1, category: 'close' };
  if (err === 2) return { points: WC_POINTS.close2, category: 'close' };
  return { points: WC_POINTS.miss, category: 'miss' };
}

export const WC_SCORE_LABEL: Record<WcScoreCategory, string> = {
  exact: 'Spot on!',
  goalDiff: 'Right margin',
  outcome: 'Right result',
  close: 'So close',
  miss: 'Missed',
};

// --- Lookups & helpers -----------------------------------------------------

const STAGE_ORDER: Record<WcStage, number> = {
  group: 0,
  r32: 1,
  r16: 2,
  qf: 3,
  sf: 4,
  third: 5,
  final: 6,
};

export const WC_STAGE_LABEL: Record<WcStage, string> = {
  group: 'Group stage',
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarter-finals',
  sf: 'Semi-finals',
  third: 'Third-place play-off',
  final: 'Final',
};

export function findTeam(state: WorldCupState, teamId: string | undefined): WcTeam | undefined {
  if (!teamId) return undefined;
  return state.teams.find((t) => t.id === teamId);
}

export function findMatch(state: WorldCupState, matchId: string): WcMatch | undefined {
  return state.matches.find((m) => m.id === matchId);
}

export function findPredictor(
  state: WorldCupState,
  predictorId: string | undefined,
): WcPredictor | undefined {
  if (!predictorId) return undefined;
  return state.predictors.find((p) => p.id === predictorId);
}

/** Human placeholder for an unresolved knockout slot, e.g. "Winner Group A". */
export function sourceLabel(source: WcSource | undefined): string {
  if (!source) return 'TBD';
  switch (source.kind) {
    case 'winner-group':
      return `Winner Group ${source.group}`;
    case 'runner-group':
      return `Runner-up Group ${source.group}`;
    case 'best-third':
      return `3rd place #${source.thirdRank}`;
    case 'winner-match':
      return `Winner of ${matchShortLabel(source.matchId)}`;
    case 'loser-match':
      return `Loser of ${matchShortLabel(source.matchId)}`;
    default:
      return 'TBD';
  }
}

function matchShortLabel(matchId: string | undefined): string {
  if (!matchId) return 'TBD';
  const [stage, n] = matchId.split('-');
  const map: Record<string, string> = { r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF' };
  return `${map[stage ?? ''] ?? (stage ?? '').toUpperCase()}${n ? ` ${n}` : ''}`;
}

/** Resolved display name for a match slot — the team, or its placeholder. */
export function slotLabel(
  state: WorldCupState,
  teamId: string | undefined,
  source: WcSource | undefined,
): string {
  const team = findTeam(state, teamId);
  if (team) return team.name;
  return sourceLabel(source);
}

/** True once a match can no longer be predicted: it has kicked off or already
 * has a result. (A mistaken pick can still be *cleared* after kickoff — see
 * {@link clearPrediction} — just not placed or changed.) */
export function isMatchLocked(match: WcMatch, now: Date = new Date()): boolean {
  if (match.result) return true;
  return now.getTime() >= toMs(match.kickoff);
}

/** True when both teams of a match are known (so it can be predicted). */
export function isMatchReady(match: WcMatch): boolean {
  return !!match.homeId && !!match.awayId;
}

/** Kick-off times are shown in Malta's timezone, and the calendar groups by
 * Malta days. (Most 2026 matches are in North America, so Malta is the evening
 * after.) */
export const WC_TIMEZONE = 'Europe/Malta';

const maltaDayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: WC_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The Malta-local calendar day ("YYYY-MM-DD") for an instant. */
export function dayKeyOf(date: Date): string {
  return maltaDayFmt.format(date);
}

/** The Malta-local calendar day a match kicks off. */
export function matchDateKey(match: WcMatch): string {
  return dayKeyOf(new Date(match.kickoff));
}

/** Sorted unique tournament days that have at least one match. */
export function tournamentDays(state: WorldCupState): string[] {
  const days = new Set(state.matches.map(matchDateKey));
  return [...days].sort();
}

/** Matches kicking off on a given UTC day, in chronological then bracket order. */
export function matchesOn(state: WorldCupState, dateKey: string): WcMatch[] {
  return state.matches
    .filter((m) => matchDateKey(m) === dateKey)
    .sort((a, b) => toMs(a.kickoff) - toMs(b.kickoff) || a.order - b.order);
}

/**
 * The day the UI should open on: the day of the next match that hasn't kicked
 * off yet, so you land on matches you can still predict. Falls back to the last
 * day once everything has started.
 */
export function defaultDay(state: WorldCupState, now: Date = new Date()): string {
  const days = tournamentDays(state);
  if (days.length === 0) return dayKeyOf(now);
  const t = now.getTime();
  const nextUp = [...state.matches]
    .filter((m) => toMs(m.kickoff) > t)
    .sort((a, b) => toMs(a.kickoff) - toMs(b.kickoff))[0];
  return nextUp ? matchDateKey(nextUp) : days[days.length - 1]!;
}

export function predictionFor(
  state: WorldCupState,
  matchId: string,
  predictorId: string,
): WcPrediction | undefined {
  return state.predictions.find((p) => p.matchId === matchId && p.predictorId === predictorId);
}

// --- Predictors ------------------------------------------------------------

/** The four friends the board starts with. The owner can add more. */
export const DEFAULT_PREDICTOR_NAMES = ['John', 'Daniel', 'Noel', 'Saviour'] as const;

export function addPredictor(
  state: WorldCupState,
  name: string,
  now: () => Date = () => new Date(),
): WorldCupState {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('A name is required');
  if (state.predictors.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('That name is already on the board');
  }
  void now;
  return { ...state, predictors: [...state.predictors, { id: generateId('wcp'), name: trimmed }] };
}

export function renamePredictor(
  state: WorldCupState,
  predictorId: string,
  name: string,
): WorldCupState {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('A name is required');
  return {
    ...state,
    predictors: state.predictors.map((p) => (p.id === predictorId ? { ...p, name: trimmed } : p)),
  };
}

/** Remove a predictor and all their predictions. */
export function removePredictor(state: WorldCupState, predictorId: string): WorldCupState {
  return {
    ...state,
    predictors: state.predictors.filter((p) => p.id !== predictorId),
    predictions: state.predictions.filter((p) => p.predictorId !== predictorId),
  };
}

// --- Predictions -----------------------------------------------------------

export interface SetPredictionInput {
  matchId: string;
  predictorId: string;
  home: number;
  away: number;
  now?: () => Date;
}

/** Cast or update a prediction. Throws if the match is locked or not ready. */
export function setPrediction(state: WorldCupState, input: SetPredictionInput): WorldCupState {
  const match = findMatch(state, input.matchId);
  if (!match) throw new Error('Unknown match');
  if (!findPredictor(state, input.predictorId)) throw new Error('Unknown predictor');
  if (!isMatchReady(match)) throw new Error('Both teams must be known before predicting');
  const now = (input.now ?? (() => new Date()))();
  if (isMatchLocked(match, now)) throw new Error('This match is locked');
  const home = normalizeGoals(input.home);
  const away = normalizeGoals(input.away);

  const others = state.predictions.filter(
    (p) => !(p.matchId === input.matchId && p.predictorId === input.predictorId),
  );
  const prediction: WcPrediction = {
    matchId: input.matchId,
    predictorId: input.predictorId,
    home,
    away,
    updatedAt: now.toISOString(),
  };
  return { ...state, predictions: [...others, prediction] };
}

/** Remove a predictor's pick for a match (e.g. an accidental entry). Allowed
 * even after kickoff — to fix a mistake — but not once the result is recorded. */
export function clearPrediction(
  state: WorldCupState,
  matchId: string,
  predictorId: string,
): WorldCupState {
  const match = findMatch(state, matchId);
  if (match?.result) throw new Error('This match is locked');
  return {
    ...state,
    predictions: state.predictions.filter(
      (p) => !(p.matchId === matchId && p.predictorId === predictorId),
    ),
  };
}

function normalizeGoals(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(99, Math.round(n));
}

// --- Results & bracket population -----------------------------------------

export interface SetResultInput {
  matchId: string;
  home: number;
  away: number;
  /** Who advanced, for a drawn knockout match. */
  advancesId?: string;
}

/**
 * Record (or update) a match result and re-populate the knockout bracket from
 * the latest standings. Pure: returns a new state.
 */
export function setResult(state: WorldCupState, input: SetResultInput): WorldCupState {
  const match = findMatch(state, input.matchId);
  if (!match) throw new Error('Unknown match');
  const home = normalizeGoals(input.home);
  const away = normalizeGoals(input.away);

  let advancesId = input.advancesId;
  if (match.stage !== 'group' && home === away) {
    if (!advancesId || (advancesId !== match.homeId && advancesId !== match.awayId)) {
      throw new Error('A knockout draw needs a team to advance (penalty winner)');
    }
  } else {
    advancesId = undefined;
  }

  const result: WcResult = { home, away, advancesId };
  const matches = state.matches.map((m) => (m.id === input.matchId ? { ...m, result } : m));
  return populateBracket({ ...state, matches });
}

/** Clear a match result and re-populate downstream slots. */
export function clearResult(state: WorldCupState, matchId: string): WorldCupState {
  const matches = state.matches.map((m) => {
    if (m.id !== matchId) return m;
    const { result: _drop, ...rest } = m;
    return rest;
  });
  return populateBracket({ ...state, matches });
}

/**
 * A live/finished score for one match from an external feed (football-data.org).
 * Teams are identified by their three-letter code, which matches our team ids.
 */
export interface WcLiveScore {
  homeTla: string;
  awayTla: string;
  /** Feed status: TIMED | SCHEDULED | IN_PLAY | PAUSED | FINISHED | … */
  status: string;
  /** Live minute, when the feed provides it (paid feature; often absent). */
  minute?: number | null;
  home: number | null;
  away: number | null;
  /** 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null — the advancing side for KO ties. */
  winner?: string | null;
}

/**
 * Apply finished scores from the feed to any match that doesn't already have a
 * result, so results fill in automatically (no manual organiser entry needed).
 * Pure and idempotent: only empty results are filled, and the bracket
 * re-populates from them.
 */
export function applyLiveResults(state: WorldCupState, scores: WcLiveScore[]): WorldCupState {
  let next = state;
  for (const sc of scores) {
    if (sc.status !== 'FINISHED' || sc.home == null || sc.away == null) continue;
    const match = next.matches.find(
      (m) => m.homeId === sc.homeTla && m.awayId === sc.awayTla && !m.result,
    );
    if (!match) continue;
    let advancesId: string | undefined;
    if (match.stage !== 'group' && sc.home === sc.away) {
      // Knockout tie level after normal time → the feed's winner advanced (pens).
      advancesId =
        sc.winner === 'HOME_TEAM'
          ? match.homeId
          : sc.winner === 'AWAY_TEAM'
            ? match.awayId
            : undefined;
      if (!advancesId) continue; // can't tell who advanced yet — leave it
    }
    next = setResult(next, { matchId: match.id, home: sc.home, away: sc.away, advancesId });
  }
  return next;
}

/** Winner team id of a played match, or undefined if drawn-without-advance / unplayed. */
export function winnerOf(match: WcMatch): string | undefined {
  if (!match.result || !match.homeId || !match.awayId) return undefined;
  const { home, away, advancesId } = match.result;
  if (home > away) return match.homeId;
  if (away > home) return match.awayId;
  return advancesId; // draw → penalty winner (knockouts only)
}

/** Loser team id of a played knockout match (used by the third-place play-off). */
export function loserOf(match: WcMatch): string | undefined {
  if (!match.result || !match.homeId || !match.awayId) return undefined;
  const w = winnerOf(match);
  if (!w) return undefined;
  return w === match.homeId ? match.awayId : match.homeId;
}

export interface WcStandingRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

function emptyRow(teamId: string): WcStandingRow {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0,
  };
}

/** Standings for one group, best team first. */
export function groupStandings(state: WorldCupState, group: string): WcStandingRow[] {
  const teams = state.teams.filter((t) => t.group === group);
  const rows = new Map(teams.map((t) => [t.id, emptyRow(t.id)]));
  for (const m of state.matches) {
    if (m.stage !== 'group' || m.group !== group || !m.result || !m.homeId || !m.awayId) continue;
    const h = rows.get(m.homeId);
    const a = rows.get(m.awayId);
    if (!h || !a) continue;
    const { home, away } = m.result;
    h.played++;
    a.played++;
    h.goalsFor += home;
    h.goalsAgainst += away;
    a.goalsFor += away;
    a.goalsAgainst += home;
    if (home > away) {
      h.won++;
      a.lost++;
      h.points += 3;
    } else if (away > home) {
      a.won++;
      h.lost++;
      a.points += 3;
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
    }
  }
  for (const r of rows.values()) r.goalDiff = r.goalsFor - r.goalsAgainst;
  return [...rows.values()].sort(compareStanding(state));
}

/** Deterministic ranking: points, goal difference, goals for, then name. */
function compareStanding(state: WorldCupState) {
  return (a: WcStandingRow, b: WcStandingRow): number => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    const an = findTeam(state, a.teamId)?.name ?? a.teamId;
    const bn = findTeam(state, b.teamId)?.name ?? b.teamId;
    return an.localeCompare(bn);
  };
}

/** True when all six matches of a group have a result. */
export function groupComplete(state: WorldCupState, group: string): boolean {
  const groupMatches = state.matches.filter((m) => m.stage === 'group' && m.group === group);
  return groupMatches.length > 0 && groupMatches.every((m) => !!m.result);
}

export function allGroupsComplete(state: WorldCupState): boolean {
  return state.matches.filter((m) => m.stage === 'group').every((m) => !!m.result);
}

/**
 * The third-placed teams from every group, ranked against each other. Only
 * meaningful (and used to fill the bracket) once every group is complete.
 */
export function thirdPlacedRanking(state: WorldCupState): WcStandingRow[] {
  const groups = [...new Set(state.teams.map((t) => t.group))].sort();
  const thirds = groups
    .map((g) => groupStandings(state, g)[2])
    .filter((r): r is WcStandingRow => !!r);
  return thirds.sort(compareStanding(state));
}

/** Resolve a single knockout source to a team id, or undefined if not yet known. */
function resolveSource(state: WorldCupState, source: WcSource | undefined): string | undefined {
  if (!source) return undefined;
  switch (source.kind) {
    case 'winner-group':
      return source.group && groupComplete(state, source.group)
        ? groupStandings(state, source.group)[0]?.teamId
        : undefined;
    case 'runner-group':
      return source.group && groupComplete(state, source.group)
        ? groupStandings(state, source.group)[1]?.teamId
        : undefined;
    case 'best-third':
      return allGroupsComplete(state)
        ? thirdPlacedRanking(state)[(source.thirdRank ?? 1) - 1]?.teamId
        : undefined;
    case 'winner-match': {
      const m = source.matchId ? findMatch(state, source.matchId) : undefined;
      return m ? winnerOf(m) : undefined;
    }
    case 'loser-match': {
      const m = source.matchId ? findMatch(state, source.matchId) : undefined;
      return m ? loserOf(m) : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Fill every knockout slot from the current results. Idempotent: clearing an
 * earlier result and re-running naturally empties the slots that depended on it.
 * Resolves in stage order so each round sees the previous round's winners.
 */
export function populateBracket(state: WorldCupState): WorldCupState {
  // Work on a shallow-cloned, stage-ordered copy so winner-match lookups within
  // a single pass observe freshly-resolved earlier rounds.
  const ordered = [...state.matches].sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]);
  const working: WcMatch[] = [];
  const byId = new Map<string, WcMatch>();
  const view: WorldCupState = { ...state, matches: working };
  for (const m of ordered) {
    let next = m;
    if (m.homeSource || m.awaySource) {
      const homeId = m.homeSource ? resolveSource(view, m.homeSource) : m.homeId;
      const awayId = m.awaySource ? resolveSource(view, m.awaySource) : m.awayId;
      // If a knockout slot loses its team (an upstream result was cleared), drop
      // a now-orphaned result so standings/leaderboard stay consistent.
      const lostTeam = (!homeId && !!m.homeId) || (!awayId && !!m.awayId);
      next = { ...m, homeId, awayId, result: lostTeam ? undefined : m.result };
    }
    working.push(next);
    byId.set(next.id, next);
  }
  // Restore original storage order (by `order`) for stable rendering.
  working.sort((a, b) => a.order - b.order);
  return { ...state, matches: working };
}

// --- Leaderboard -----------------------------------------------------------

export interface WcLeaderRow {
  predictorId: string;
  name: string;
  points: number;
  /** Matches this person predicted that now have a result. */
  scored: number;
  exact: number;
  /** Correct winner/draw (any of exact / margin / outcome). */
  correctResults: number;
}

/**
 * Per-predictor totals, best first. With `resultedBefore` (a Malta day key) only
 * results from matches *before* that day count — used to compute prior standings
 * for rank movement.
 */
export function leaderboard(
  state: WorldCupState,
  opts?: { resultedBefore?: string },
): WcLeaderRow[] {
  const before = opts?.resultedBefore;
  const rows = new Map<string, WcLeaderRow>(
    state.predictors.map((p) => [
      p.id,
      { predictorId: p.id, name: p.name, points: 0, scored: 0, exact: 0, correctResults: 0 },
    ]),
  );
  for (const match of state.matches) {
    if (!match.result) continue;
    if (before && matchDateKey(match) >= before) continue;
    for (const pred of state.predictions) {
      if (pred.matchId !== match.id) continue;
      const row = rows.get(pred.predictorId);
      if (!row) continue;
      const { points, category } = scorePrediction(pred, match.result);
      row.points += points;
      row.scored++;
      if (category === 'exact') row.exact++;
      if (category === 'exact' || category === 'goalDiff' || category === 'outcome') {
        row.correctResults++;
      }
    }
  }
  return [...rows.values()].sort(
    (a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name),
  );
}

/** The Malta day of the most recently-resulted match, or null if none played. */
export function latestResultDay(state: WorldCupState): string | null {
  let day: string | null = null;
  for (const m of state.matches) {
    if (!m.result) continue;
    const d = matchDateKey(m);
    if (day === null || d > day) day = d;
  }
  return day;
}

export interface WcLeaderRowMoved extends WcLeaderRow {
  /** 1-based position. */
  rank: number;
  /** Places climbed since before the latest result day (+ up, − down, 0 same). */
  movement: number;
}

/** Leaderboard with rank + movement since the last day's results landed. */
export function leaderboardWithMovement(state: WorldCupState): WcLeaderRowMoved[] {
  const current = leaderboard(state);
  const lastDay = latestResultDay(state);
  const prev = lastDay ? leaderboard(state, { resultedBefore: lastDay }) : current;
  const hasPrev = !!lastDay && prev.some((r) => r.scored > 0);
  const prevRank = new Map(prev.map((r, i) => [r.predictorId, i + 1]));
  return current.map((r, i) => {
    const rank = i + 1;
    const movement = hasPrev ? (prevRank.get(r.predictorId) ?? rank) - rank : 0;
    return { ...r, rank, movement };
  });
}

/** Points each predictor scored on a single Malta day, best first. */
export function dayPoints(
  state: WorldCupState,
  dayKey: string,
): Array<{ predictorId: string; name: string; points: number }> {
  const pts = new Map(state.predictors.map((p) => [p.id, 0]));
  for (const m of state.matches) {
    if (!m.result || matchDateKey(m) !== dayKey) continue;
    for (const pred of state.predictions) {
      if (pred.matchId !== m.id) continue;
      const cur = pts.get(pred.predictorId);
      if (cur === undefined) continue;
      pts.set(pred.predictorId, cur + scorePrediction(pred, m.result).points);
    }
  }
  return state.predictors
    .map((p) => ({ predictorId: p.id, name: p.name, points: pts.get(p.id) ?? 0 }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

/** Top scorer of the most recent result day (null until someone scores). */
export function dayChampion(
  state: WorldCupState,
): { day: string; name: string; points: number } | null {
  const day = latestResultDay(state);
  if (!day) return null;
  const top = dayPoints(state, day)[0];
  if (!top || top.points === 0) return null;
  return { day, name: top.name, points: top.points };
}

/** Score categories of a predictor's last `n` scored picks, most recent first. */
export function playerForm(state: WorldCupState, predictorId: string, n = 5): WcScoreCategory[] {
  const scored: Array<{ kickoff: string; order: number; cat: WcScoreCategory }> = [];
  for (const m of state.matches) {
    if (!m.result) continue;
    const pred = state.predictions.find((p) => p.matchId === m.id && p.predictorId === predictorId);
    if (!pred) continue;
    scored.push({
      kickoff: m.kickoff,
      order: m.order,
      cat: scorePrediction(pred, m.result).category,
    });
  }
  scored.sort((a, b) => toMs(b.kickoff) - toMs(a.kickoff) || b.order - a.order);
  return scored.slice(0, n).map((s) => s.cat);
}

export interface WcPlayerStats {
  points: number;
  scored: number;
  exact: number;
  correctResults: number;
  best?: { matchId: string; points: number };
  worst?: { matchId: string; points: number };
}

/** A predictor's tally plus their best and worst scored picks. */
export function playerStats(state: WorldCupState, predictorId: string): WcPlayerStats {
  const s: WcPlayerStats = { points: 0, scored: 0, exact: 0, correctResults: 0 };
  for (const m of state.matches) {
    if (!m.result) continue;
    const pred = state.predictions.find((p) => p.matchId === m.id && p.predictorId === predictorId);
    if (!pred) continue;
    const { points, category } = scorePrediction(pred, m.result);
    s.points += points;
    s.scored++;
    if (category === 'exact') s.exact++;
    if (category === 'exact' || category === 'goalDiff' || category === 'outcome')
      s.correctResults++;
    if (!s.best || points > s.best.points) s.best = { matchId: m.id, points };
    if (!s.worst || points < s.worst.points) s.worst = { matchId: m.id, points };
  }
  return s;
}

export interface WcBadge {
  id: string;
  emoji: string;
  label: string;
}

/** Fun, deterministic achievements a predictor has earned so far. */
export function badgesFor(state: WorldCupState, predictorId: string): WcBadge[] {
  const s = playerStats(state, predictorId);
  const badges: WcBadge[] = [];
  if (s.exact >= 5) badges.push({ id: 'oracle', emoji: '🔮', label: 'Oracle — 5+ exact scores' });
  else if (s.exact >= 3)
    badges.push({ id: 'eagle-eye', emoji: '🎯', label: 'Eagle eye — 3+ exact scores' });
  if (s.points >= 50) badges.push({ id: 'centurion', emoji: '💯', label: '50+ points' });
  const form = playerForm(state, predictorId, 3);
  if (
    form.length === 3 &&
    form.every((c) => c === 'exact' || c === 'goalDiff' || c === 'outcome')
  ) {
    badges.push({ id: 'on-form', emoji: '🔥', label: 'On fire — last 3 results right' });
  }
  const resulted = state.matches.filter((m) => m.result);
  const allIn =
    resulted.length >= 3 &&
    resulted.every((m) =>
      state.predictions.some((p) => p.matchId === m.id && p.predictorId === predictorId),
    );
  if (allIn) badges.push({ id: 'all-in', emoji: '🎟️', label: 'All in — predicted every match' });
  return badges;
}

export interface WcHeadToHead {
  rows: Array<{ matchId: string; aPoints: number; bPoints: number }>;
  aTotal: number;
  bTotal: number;
}

/** Compare two predictors across every resolved match either of them predicted. */
export function headToHead(state: WorldCupState, aId: string, bId: string): WcHeadToHead {
  const rows: WcHeadToHead['rows'] = [];
  let aTotal = 0;
  let bTotal = 0;
  for (const m of state.matches) {
    if (!m.result) continue;
    const pa = state.predictions.find((p) => p.matchId === m.id && p.predictorId === aId);
    const pb = state.predictions.find((p) => p.matchId === m.id && p.predictorId === bId);
    if (!pa && !pb) continue;
    const aPoints = pa ? scorePrediction(pa, m.result).points : 0;
    const bPoints = pb ? scorePrediction(pb, m.result).points : 0;
    aTotal += aPoints;
    bTotal += bPoints;
    rows.push({ matchId: m.id, aPoints, bPoints });
  }
  return { rows, aTotal, bTotal };
}

/** How many matches now have a result (for progress UI). */
export function playedCount(state: WorldCupState): number {
  return state.matches.filter((m) => !!m.result).length;
}

// --- Seeding ---------------------------------------------------------------

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

/**
 * The real 2026 World Cup field from the final draw (5 December 2025): 48 teams,
 * four to a group, in their drawn order. The short code doubles as the team id.
 */
const SEED_TEAMS: Array<[string, string, string]> = [
  // Group A
  ['MEX', 'Mexico', '🇲🇽'],
  ['RSA', 'South Africa', '🇿🇦'],
  ['KOR', 'South Korea', '🇰🇷'],
  ['CZE', 'Czechia', '🇨🇿'],
  // Group B
  ['CAN', 'Canada', '🇨🇦'],
  ['BIH', 'Bosnia and Herzegovina', '🇧🇦'],
  ['QAT', 'Qatar', '🇶🇦'],
  ['SUI', 'Switzerland', '🇨🇭'],
  // Group C
  ['BRA', 'Brazil', '🇧🇷'],
  ['MAR', 'Morocco', '🇲🇦'],
  ['HAI', 'Haiti', '🇭🇹'],
  ['SCO', 'Scotland', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'],
  // Group D
  ['USA', 'United States', '🇺🇸'],
  ['PAR', 'Paraguay', '🇵🇾'],
  ['AUS', 'Australia', '🇦🇺'],
  ['TUR', 'Türkiye', '🇹🇷'],
  // Group E
  ['GER', 'Germany', '🇩🇪'],
  ['CUW', 'Curaçao', '🇨🇼'],
  ['CIV', "Côte d'Ivoire", '🇨🇮'],
  ['ECU', 'Ecuador', '🇪🇨'],
  // Group F
  ['NED', 'Netherlands', '🇳🇱'],
  ['JPN', 'Japan', '🇯🇵'],
  ['SWE', 'Sweden', '🇸🇪'],
  ['TUN', 'Tunisia', '🇹🇳'],
  // Group G
  ['BEL', 'Belgium', '🇧🇪'],
  ['EGY', 'Egypt', '🇪🇬'],
  ['IRN', 'Iran', '🇮🇷'],
  ['NZL', 'New Zealand', '🇳🇿'],
  // Group H
  ['ESP', 'Spain', '🇪🇸'],
  ['CPV', 'Cape Verde', '🇨🇻'],
  ['KSA', 'Saudi Arabia', '🇸🇦'],
  ['URU', 'Uruguay', '🇺🇾'],
  // Group I
  ['FRA', 'France', '🇫🇷'],
  ['SEN', 'Senegal', '🇸🇳'],
  ['IRQ', 'Iraq', '🇮🇶'],
  ['NOR', 'Norway', '🇳🇴'],
  // Group J
  ['ARG', 'Argentina', '🇦🇷'],
  ['ALG', 'Algeria', '🇩🇿'],
  ['AUT', 'Austria', '🇦🇹'],
  ['JOR', 'Jordan', '🇯🇴'],
  // Group K
  ['POR', 'Portugal', '🇵🇹'],
  ['COD', 'DR Congo', '🇨🇩'],
  ['UZB', 'Uzbekistan', '🇺🇿'],
  ['COL', 'Colombia', '🇨🇴'],
  // Group L
  ['ENG', 'England', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'],
  ['CRO', 'Croatia', '🇭🇷'],
  ['GHA', 'Ghana', '🇬🇭'],
  ['PAN', 'Panama', '🇵🇦'],
];

/**
 * The official 2026 group-stage schedule. Each entry is
 * [group, matchday, homeId, awayId, kickoff (UTC ISO), host city]. Kick-offs are
 * stored as true UTC instants and rendered in Malta time by the UI.
 */
const GROUP_FIXTURES: Array<[string, number, string, string, string, string]> = [
  // Group A
  ['A', 1, 'MEX', 'RSA', '2026-06-11T19:00:00Z', 'Mexico City'],
  ['A', 1, 'KOR', 'CZE', '2026-06-12T02:00:00Z', 'Guadalajara'],
  ['A', 2, 'CZE', 'RSA', '2026-06-18T16:00:00Z', 'Atlanta'],
  ['A', 2, 'MEX', 'KOR', '2026-06-19T01:00:00Z', 'Guadalajara'],
  ['A', 3, 'CZE', 'MEX', '2026-06-25T01:00:00Z', 'Mexico City'],
  ['A', 3, 'RSA', 'KOR', '2026-06-25T01:00:00Z', 'Monterrey'],
  // Group B
  ['B', 1, 'CAN', 'BIH', '2026-06-12T19:00:00Z', 'Toronto'],
  ['B', 1, 'QAT', 'SUI', '2026-06-13T19:00:00Z', 'Bay Area'],
  ['B', 2, 'SUI', 'BIH', '2026-06-18T19:00:00Z', 'Los Angeles'],
  ['B', 2, 'CAN', 'QAT', '2026-06-18T22:00:00Z', 'Vancouver'],
  ['B', 3, 'SUI', 'CAN', '2026-06-24T19:00:00Z', 'Vancouver'],
  ['B', 3, 'BIH', 'QAT', '2026-06-24T19:00:00Z', 'Seattle'],
  // Group C
  ['C', 1, 'BRA', 'MAR', '2026-06-13T22:00:00Z', 'New York New Jersey'],
  ['C', 1, 'HAI', 'SCO', '2026-06-14T01:00:00Z', 'Boston'],
  ['C', 2, 'SCO', 'MAR', '2026-06-19T22:00:00Z', 'Boston'],
  ['C', 2, 'BRA', 'HAI', '2026-06-20T00:30:00Z', 'Philadelphia'],
  ['C', 3, 'SCO', 'BRA', '2026-06-24T22:00:00Z', 'Miami'],
  ['C', 3, 'MAR', 'HAI', '2026-06-24T22:00:00Z', 'Atlanta'],
  // Group D
  ['D', 1, 'USA', 'PAR', '2026-06-13T01:00:00Z', 'Los Angeles'],
  ['D', 1, 'AUS', 'TUR', '2026-06-14T04:00:00Z', 'Vancouver'],
  ['D', 2, 'USA', 'AUS', '2026-06-19T19:00:00Z', 'Seattle'],
  ['D', 2, 'TUR', 'PAR', '2026-06-20T03:00:00Z', 'Bay Area'],
  ['D', 3, 'TUR', 'USA', '2026-06-26T02:00:00Z', 'Los Angeles'],
  ['D', 3, 'PAR', 'AUS', '2026-06-26T02:00:00Z', 'Bay Area'],
  // Group E
  ['E', 1, 'GER', 'CUW', '2026-06-14T17:00:00Z', 'Houston'],
  ['E', 1, 'CIV', 'ECU', '2026-06-14T23:00:00Z', 'Philadelphia'],
  ['E', 2, 'GER', 'CIV', '2026-06-20T20:00:00Z', 'Toronto'],
  ['E', 2, 'ECU', 'CUW', '2026-06-21T00:00:00Z', 'Kansas City'],
  ['E', 3, 'CUW', 'CIV', '2026-06-25T20:00:00Z', 'Philadelphia'],
  ['E', 3, 'ECU', 'GER', '2026-06-25T20:00:00Z', 'New York New Jersey'],
  // Group F
  ['F', 1, 'NED', 'JPN', '2026-06-14T20:00:00Z', 'Dallas'],
  ['F', 1, 'SWE', 'TUN', '2026-06-15T02:00:00Z', 'Monterrey'],
  ['F', 2, 'NED', 'SWE', '2026-06-20T17:00:00Z', 'Houston'],
  ['F', 2, 'TUN', 'JPN', '2026-06-21T04:00:00Z', 'Monterrey'],
  ['F', 3, 'JPN', 'SWE', '2026-06-25T23:00:00Z', 'Dallas'],
  ['F', 3, 'TUN', 'NED', '2026-06-25T23:00:00Z', 'Kansas City'],
  // Group G
  ['G', 1, 'BEL', 'EGY', '2026-06-15T19:00:00Z', 'Seattle'],
  ['G', 1, 'IRN', 'NZL', '2026-06-16T01:00:00Z', 'Los Angeles'],
  ['G', 2, 'BEL', 'IRN', '2026-06-21T19:00:00Z', 'Los Angeles'],
  ['G', 2, 'NZL', 'EGY', '2026-06-22T01:00:00Z', 'Vancouver'],
  ['G', 3, 'EGY', 'IRN', '2026-06-27T03:00:00Z', 'Seattle'],
  ['G', 3, 'NZL', 'BEL', '2026-06-27T03:00:00Z', 'Vancouver'],
  // Group H
  ['H', 1, 'ESP', 'CPV', '2026-06-15T16:00:00Z', 'Atlanta'],
  ['H', 1, 'KSA', 'URU', '2026-06-15T22:00:00Z', 'Miami'],
  ['H', 2, 'ESP', 'KSA', '2026-06-21T16:00:00Z', 'Atlanta'],
  ['H', 2, 'URU', 'CPV', '2026-06-21T22:00:00Z', 'Miami'],
  ['H', 3, 'CPV', 'KSA', '2026-06-27T00:00:00Z', 'Houston'],
  ['H', 3, 'URU', 'ESP', '2026-06-27T00:00:00Z', 'Guadalajara'],
  // Group I
  ['I', 1, 'FRA', 'SEN', '2026-06-16T19:00:00Z', 'New York New Jersey'],
  ['I', 1, 'IRQ', 'NOR', '2026-06-16T22:00:00Z', 'Boston'],
  ['I', 2, 'FRA', 'IRQ', '2026-06-22T21:00:00Z', 'Philadelphia'],
  ['I', 2, 'NOR', 'SEN', '2026-06-23T00:00:00Z', 'New York New Jersey'],
  ['I', 3, 'NOR', 'FRA', '2026-06-26T19:00:00Z', 'Boston'],
  ['I', 3, 'SEN', 'IRQ', '2026-06-26T19:00:00Z', 'Toronto'],
  // Group J
  ['J', 1, 'ARG', 'ALG', '2026-06-17T01:00:00Z', 'Kansas City'],
  ['J', 1, 'AUT', 'JOR', '2026-06-17T04:00:00Z', 'Bay Area'],
  ['J', 2, 'ARG', 'AUT', '2026-06-22T17:00:00Z', 'Dallas'],
  ['J', 2, 'JOR', 'ALG', '2026-06-23T03:00:00Z', 'Bay Area'],
  ['J', 3, 'ALG', 'AUT', '2026-06-28T02:00:00Z', 'Kansas City'],
  ['J', 3, 'JOR', 'ARG', '2026-06-28T02:00:00Z', 'Dallas'],
  // Group K
  ['K', 1, 'POR', 'COD', '2026-06-17T17:00:00Z', 'Houston'],
  ['K', 1, 'UZB', 'COL', '2026-06-18T02:00:00Z', 'Mexico City'],
  ['K', 2, 'POR', 'UZB', '2026-06-23T17:00:00Z', 'Houston'],
  ['K', 2, 'COL', 'COD', '2026-06-24T02:00:00Z', 'Guadalajara'],
  ['K', 3, 'COL', 'POR', '2026-06-27T23:30:00Z', 'Miami'],
  ['K', 3, 'COD', 'UZB', '2026-06-27T23:30:00Z', 'Atlanta'],
  // Group L
  ['L', 1, 'ENG', 'CRO', '2026-06-17T20:00:00Z', 'Dallas'],
  ['L', 1, 'GHA', 'PAN', '2026-06-17T23:00:00Z', 'Toronto'],
  ['L', 2, 'ENG', 'GHA', '2026-06-23T20:00:00Z', 'Boston'],
  ['L', 2, 'PAN', 'CRO', '2026-06-23T23:00:00Z', 'Toronto'],
  ['L', 3, 'PAN', 'ENG', '2026-06-27T21:00:00Z', 'New York New Jersey'],
  ['L', 3, 'CRO', 'GHA', '2026-06-27T21:00:00Z', 'Philadelphia'],
];

// Round-of-32 template: which group winners / runners-up / best thirds meet.
// 12 winners + 12 runners-up + 8 best third-placed teams = 32 teams, 16 ties.
const R32_TEMPLATE: Array<[string, string]> = [
  ['W:A', 'T:1'],
  ['W:B', 'T:2'],
  ['W:C', 'T:3'],
  ['W:D', 'T:4'],
  ['W:E', 'T:5'],
  ['W:F', 'T:6'],
  ['W:G', 'T:7'],
  ['W:H', 'T:8'],
  ['W:I', 'R:J'],
  ['W:J', 'R:I'],
  ['W:K', 'R:L'],
  ['W:L', 'R:K'],
  ['R:A', 'R:D'],
  ['R:B', 'R:C'],
  ['R:E', 'R:H'],
  ['R:F', 'R:G'],
];

function parseSlot(token: string): WcSource {
  const [kind, value] = token.split(':');
  if (kind === 'W') return { kind: 'winner-group', group: value };
  if (kind === 'R') return { kind: 'runner-group', group: value };
  if (kind === 'T') return { kind: 'best-third', thirdRank: Number(value) };
  throw new Error(`Bad slot token: ${token}`);
}

const KICK_SLOTS = ['13:00', '16:00', '19:00', '22:00'];

function dayString(base: string, offset: number): string {
  const ms = Date.parse(`${base}T00:00:00Z`) + offset * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function kickoff(day: string, slot: number): string {
  return new Date(`${day}T${KICK_SLOTS[slot % KICK_SLOTS.length]}:00Z`).toISOString();
}

/**
 * Assign kickoffs to a list of knockout matches: `perDay` matches per day,
 * starting at `startDay`, walking the calendar forward. (Group matches use their
 * exact real times instead.) Mutates `match.kickoff`.
 */
function schedule(matches: WcMatch[], startDay: string, perDay: number): void {
  matches.forEach((m, i) => {
    const dayOffset = Math.floor(i / perDay);
    const slot = i % perDay;
    m.kickoff = kickoff(dayString(startDay, dayOffset), slot);
  });
}

/**
 * Build the full tournament from scratch: 48 teams, 12 groups, 72 group matches
 * and a fully-wired 32-team knockout bracket. Deterministic given `now`.
 */
export function seedWorldCup(now: () => Date = () => new Date()): WorldCupState {
  const teams: WcTeam[] = SEED_TEAMS.map(([id, name, flag], i) => ({
    id,
    name,
    flag,
    group: GROUP_LETTERS[Math.floor(i / 4)]!,
  }));

  const matches: WcMatch[] = [];
  let order = 0;

  // Group stage — straight from the official fixture list.
  const perGroupCount: Record<string, number> = {};
  for (const [group, matchday, homeId, awayId, kickoffAt, venue] of GROUP_FIXTURES) {
    const idx = (perGroupCount[group] = (perGroupCount[group] ?? 0) + 1);
    matches.push({
      id: `g-${group}-${idx}`,
      stage: 'group',
      group,
      matchday,
      order: order++,
      kickoff: kickoffAt,
      venue,
      homeId,
      awayId,
    });
  }

  // Round of 32 (28 June – 3 July).
  const r32: WcMatch[] = R32_TEMPLATE.map(([home, away], i) => ({
    id: `r32-${i + 1}`,
    stage: 'r32',
    order: order++,
    kickoff: '',
    homeSource: parseSlot(home),
    awaySource: parseSlot(away),
  }));
  matches.push(...r32);
  schedule(r32, '2026-06-28', 3);

  // Round of 16 — winners of consecutive R32 ties (4–7 July).
  const r16: WcMatch[] = [];
  for (let i = 0; i < 8; i++) {
    r16.push({
      id: `r16-${i + 1}`,
      stage: 'r16',
      order: order++,
      kickoff: '',
      homeSource: { kind: 'winner-match', matchId: `r32-${i * 2 + 1}` },
      awaySource: { kind: 'winner-match', matchId: `r32-${i * 2 + 2}` },
    });
  }
  matches.push(...r16);
  schedule(r16, '2026-07-04', 2);

  // Quarter-finals.
  const qf: WcMatch[] = [];
  for (let i = 0; i < 4; i++) {
    qf.push({
      id: `qf-${i + 1}`,
      stage: 'qf',
      order: order++,
      kickoff: '',
      homeSource: { kind: 'winner-match', matchId: `r16-${i * 2 + 1}` },
      awaySource: { kind: 'winner-match', matchId: `r16-${i * 2 + 2}` },
    });
  }
  matches.push(...qf);
  schedule(qf, '2026-07-09', 2);

  // Semi-finals.
  const sf: WcMatch[] = [];
  for (let i = 0; i < 2; i++) {
    sf.push({
      id: `sf-${i + 1}`,
      stage: 'sf',
      order: order++,
      kickoff: '',
      homeSource: { kind: 'winner-match', matchId: `qf-${i * 2 + 1}` },
      awaySource: { kind: 'winner-match', matchId: `qf-${i * 2 + 2}` },
    });
  }
  matches.push(...sf);
  schedule(sf, '2026-07-14', 1);

  // Third-place play-off (semi-final losers) and the final.
  const third: WcMatch = {
    id: 'third-1',
    stage: 'third',
    order: order++,
    kickoff: '',
    homeSource: { kind: 'loser-match', matchId: 'sf-1' },
    awaySource: { kind: 'loser-match', matchId: 'sf-2' },
  };
  matches.push(third);
  schedule([third], '2026-07-18', 1);

  const final: WcMatch = {
    id: 'final-1',
    stage: 'final',
    order: order++,
    kickoff: '',
    homeSource: { kind: 'winner-match', matchId: 'sf-1' },
    awaySource: { kind: 'winner-match', matchId: 'sf-2' },
  };
  matches.push(final);
  schedule([final], '2026-07-19', 1);

  const predictors: WcPredictor[] = DEFAULT_PREDICTOR_NAMES.map((name) => ({
    id: generateId('wcp'),
    name,
  }));

  return {
    season: '2026',
    title: 'World Cup 2026 Predictions',
    version: WC_SEED_VERSION,
    teams,
    matches,
    predictors,
    predictions: [],
    createdAt: now().toISOString(),
  };
}
