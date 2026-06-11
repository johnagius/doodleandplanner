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
  teams: WcTeam[];
  matches: WcMatch[];
  predictors: WcPredictor[];
  predictions: WcPrediction[];
  createdAt: ISODateTime;
}

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

/** True once a match can no longer be predicted: it has kicked off or finished. */
export function isMatchLocked(match: WcMatch, now: Date = new Date()): boolean {
  if (match.result) return true;
  return now.getTime() >= toMs(match.kickoff);
}

/** True when both teams of a match are known (so it can be predicted). */
export function isMatchReady(match: WcMatch): boolean {
  return !!match.homeId && !!match.awayId;
}

/** The UTC calendar day ("YYYY-MM-DD") a match kicks off. */
export function matchDateKey(match: WcMatch): string {
  return match.kickoff.slice(0, 10);
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
 * The day the UI should open on: the earliest day that still has an
 * un-resulted match, falling back to the last day once everything is played.
 */
export function defaultDay(state: WorldCupState, now: Date = new Date()): string {
  const days = tournamentDays(state);
  if (days.length === 0) return now.toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  // Prefer today if it has matches…
  if (days.includes(today)) return today;
  // …otherwise the next upcoming day, else the most recent past day.
  const upcoming = days.find((d) => d >= today);
  return upcoming ?? days[days.length - 1]!;
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

/** Per-predictor totals, best first. */
export function leaderboard(state: WorldCupState): WcLeaderRow[] {
  const rows = new Map<string, WcLeaderRow>(
    state.predictors.map((p) => [
      p.id,
      { predictorId: p.id, name: p.name, points: 0, scored: 0, exact: 0, correctResults: 0 },
    ]),
  );
  for (const match of state.matches) {
    if (!match.result) continue;
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

/** How many matches now have a result (for progress UI). */
export function playedCount(state: WorldCupState): number {
  return state.matches.filter((m) => !!m.result).length;
}

// --- Seeding ---------------------------------------------------------------

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

/**
 * A plausible 48-team field for the 2026 finals, four to a group. This is the
 * board's starting data — real fixtures and the official draw can differ; the
 * organiser drives everything from here by entering results.
 */
const SEED_TEAMS: Array<[string, string, string]> = [
  // Group A
  ['MEX', 'Mexico', '🇲🇽'],
  ['CRO', 'Croatia', '🇭🇷'],
  ['NGA', 'Nigeria', '🇳🇬'],
  ['KSA', 'Saudi Arabia', '🇸🇦'],
  // Group B
  ['CAN', 'Canada', '🇨🇦'],
  ['BEL', 'Belgium', '🇧🇪'],
  ['EGY', 'Egypt', '🇪🇬'],
  ['QAT', 'Qatar', '🇶🇦'],
  // Group C
  ['USA', 'United States', '🇺🇸'],
  ['NED', 'Netherlands', '🇳🇱'],
  ['GHA', 'Ghana', '🇬🇭'],
  ['IRQ', 'Iraq', '🇮🇶'],
  // Group D
  ['ARG', 'Argentina', '🇦🇷'],
  ['DEN', 'Denmark', '🇩🇰'],
  ['CIV', "Côte d'Ivoire", '🇨🇮'],
  ['NZL', 'New Zealand', '🇳🇿'],
  // Group E
  ['FRA', 'France', '🇫🇷'],
  ['URU', 'Uruguay', '🇺🇾'],
  ['SEN', 'Senegal', '🇸🇳'],
  ['UAE', 'United Arab Emirates', '🇦🇪'],
  // Group F
  ['BRA', 'Brazil', '🇧🇷'],
  ['SUI', 'Switzerland', '🇨🇭'],
  ['CMR', 'Cameroon', '🇨🇲'],
  ['AUS', 'Australia', '🇦🇺'],
  // Group G
  ['ESP', 'Spain', '🇪🇸'],
  ['COL', 'Colombia', '🇨🇴'],
  ['ALG', 'Algeria', '🇩🇿'],
  ['JPN', 'Japan', '🇯🇵'],
  // Group H
  ['GER', 'Germany', '🇩🇪'],
  ['ECU', 'Ecuador', '🇪🇨'],
  ['TUN', 'Tunisia', '🇹🇳'],
  ['KOR', 'South Korea', '🇰🇷'],
  // Group I
  ['ENG', 'England', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'],
  ['SRB', 'Serbia', '🇷🇸'],
  ['MAR', 'Morocco', '🇲🇦'],
  ['PAN', 'Panama', '🇵🇦'],
  // Group J
  ['POR', 'Portugal', '🇵🇹'],
  ['POL', 'Poland', '🇵🇱'],
  ['IRN', 'Iran', '🇮🇷'],
  ['JAM', 'Jamaica', '🇯🇲'],
  // Group K
  ['ITA', 'Italy', '🇮🇹'],
  ['AUT', 'Austria', '🇦🇹'],
  ['PAR', 'Paraguay', '🇵🇾'],
  ['UZB', 'Uzbekistan', '🇺🇿'],
  // Group L
  ['TUR', 'Türkiye', '🇹🇷'],
  ['UKR', 'Ukraine', '🇺🇦'],
  ['NOR', 'Norway', '🇳🇴'],
  ['CRC', 'Costa Rica', '🇨🇷'],
];

/** Host cities, cycled for a bit of flavour on each match card. */
const VENUES = [
  'Mexico City',
  'New York / New Jersey',
  'Los Angeles',
  'Dallas',
  'Atlanta',
  'Toronto',
  'Houston',
  'Kansas City',
  'Guadalajara',
  'Boston',
  'Philadelphia',
  'Miami',
  'Seattle',
  'San Francisco Bay',
  'Vancouver',
  'Monterrey',
];

// Round-robin pairings (indices within a group of four) so each team plays
// each other once across three matchdays.
const GROUP_PAIRINGS: Array<[number, number]> = [
  [0, 1],
  [2, 3], // MD1
  [0, 2],
  [1, 3], // MD2
  [0, 3],
  [1, 2], // MD3
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
 * Assign kickoffs to a list of matches: `perDay` matches per day, starting at
 * `startDay`, walking the calendar forward. Mutates `match.kickoff`.
 */
function schedule(matches: WcMatch[], startDay: string, perDay: number): void {
  matches.forEach((m, i) => {
    const dayOffset = Math.floor(i / perDay);
    const slot = i % perDay;
    m.kickoff = kickoff(dayString(startDay, dayOffset), slot);
    m.venue = VENUES[m.order % VENUES.length];
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
  const teamsByGroup = new Map<string, WcTeam[]>();
  for (const g of GROUP_LETTERS) {
    teamsByGroup.set(
      g,
      teams.filter((t) => t.group === g),
    );
  }

  const matches: WcMatch[] = [];
  let order = 0;

  // Group stage — emit matchday by matchday so the calendar reads chronologically.
  const groupMatches: WcMatch[] = [];
  for (let md = 0; md < 3; md++) {
    for (const g of GROUP_LETTERS) {
      const gt = teamsByGroup.get(g)!;
      for (let p = 0; p < 2; p++) {
        const [hi, ai] = GROUP_PAIRINGS[md * 2 + p]!;
        const idx = md * 2 + p + 1; // 1..6 within the group
        const match: WcMatch = {
          id: `g-${g}-${idx}`,
          stage: 'group',
          group: g,
          matchday: md + 1,
          order: order++,
          kickoff: '',
          homeId: gt[hi]!.id,
          awayId: gt[ai]!.id,
        };
        groupMatches.push(match);
        matches.push(match);
      }
    }
  }
  schedule(groupMatches, '2026-06-11', 4);

  // Round of 32.
  const r32: WcMatch[] = R32_TEMPLATE.map(([home, away], i) => ({
    id: `r32-${i + 1}`,
    stage: 'r32',
    order: order++,
    kickoff: '',
    homeSource: parseSlot(home),
    awaySource: parseSlot(away),
  }));
  matches.push(...r32);
  schedule(r32, '2026-06-30', 4);

  // Round of 16 — winners of consecutive R32 ties.
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
  schedule(r16, '2026-07-05', 2);

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
  schedule(qf, '2026-07-10', 2);

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
    teams,
    matches,
    predictors,
    predictions: [],
    createdAt: now().toISOString(),
  };
}
