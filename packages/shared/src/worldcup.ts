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
  /** Emoji reactions from other predictors to this (revealed) pick: emoji →
   * reactor predictor ids. Only added once the match has kicked off. */
  reactions?: Record<string, string[]>;
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
  /** Quick "no prediction needed" emoji reactions on a match: matchId → emoji →
   * predictor ids. Older boards omit this. */
  matchReactions?: Record<string, Record<string, string[]>>;
  /** Each predictor's pick for the tournament winner: predictorId → team id.
   * Locks at the first knockout kickoff. Older boards omit this. */
  championPicks?: Record<string, string>;
  /** Frozen pre-kickoff odds per match (matchId → line), captured once from the
   * live feed so the fake-money betting game settles deterministically. Older
   * boards omit this. */
  odds?: Record<string, WcMatchOdds>;
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

/** Strip a member id from an emoji→ids reaction map, dropping emptied keys.
 * Returns undefined when nothing remains, so callers can omit the field. */
function withoutReactor(
  reactions: Record<string, string[]> | undefined,
  memberId: string,
): Record<string, string[]> | undefined {
  if (!reactions) return undefined;
  const next: Record<string, string[]> = {};
  for (const [emoji, ids] of Object.entries(reactions)) {
    const kept = ids.filter((id) => id !== memberId);
    if (kept.length) next[emoji] = kept;
  }
  return Object.keys(next).length ? next : undefined;
}

/** Scrub a member id from every match's reaction tally, dropping emptied entries. */
function scrubMatchReactions(
  matchReactions: Record<string, Record<string, string[]>> | undefined,
  memberId: string,
): Record<string, Record<string, string[]>> | undefined {
  if (!matchReactions) return undefined;
  const next: Record<string, Record<string, string[]>> = {};
  for (const [matchId, byEmoji] of Object.entries(matchReactions)) {
    const cleaned = withoutReactor(byEmoji, memberId);
    if (cleaned) next[matchId] = cleaned;
  }
  return next;
}

/** Remove a predictor and all their predictions, and scrub any reactions they
 * left on other people's picks or on matches, so no ghost counts linger. */
export function removePredictor(state: WorldCupState, predictorId: string): WorldCupState {
  const predictions = state.predictions
    .filter((p) => p.predictorId !== predictorId)
    .map((p) => {
      if (!p.reactions || !Object.values(p.reactions).some((ids) => ids.includes(predictorId))) {
        return p;
      }
      const reactions = withoutReactor(p.reactions, predictorId);
      const next: WcPrediction = { ...p };
      if (reactions) next.reactions = reactions;
      else delete next.reactions;
      return next;
    });
  return {
    ...state,
    predictors: state.predictors.filter((p) => p.id !== predictorId),
    predictions,
    matchReactions: scrubMatchReactions(state.matchReactions, predictorId),
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

/** Cast or update a prediction. Throws if the match is locked or not ready.
 *
 * Note: this deliberately rebuilds the prediction object from scratch (no spread
 * of any prior pick). That's safe because pick `reactions` are only ever added
 * after kickoff, when this function is already locked out — so the two windows
 * never overlap. Don't relax the lock without also preserving `reactions`. */
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
 * even after kickoff — to fix a mistake — but not once the result is recorded.
 * Drops the pick together with any reactions on it (intended mistake-fix). */
/** Remove a predictor's pick — only before kickoff. Once a match has started it
 * is **locked forever**: no clearing (a single tap was wiping good picks during
 * live games, with no way to re-add since predicting is also locked). */
export function clearPrediction(
  state: WorldCupState,
  matchId: string,
  predictorId: string,
  now: () => Date = () => new Date(),
): WorldCupState {
  const match = findMatch(state, matchId);
  if (match && isMatchLocked(match, now())) {
    throw new Error('This match has kicked off — picks are locked');
  }
  return {
    ...state,
    predictions: state.predictions.filter(
      (p) => !(p.matchId === matchId && p.predictorId === predictorId),
    ),
  };
}

/**
 * Organiser-only: set or restore any predictor's pick, even after kickoff —
 * for fixing a pick lost to a glitch or entered by mistake. Bypasses the
 * normal kickoff lock (which still applies to everyone else).
 */
export function adminSetPrediction(
  state: WorldCupState,
  input: { matchId: string; predictorId: string; home: number; away: number; now?: () => Date },
): WorldCupState {
  const match = findMatch(state, input.matchId);
  if (!match) throw new Error('Unknown match');
  if (!findPredictor(state, input.predictorId)) throw new Error('Unknown predictor');
  const now = (input.now ?? (() => new Date()))();
  const others = state.predictions.filter(
    (p) => !(p.matchId === input.matchId && p.predictorId === input.predictorId),
  );
  const prediction: WcPrediction = {
    matchId: input.matchId,
    predictorId: input.predictorId,
    home: normalizeGoals(input.home),
    away: normalizeGoals(input.away),
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

/**
 * A live/finished score for one match from an external feed (football-data.org).
 * Teams are identified by their three-letter code, which matches our team ids.
 */
/** Pre-match betting lines from the feed (ESPN/DraftKings), for colour only. */
export interface WcMatchOdds {
  /** Headline favourite line, e.g. "ESP -1400". */
  details?: string | null;
  /** Over/Under total-goals line, e.g. 3.5. */
  overUnder?: number | null;
  /** Three-way moneyline (American odds). */
  homeML?: number | null;
  awayML?: number | null;
  drawML?: number | null;
}

export interface WcLiveScore {
  homeTla: string;
  awayTla: string;
  /** Feed status: TIMED | SCHEDULED | IN_PLAY | PAUSED | FINISHED | … */
  status: string;
  /** Live minute, when the feed provides it (number; ESPN/paid feeds). */
  minute?: number | null;
  home: number | null;
  away: number | null;
  /** 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null — the advancing side for KO ties. */
  winner?: string | null;
  /** Display clock from the feed, e.g. "45'+2'" or "90'" (ESPN). */
  clock?: string | null;
  /** Short human status, e.g. "HT", "FT", "62'", "Scheduled" (ESPN). */
  detail?: string | null;
  /** Stadium name (ESPN). */
  venue?: string | null;
  /** Stadium city/country, e.g. "Atlanta, Georgia, USA" (ESPN). */
  venueCity?: string | null;
  /** Crowd size, once known (ESPN; 0/absent before kick-off). */
  attendance?: number | null;
  /** Team brand colours (hex, e.g. "#c60b1e") and crest URLs (ESPN). */
  homeColor?: string | null;
  awayColor?: string | null;
  homeLogo?: string | null;
  awayLogo?: string | null;
  /** Pre-match odds (ESPN). */
  odds?: WcMatchOdds | null;
  /** Which feed supplied the live fields — 'espn' (near-real-time) or 'football-data'. */
  source?: 'espn' | 'football-data';
}

/** A single in-match event (goal or card) from the live feed, for the timeline
 * of a played/in-play game. */
export interface WcMatchEvent {
  /** Display minute, e.g. "9'" or "45'+2'". */
  minute: string;
  kind: 'goal' | 'own-goal' | 'pen-goal' | 'yellow' | 'red';
  /** Team code (canonical) the event belongs to. */
  teamTla: string;
  /** Player involved (scorer / booked player). */
  player: string;
  /** Assisting player, when the feed provides one (goals only, best-effort). */
  assist?: string;
}

/** One historical meeting between two teams (from the results feed). */
export interface WcH2HMeeting {
  /** ISO date of the meeting. */
  date: string;
  homeTla: string;
  awayTla: string;
  homeScore: number | null;
  awayScore: number | null;
  competition?: string;
}

/** Aggregated historical head-to-head between two teams, keyed by team code.
 * (Distinct from {@link WcHeadToHead}, which compares two predictors.) */
export interface WcTeamH2H {
  numberOfMatches: number;
  /** tla → { wins, draws, losses } across the recorded meetings. */
  records: Record<string, { wins: number; draws: number; losses: number }>;
  /** A few most-recent meetings, newest first. */
  recent: WcH2HMeeting[];
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

/**
 * Freeze the betting odds for any match we have a line for but haven't snapshotted
 * yet — captured **once** (the first pre-kickoff line we see) so the fake-money
 * game settles from a stable price. Pure + idempotent: existing snapshots are
 * never overwritten, and matches without a usable line are skipped.
 */
export function captureOdds(state: WorldCupState, scores: WcLiveScore[]): WorldCupState {
  let odds: Record<string, WcMatchOdds> | undefined;
  for (const sc of scores) {
    if (!sc.odds) continue;
    const match = state.matches.find((m) => m.homeId === sc.homeTla && m.awayId === sc.awayTla);
    if (!match || state.odds?.[match.id] || odds?.[match.id]) continue;
    // Only worth storing if it can price at least one 1X2 outcome.
    const o = sc.odds;
    if (o.homeML == null && o.drawML == null && o.awayML == null) continue;
    odds = { ...(odds ?? state.odds ?? {}), [match.id]: o };
  }
  return odds ? { ...state, odds } : state;
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
  /** Champion-pick bonus already banked, and included in `points`. */
  bonus: number;
}

/**
 * Per-predictor totals, best first. With `resultedBefore` (a Malta day key) only
 * results from matches *before* that day count — used to compute prior standings
 * for rank movement.
 */
export function leaderboard(
  state: WorldCupState,
  opts?: {
    resultedBefore?: string;
    /** Provisional scores for in-play matches (matchId → score) — folds live
     * games into the totals "as it stands". Ignored when `resultedBefore` is set. */
    liveScores?: Record<string, { home: number; away: number }>;
  },
): WcLeaderRow[] {
  const before = opts?.resultedBefore;
  const live = before ? undefined : opts?.liveScores;
  const rows = new Map<string, WcLeaderRow>(
    state.predictors.map((p) => [
      p.id,
      {
        predictorId: p.id,
        name: p.name,
        points: 0,
        scored: 0,
        exact: 0,
        correctResults: 0,
        bonus: 0,
      },
    ]),
  );
  for (const match of state.matches) {
    const result = match.result ?? live?.[match.id];
    if (!result) continue;
    if (before && matchDateKey(match) >= before) continue;
    for (const pred of state.predictions) {
      if (pred.matchId !== match.id) continue;
      const row = rows.get(pred.predictorId);
      if (!row) continue;
      const { points, category } = scorePrediction(pred, result);
      row.points += points;
      row.scored++;
      if (category === 'exact') row.exact++;
      if (category === 'exact' || category === 'goalDiff' || category === 'outcome') {
        row.correctResults++;
      }
    }
  }
  // Fold in the champion-pick bonus (computed from the live bracket; it shifts
  // both the current and "previous" tables equally, so rank movement is unchanged).
  for (const p of state.predictors) {
    const pick = state.championPicks?.[p.id];
    const row = rows.get(p.id);
    if (!pick || !row) continue;
    row.bonus = championBonusFor(state, pick);
    row.points += row.bonus;
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

/** Leaderboard with rank + movement since the last day's results landed.
 * Pass `liveScores` to fold in-play games into the live "as it stands" table. */
export function leaderboardWithMovement(
  state: WorldCupState,
  liveScores?: Record<string, { home: number; away: number }>,
): WcLeaderRowMoved[] {
  const current = leaderboard(state, { liveScores });
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

// --- Day-by-day timeline ---------------------------------------------------

export interface WcTimelineRow {
  predictorId: string;
  name: string;
  /** Points scored from this day's resulted matches. */
  dayPoints: number;
  /** Cumulative match points through this day (champion bonus excluded). */
  total: number;
  /** 1-based cumulative rank through this day (stable tie-break: predictor order). */
  rank: number;
  /** Cumulative rank as of the previous played day (null on the first day). */
  prevRank: number | null;
  /** Places gained vs the previous played day (+ climbed, − slipped, 0 held). */
  movement: number;
  /** Whether this predictor (jointly) topped the day's points. */
  wonDay: boolean;
}

export interface WcTimelineDay {
  /** Malta day key (YYYY-MM-DD). */
  day: string;
  /** Resulted matches counted on this day. */
  matches: number;
  /** The day's winning points (0 when nobody scored). */
  topPoints: number;
  /** Predictor ids that (jointly) won the day; empty when nobody scored. */
  winners: string[];
  /** All predictors, sorted by cumulative rank after this day. */
  rows: WcTimelineRow[];
}

export interface WcTimelinePlayer {
  predictorId: string;
  name: string;
  /** Days this predictor (jointly) topped. */
  daysWon: number;
  /** Final cumulative match points across the whole timeline. */
  total: number;
  /** Final cumulative rank. */
  rank: number;
  /** Their biggest single-day haul, if any. */
  bestDay: { day: string; points: number } | null;
  /** Consecutive most-recent days won (0 if they didn't win the latest day). */
  streak: number;
}

export interface WcTimeline {
  /** Played days oldest → newest. */
  days: WcTimelineDay[];
  /** Per-predictor aggregate, most days won first (then total, then name). */
  players: WcTimelinePlayer[];
}

/**
 * The race told day by day: for every Malta day with at least one resulted
 * match, who scored what, who topped the day, and the running standings (with
 * rank movement) after it. Cumulative totals are **match points only** — the
 * champion-pick bonus isn't tied to a match day, so it lives on the main board.
 * Pure and deterministic; ties in the cumulative rank break by predictor order
 * so a bump chart drawn from this never crosses lines spuriously.
 */
export function wcTimeline(state: WorldCupState): WcTimeline {
  const order = new Map(state.predictors.map((p, i) => [p.id, i]));
  const nameOf = new Map(state.predictors.map((p) => [p.id, p.name]));

  // Resulted matches grouped by Malta day.
  const byDay = new Map<string, WcMatch[]>();
  for (const m of state.matches) {
    if (!m.result) continue;
    const d = matchDateKey(m);
    let arr = byDay.get(d);
    if (!arr) byDay.set(d, (arr = []));
    arr.push(m);
  }
  const dayKeys = [...byDay.keys()].sort();

  const totals = new Map(state.predictors.map((p) => [p.id, 0]));
  const daysWon = new Map(state.predictors.map((p) => [p.id, 0]));
  const bestDay = new Map<string, { day: string; points: number } | null>(
    state.predictors.map((p) => [p.id, null]),
  );
  let prevRankById: Map<string, number> | null = null;
  const days: WcTimelineDay[] = [];

  for (const day of dayKeys) {
    const matches = byDay.get(day)!;

    // Points each predictor scored from this day's results.
    const dayPts = new Map(state.predictors.map((p) => [p.id, 0]));
    for (const m of matches) {
      for (const pred of state.predictions) {
        if (pred.matchId !== m.id) continue;
        const cur = dayPts.get(pred.predictorId);
        if (cur === undefined) continue;
        dayPts.set(pred.predictorId, cur + scorePrediction(pred, m.result!).points);
      }
    }

    // Roll the day's points into the cumulative totals and the per-day records.
    for (const p of state.predictors) {
      const dp = dayPts.get(p.id) ?? 0;
      totals.set(p.id, (totals.get(p.id) ?? 0) + dp);
      const b = bestDay.get(p.id);
      if (dp > 0 && (!b || dp > b.points)) bestDay.set(p.id, { day, points: dp });
    }

    // The day's (joint) winners — top scorers with more than zero.
    const topPoints = Math.max(0, ...state.predictors.map((p) => dayPts.get(p.id) ?? 0));
    const winners =
      topPoints > 0
        ? state.predictors.filter((p) => (dayPts.get(p.id) ?? 0) === topPoints).map((p) => p.id)
        : [];
    for (const id of winners) daysWon.set(id, (daysWon.get(id) ?? 0) + 1);

    // Cumulative ranking after this day (total desc, stable by predictor order).
    const ranked = state.predictors
      .map((p) => ({ id: p.id, total: totals.get(p.id) ?? 0 }))
      .sort((a, b) => b.total - a.total || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const rankById = new Map(ranked.map((r, i) => [r.id, i + 1]));

    const rows: WcTimelineRow[] = ranked.map((r) => {
      const rank = rankById.get(r.id)!;
      const prev = prevRankById?.get(r.id) ?? null;
      return {
        predictorId: r.id,
        name: nameOf.get(r.id) ?? r.id,
        dayPoints: dayPts.get(r.id) ?? 0,
        total: r.total,
        rank,
        prevRank: prev,
        movement: prev == null ? 0 : prev - rank,
        wonDay: winners.includes(r.id),
      };
    });

    days.push({ day, matches: matches.length, topPoints, winners, rows });
    prevRankById = rankById;
  }

  const finalRank = prevRankById ?? new Map<string, number>();
  const streakOf = (id: string): number => {
    let s = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i]!.winners.includes(id)) s++;
      else break;
    }
    return s;
  };

  const players: WcTimelinePlayer[] = state.predictors
    .map((p) => ({
      predictorId: p.id,
      name: p.name,
      daysWon: daysWon.get(p.id) ?? 0,
      total: totals.get(p.id) ?? 0,
      rank: finalRank.get(p.id) ?? state.predictors.length,
      bestDay: bestDay.get(p.id) ?? null,
      streak: streakOf(p.id),
    }))
    .sort((a, b) => b.daysWon - a.daysWon || b.total - a.total || a.name.localeCompare(b.name));

  return { days, players };
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

export interface WcGameLogEntry {
  matchId: string;
  stage: WcStage;
  /** Malta day key the match kicks off. */
  day: string;
  kickoff: ISODateTime;
  order: number;
  /** The scoreline this predictor picked. */
  pred: { home: number; away: number };
  /** The full-time result, or null while the match is unresolved. */
  result: WcResult | null;
  /** Points scored (0 until resolved). */
  points: number;
  /** Scoring category, or null until resolved. */
  category: WcScoreCategory | null;
}

/**
 * Every prediction a player made, chronological (kickoff then bracket order),
 * each annotated with the result and points (result/category stay null until the
 * match resolves). The per-game record behind the Performance view.
 */
export function playerGameLog(state: WorldCupState, predictorId: string): WcGameLogEntry[] {
  const out: WcGameLogEntry[] = [];
  for (const m of state.matches) {
    const pred = state.predictions.find((p) => p.matchId === m.id && p.predictorId === predictorId);
    if (!pred) continue;
    const scored = m.result ? scorePrediction(pred, m.result) : null;
    out.push({
      matchId: m.id,
      stage: m.stage,
      day: matchDateKey(m),
      kickoff: m.kickoff,
      order: m.order,
      pred: { home: pred.home, away: pred.away },
      result: m.result ?? null,
      points: scored?.points ?? 0,
      category: scored?.category ?? null,
    });
  }
  out.sort((a, b) => toMs(a.kickoff) - toMs(b.kickoff) || a.order - b.order);
  return out;
}

export interface WcScoreBreakdown {
  exact: number;
  goalDiff: number;
  outcome: number;
  close: number;
  miss: number;
}

/** A player's scored picks counted by category — their accuracy distribution. */
export function playerBreakdown(state: WorldCupState, predictorId: string): WcScoreBreakdown {
  const b: WcScoreBreakdown = { exact: 0, goalDiff: 0, outcome: 0, close: 0, miss: 0 };
  for (const e of playerGameLog(state, predictorId)) {
    if (e.category) b[e.category]++;
  }
  return b;
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

// --- Nudges (who still needs to predict) -----------------------------------

/** Ready, still-open matches a predictor hasn't picked yet, soonest first. */
export function pendingForMe(
  state: WorldCupState,
  predictorId: string,
  now: Date = new Date(),
): WcMatch[] {
  return state.matches
    .filter(
      (m) =>
        isMatchReady(m) &&
        !isMatchLocked(m, now) &&
        !state.predictions.some((p) => p.matchId === m.id && p.predictorId === predictorId),
    )
    .sort((a, b) => toMs(a.kickoff) - toMs(b.kickoff));
}

/** Predictors who haven't picked a given (ready, still-open) match yet. */
export function pendingPredictors(
  state: WorldCupState,
  matchId: string,
  now: Date = new Date(),
): WcPredictor[] {
  const m = findMatch(state, matchId);
  if (!m || !isMatchReady(m) || isMatchLocked(m, now)) return [];
  return state.predictors.filter(
    (p) => !state.predictions.some((x) => x.matchId === matchId && x.predictorId === p.id),
  );
}

/** My unpicked, still-open matches kicking off within `withinMs` (default 6h). */
export function lockingSoon(
  state: WorldCupState,
  predictorId: string,
  now: Date = new Date(),
  withinMs = 6 * 60 * 60 * 1000,
): WcMatch[] {
  const t = now.getTime();
  return pendingForMe(state, predictorId, now).filter((m) => toMs(m.kickoff) - t <= withinMs);
}

/** How many matches now have a result (for progress UI). */
export function playedCount(state: WorldCupState): number {
  return state.matches.filter((m) => !!m.result).length;
}

// --- Champion pick (predict the winner) ------------------------------------

/** Bonus points for a champion pick, scaled by how far that team gets. */
export const WC_CHAMP_POINTS = {
  champion: 30,
  runnerUp: 12,
  semi: 6,
  quarter: 3,
} as const;

/** The deepest knockout stage a team is a participant of, or null (groups). */
function deepestKnockoutStage(state: WorldCupState, teamId: string): WcStage | null {
  let best: WcStage | null = null;
  for (const m of state.matches) {
    if (m.stage === 'group') continue;
    if (m.homeId !== teamId && m.awayId !== teamId) continue;
    if (!best || STAGE_ORDER[m.stage] > STAGE_ORDER[best]) best = m.stage;
  }
  return best;
}

/**
 * Points earned so far by predicting `teamId` as champion, by their run:
 * reaching the quarters/semis banks a little, a finalist more, the winner most.
 * Updates live as the bracket fills in.
 */
export function championBonusFor(state: WorldCupState, teamId: string): number {
  const deepest = deepestKnockoutStage(state, teamId);
  if (!deepest) return 0;
  if (deepest === 'final') {
    const final = state.matches.find((m) => m.stage === 'final');
    if (final?.result) {
      return winnerOf(final) === teamId ? WC_CHAMP_POINTS.champion : WC_CHAMP_POINTS.runnerUp;
    }
    return WC_CHAMP_POINTS.runnerUp; // a finalist banks at least runner-up
  }
  // The third-place play-off means a team lost in the semis — still a semi run.
  if (deepest === 'sf' || deepest === 'third') return WC_CHAMP_POINTS.semi;
  if (deepest === 'qf') return WC_CHAMP_POINTS.quarter;
  return 0;
}

/** The actual tournament winner (final result), once decided. */
export function championTeam(state: WorldCupState): string | undefined {
  const final = state.matches.find((m) => m.stage === 'final');
  return final?.result ? winnerOf(final) : undefined;
}

/** When champion picks lock: the earliest knockout kickoff. Null pre-bracket. */
export function championDeadline(state: WorldCupState): ISODateTime | null {
  let earliest: string | null = null;
  for (const m of state.matches) {
    if (m.stage === 'group') continue;
    if (earliest === null || toMs(m.kickoff) < toMs(earliest)) earliest = m.kickoff;
  }
  return earliest;
}

/** True once the knockouts have begun — champion picks can no longer change. */
export function isChampionLocked(state: WorldCupState, now: Date = new Date()): boolean {
  const dl = championDeadline(state);
  return !!dl && now.getTime() >= toMs(dl);
}

/** Set (or change) a predictor's champion pick, until the knockouts start. */
export function setChampionPick(
  state: WorldCupState,
  predictorId: string,
  teamId: string,
  now: () => Date = () => new Date(),
): WorldCupState {
  if (!findPredictor(state, predictorId)) throw new Error('Unknown predictor');
  if (!findTeam(state, teamId)) throw new Error('Unknown team');
  if (isChampionLocked(state, now())) throw new Error('Champion picks are locked');
  return { ...state, championPicks: { ...(state.championPicks ?? {}), [predictorId]: teamId } };
}

/** Remove a predictor's champion pick (allowed until the knockouts start). */
export function clearChampionPick(state: WorldCupState, predictorId: string): WorldCupState {
  if (!state.championPicks?.[predictorId]) return state;
  const next = { ...state.championPicks };
  delete next[predictorId];
  return { ...state, championPicks: next };
}

// --- Engagement: reactions, crowd pulse, team form -------------------------

/** Curated emoji for quick match reactions and reacting to mates' picks. */
export const WC_REACTIONS = ['🔥', '😱', '🎉', '💩'] as const;

/** Toggle a quick, prediction-free reaction on a match. Immutable: adds the
 * predictor to that emoji's tally, or removes them if already there. */
export function toggleMatchReaction(
  state: WorldCupState,
  matchId: string,
  emoji: string,
  predictorId: string,
): WorldCupState {
  const all = { ...(state.matchReactions ?? {}) };
  const forMatch = { ...(all[matchId] ?? {}) };
  const reactors = forMatch[emoji] ?? [];
  if (reactors.includes(predictorId)) {
    const next = reactors.filter((id) => id !== predictorId);
    if (next.length) forMatch[emoji] = next;
    else delete forMatch[emoji];
  } else {
    forMatch[emoji] = [...reactors, predictorId];
  }
  if (Object.keys(forMatch).length) all[matchId] = forMatch;
  else delete all[matchId];
  return { ...state, matchReactions: all };
}

/** Toggle a reaction on a specific (revealed) prediction. Immutable; a no-op
 * (returns the same state) when no such prediction exists. */
export function togglePickReaction(
  state: WorldCupState,
  matchId: string,
  predictorId: string,
  emoji: string,
  reactorId: string,
): WorldCupState {
  const idx = state.predictions.findIndex(
    (p) => p.matchId === matchId && p.predictorId === predictorId,
  );
  if (idx === -1) return state;
  const target = state.predictions[idx]!;
  const reactions = { ...(target.reactions ?? {}) };
  const reactors = reactions[emoji] ?? [];
  if (reactors.includes(reactorId)) {
    const next = reactors.filter((id) => id !== reactorId);
    if (next.length) reactions[emoji] = next;
    else delete reactions[emoji];
  } else {
    reactions[emoji] = [...reactors, reactorId];
  }
  const updated: WcPrediction = { ...target };
  if (Object.keys(reactions).length) updated.reactions = reactions;
  else delete updated.reactions;
  const predictions = [...state.predictions];
  predictions[idx] = updated;
  return { ...state, predictions };
}

/** How many predictors have picked a match (a count only — reveals no picks). */
export function predictionCount(state: WorldCupState, matchId: string): number {
  return state.predictions.filter((p) => p.matchId === matchId).length;
}

/**
 * The most-popular predicted scoreline for a match, with how many chose it.
 * Ties break to the lowest home goals, then the lowest away goals, so the
 * answer is deterministic. Null when nobody has predicted. (Callers only show
 * this after kickoff, so it never leaks picks early.)
 */
export function consensusScore(
  state: WorldCupState,
  matchId: string,
): { home: number; away: number; count: number } | null {
  const tally = new Map<string, number>();
  for (const p of state.predictions) {
    if (p.matchId !== matchId) continue;
    const key = `${p.home}-${p.away}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  let best: { home: number; away: number; count: number } | null = null;
  for (const [key, count] of tally) {
    const [home, away] = key.split('-').map(Number) as [number, number];
    const better =
      !best ||
      count > best.count ||
      (count === best.count && (home < best.home || (home === best.home && away < best.away)));
    if (better) best = { home, away, count };
  }
  return best;
}

/**
 * Predictor ids who scored the most on a resolved match — the closest picks,
 * for a 🎯 crown. Empty before a result, and empty when the best anyone managed
 * is zero (no crown for a whole-squad miss).
 */
/**
 * Predictor ids who'd score the most against a given scoreline (with ≥1 point) —
 * works for a final result OR a live, in-progress score, so it powers both the
 * after-the-whistle crown and the "closest right now" live spotlight.
 */
export function closestToScore(
  state: WorldCupState,
  matchId: string,
  home: number,
  away: number,
): string[] {
  let bestPts = 0;
  const scores: Array<{ id: string; pts: number }> = [];
  for (const p of state.predictions) {
    if (p.matchId !== matchId) continue;
    const pts = scorePrediction(p, { home, away }).points;
    scores.push({ id: p.predictorId, pts });
    if (pts > bestPts) bestPts = pts;
  }
  if (bestPts <= 0) return [];
  return scores.filter((s) => s.pts === bestPts).map((s) => s.id);
}

export function closestPredictors(state: WorldCupState, matchId: string): string[] {
  const match = findMatch(state, matchId);
  if (!match?.result) return [];
  return closestToScore(state, matchId, match.result.home, match.result.away);
}

export interface WcTeamRecord {
  group: string;
  /** 1-based position in the group table; null until a game has been played. */
  position: number | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  /** Group games in which the team conceded nothing. */
  cleanSheets: number;
  /** Recent group results, most-recent-first. */
  form: Array<'W' | 'D' | 'L'>;
}

/** A team's group standing + recent form, derived from played group results
 * (no extra data source). Null for an unknown/unresolved team slot. */
export function teamRecord(state: WorldCupState, teamId: string | undefined): WcTeamRecord | null {
  const team = findTeam(state, teamId);
  if (!team) return null;
  const table = groupStandings(state, team.group);
  const row = table.find((r) => r.teamId === team.id);
  if (!row) return null;
  const games = state.matches
    .filter(
      (m) =>
        m.stage === 'group' &&
        m.group === team.group &&
        !!m.result &&
        (m.homeId === team.id || m.awayId === team.id),
    )
    .sort((a, b) => toMs(b.kickoff) - toMs(a.kickoff) || b.order - a.order);
  let cleanSheets = 0;
  const form: Array<'W' | 'D' | 'L'> = games.map((m) => {
    const isHome = m.homeId === team.id;
    const gf = isHome ? m.result!.home : m.result!.away;
    const ga = isHome ? m.result!.away : m.result!.home;
    if (ga === 0) cleanSheets++;
    return gf > ga ? 'W' : gf < ga ? 'L' : 'D';
  });
  return {
    group: team.group,
    position: row.played > 0 ? table.indexOf(row) + 1 : null,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    goalDiff: row.goalDiff,
    points: row.points,
    cleanSheets,
    form,
  };
}

export interface WcGroupOutlookRow {
  teamId: string;
  /** Lowest (best) final position still reachable. */
  bestPosition: number;
  /** Highest (worst) final position still possible. */
  worstPosition: number;
  /** Guaranteed a top-2 (automatic qualification) spot in every scenario. */
  guaranteedTop2: boolean;
  /** A top-2 finish is still mathematically possible. */
  canFinishTop2: boolean;
  /** True once every group game is played (positions are final). */
  decided: boolean;
}

/**
 * "What can still happen" for a group: enumerate every win/draw/loss outcome of
 * the remaining games and report each team's reachable finishing range, plus
 * whether they're already through or can still make the top two.
 *
 * Ranking here is points-only — goal-difference tie-breaks depend on exact
 * scorelines we can't enumerate — so tied teams contribute to BOTH a team's
 * best and worst possible position (an honest range rather than false certainty).
 */
export function groupOutlook(state: WorldCupState, group: string): WcGroupOutlookRow[] {
  const teams = state.teams.filter((t) => t.group === group).map((t) => t.id);
  if (teams.length === 0) return [];

  const basePts = new Map<string, number>(teams.map((id) => [id, 0]));
  const remaining: Array<[string, string]> = [];
  for (const m of state.matches) {
    if (m.stage !== 'group' || m.group !== group || !m.homeId || !m.awayId) continue;
    if (m.result) {
      const { home, away } = m.result;
      if (home > away) basePts.set(m.homeId, (basePts.get(m.homeId) ?? 0) + 3);
      else if (away > home) basePts.set(m.awayId, (basePts.get(m.awayId) ?? 0) + 3);
      else {
        basePts.set(m.homeId, (basePts.get(m.homeId) ?? 0) + 1);
        basePts.set(m.awayId, (basePts.get(m.awayId) ?? 0) + 1);
      }
    } else {
      remaining.push([m.homeId, m.awayId]);
    }
  }

  const n = remaining.length;
  const best = new Map<string, number>(teams.map((id) => [id, teams.length]));
  const worst = new Map<string, number>(teams.map((id) => [id, 1]));
  const total = 3 ** n; // each remaining game: home win / draw / away win
  for (let scenario = 0; scenario < total; scenario++) {
    const pts = new Map(basePts);
    let code = scenario;
    for (let i = 0; i < n; i++) {
      const outcome = code % 3;
      code = Math.floor(code / 3);
      const [h, a] = remaining[i]!;
      if (outcome === 0) pts.set(h, (pts.get(h) ?? 0) + 3);
      else if (outcome === 1) {
        pts.set(h, (pts.get(h) ?? 0) + 1);
        pts.set(a, (pts.get(a) ?? 0) + 1);
      } else pts.set(a, (pts.get(a) ?? 0) + 3);
    }
    for (const id of teams) {
      const p = pts.get(id)!;
      let above = 0;
      let atOrAbove = 0;
      for (const o of teams) {
        if (o === id) continue;
        const op = pts.get(o)!;
        if (op > p) {
          above++;
          atOrAbove++;
        } else if (op === p) atOrAbove++;
      }
      if (above + 1 < best.get(id)!) best.set(id, above + 1);
      if (atOrAbove + 1 > worst.get(id)!) worst.set(id, atOrAbove + 1);
    }
  }

  return teams.map((id) => ({
    teamId: id,
    bestPosition: best.get(id)!,
    worstPosition: worst.get(id)!,
    guaranteedTop2: worst.get(id)! <= 2,
    canFinishTop2: best.get(id)! <= 2,
    decided: n === 0,
  }));
}

// --- Seeding ---------------------------------------------------------------

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

/**
 * FIFA Men's World Ranking positions (June 2026) for the finalists, keyed by
 * team code. Static reference data — no live feed exposes it — looked up by id
 * so it works without touching stored board state. (Australia unconfirmed.)
 */
export const FIFA_RANKS: Record<string, number> = {
  ARG: 1,
  ESP: 2,
  FRA: 3,
  ENG: 4,
  POR: 5,
  BRA: 6,
  MAR: 7,
  NED: 8,
  BEL: 9,
  GER: 10,
  CRO: 11,
  COL: 13,
  MEX: 14,
  SEN: 15,
  URU: 16,
  USA: 17,
  JPN: 18,
  SUI: 19,
  IRN: 20,
  TUR: 22,
  ECU: 23,
  AUT: 24,
  KOR: 25,
  ALG: 28,
  EGY: 29,
  CAN: 30,
  NOR: 31,
  CIV: 33,
  PAN: 34,
  SWE: 38,
  CZE: 40,
  PAR: 41,
  SCO: 42,
  TUN: 45,
  COD: 46,
  UZB: 50,
  QAT: 56,
  IRQ: 57,
  RSA: 60,
  KSA: 61,
  JOR: 63,
  BIH: 64,
  CPV: 67,
  GHA: 73,
  CUW: 82,
  HAI: 83,
  NZL: 85,
};

/** Current FIFA world ranking for a team code, if known. */
export function fifaRankOf(teamId: string | undefined): number | undefined {
  return teamId ? FIFA_RANKS[teamId] : undefined;
}

export interface WcClimate {
  /** Elevation in metres. */
  altitude: number;
  /** Representative temperature in °C — a nation's home climate, or a venue's
   * typical June/July match-day conditions. */
  tempC: number;
}

/**
 * Each nation's representative home altitude + typical climate (by team code).
 * 2026 is hosted across sea-level heat (Houston, Miami) and serious altitude
 * (Mexico City 2,240 m), so a side used to thin air or fierce heat carries a
 * real edge. Static reference data — approximate, but the comparison is the fun.
 */
export const TEAM_CLIMATE: Record<string, WcClimate> = {
  MEX: { altitude: 2240, tempC: 17 },
  RSA: { altitude: 1753, tempC: 16 },
  KOR: { altitude: 38, tempC: 13 },
  CZE: { altitude: 200, tempC: 9 },
  CAN: { altitude: 76, tempC: 9 },
  BIH: { altitude: 500, tempC: 11 },
  QAT: { altitude: 10, tempC: 28 },
  SUI: { altitude: 540, tempC: 9 },
  BRA: { altitude: 1100, tempC: 22 },
  MAR: { altitude: 75, tempC: 18 },
  HAI: { altitude: 30, tempC: 27 },
  SCO: { altitude: 30, tempC: 9 },
  USA: { altitude: 100, tempC: 16 },
  PAR: { altitude: 130, tempC: 23 },
  AUS: { altitude: 19, tempC: 18 },
  TUR: { altitude: 938, tempC: 12 },
  GER: { altitude: 34, tempC: 10 },
  CUW: { altitude: 8, tempC: 28 },
  CIV: { altitude: 18, tempC: 27 },
  ECU: { altitude: 2850, tempC: 14 },
  NED: { altitude: 0, tempC: 10 },
  JPN: { altitude: 40, tempC: 16 },
  SWE: { altitude: 28, tempC: 7 },
  TUN: { altitude: 10, tempC: 19 },
  BEL: { altitude: 13, tempC: 10 },
  EGY: { altitude: 23, tempC: 22 },
  IRN: { altitude: 1200, tempC: 17 },
  NZL: { altitude: 26, tempC: 15 },
  ESP: { altitude: 667, tempC: 15 },
  CPV: { altitude: 30, tempC: 24 },
  KSA: { altitude: 612, tempC: 26 },
  URU: { altitude: 43, tempC: 17 },
  FRA: { altitude: 35, tempC: 12 },
  SEN: { altitude: 22, tempC: 25 },
  IRQ: { altitude: 34, tempC: 23 },
  NOR: { altitude: 23, tempC: 6 },
  ARG: { altitude: 25, tempC: 17 },
  ALG: { altitude: 24, tempC: 18 },
  AUT: { altitude: 151, tempC: 10 },
  JOR: { altitude: 757, tempC: 18 },
  POR: { altitude: 2, tempC: 17 },
  COD: { altitude: 240, tempC: 25 },
  UZB: { altitude: 455, tempC: 14 },
  COL: { altitude: 2640, tempC: 14 },
  ENG: { altitude: 11, tempC: 11 },
  CRO: { altitude: 122, tempC: 11 },
  GHA: { altitude: 61, tempC: 27 },
  PAN: { altitude: 2, tempC: 28 },
};

/** Each 2026 host venue's altitude + representative June/July match temperature. */
export const VENUE_CLIMATE: Record<string, WcClimate> = {
  Atlanta: { altitude: 320, tempC: 31 },
  'Bay Area': { altitude: 5, tempC: 24 },
  Boston: { altitude: 43, tempC: 27 },
  Dallas: { altitude: 165, tempC: 35 },
  Guadalajara: { altitude: 1566, tempC: 27 },
  Houston: { altitude: 15, tempC: 34 },
  'Kansas City': { altitude: 270, tempC: 31 },
  'Los Angeles': { altitude: 30, tempC: 28 },
  'Mexico City': { altitude: 2240, tempC: 23 },
  Miami: { altitude: 2, tempC: 32 },
  Monterrey: { altitude: 540, tempC: 35 },
  'New York New Jersey': { altitude: 7, tempC: 29 },
  Philadelphia: { altitude: 12, tempC: 30 },
  Seattle: { altitude: 53, tempC: 24 },
  Toronto: { altitude: 76, tempC: 26 },
  Vancouver: { altitude: 4, tempC: 22 },
};

export function teamClimate(teamId: string | undefined): WcClimate | undefined {
  return teamId ? TEAM_CLIMATE[teamId] : undefined;
}
export function venueClimate(venue: string | undefined): WcClimate | undefined {
  return venue ? VENUE_CLIMATE[venue] : undefined;
}

export interface WcClimateEdge {
  /** 'home' | 'away' | null — better suited to the altitude at this venue. */
  altitude: 'home' | 'away' | null;
  /** 'home' | 'away' | null — better suited to the heat at this venue. */
  heat: 'home' | 'away' | null;
}

/**
 * Who's better acclimatised to a venue's conditions: a high venue (≥1000 m)
 * favours the side used to more altitude; a hot venue (≥30 °C) favours the
 * hotter-climate side. Null on an axis the venue doesn't really stress.
 */
export function climateEdge(
  home: WcClimate | undefined,
  away: WcClimate | undefined,
  venue: WcClimate | undefined,
): WcClimateEdge {
  const edge: WcClimateEdge = { altitude: null, heat: null };
  if (!home || !away || !venue) return edge;
  // Only a side genuinely used to altitude (home ≥1000 m) earns the edge at a
  // high venue — being marginally higher than a lowland rival doesn't count.
  if (venue.altitude >= 1000) {
    if (home.altitude >= 1000 && home.altitude > away.altitude) edge.altitude = 'home';
    else if (away.altitude >= 1000 && away.altitude > home.altitude) edge.altitude = 'away';
  }
  // Likewise heat: a genuinely warm-climate side (home ≥22 °C) at a hot venue.
  if (venue.tempC >= 30) {
    if (home.tempC >= 22 && home.tempC > away.tempC) edge.heat = 'home';
    else if (away.tempC >= 22 && away.tempC > home.tempC) edge.heat = 'away';
  }
  return edge;
}

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
