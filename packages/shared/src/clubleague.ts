/**
 * Club Football Predictions — a self-contained, multi-competition prediction game.
 *
 * A small group of friends predicts every fixture played by a fixed set of clubs
 * (across their league, domestic cups and the Champions League). Instead of
 * guessing exact scorelines, each fixture offers three **markets**:
 *
 *   • Result   — 1 / X / 2 (home win / draw / away win)               → 3 pts
 *   • Goals    — Over / Under 2.5 (i.e. "3 or more goals?")           → 2 pts
 *   • BTTS     — will both teams score?                               → 2 pts
 *
 * Once per **period** each player may nominate one fixture as their **Banker**:
 * everything they earn on that fixture is doubled — the conviction lever that
 * rewards a brave call.
 *
 * The season is split into ordered **periods**. Within every period the field is
 * split into two divisions — **League 1** (the top players) and **League 2** —
 * and promotion/relegation swaps the bottom of L1 with the top of L2 between
 * periods, so the chasing pack always has a live race even if a leader runs away
 * with the overall total. The final period is a **Champions Run-In**: the top
 * contenders reset to level and fight out the title over the closing fixtures.
 *
 * Everything here is **pure, immutable and serialisable** so it can live inside a
 * {@link RoomState} and sync through the same Repository as the rest of the app.
 * Fixtures are organiser-managed (added, rescheduled and resulted by hand), which
 * is what lets kick-off dates and times change freely mid-season.
 */
import { generateId } from './ids.js';
import { toMs } from './time.js';
import type { ISODateTime } from './types.js';

// --- Teams & competitions --------------------------------------------------

/** A club we track. Fixtures reference these for a consistent crest/colour. */
export interface ClubTeam {
  /** Stable short code, e.g. "MUN". Also used as the team id. */
  id: string;
  name: string;
  /** 2–4 letter code shown in the compact team chip. */
  short: string;
  /** Chip accent colour (hex). */
  color: string;
  /** Country flag emoji for grouping. */
  country: string;
}

/** A competition a fixture belongs to (league, cup, Champions League…). */
export interface ClubCompetition {
  id: string;
  name: string;
  /** Short label for chips, e.g. "PL", "UCL". */
  short: string;
  /** Emoji shown alongside the competition. */
  emoji: string;
}

/**
 * One side of a fixture. Usually a tracked {@link ClubTeam} (via `teamId`), but
 * the opponent can be any club — organisers just type a name, so a side is fully
 * self-describing and scoring never depends on team identity.
 */
export interface ClubSide {
  name: string;
  short: string;
  color?: string;
  /** Set when this side is one of the tracked clubs. */
  teamId?: string;
}

/** The real-world full-time result of a fixture, entered by the organiser. */
export interface ClubResult {
  home: number;
  away: number;
}

export interface ClubFixture {
  id: string;
  competitionId: string;
  home: ClubSide;
  away: ClubSide;
  kickoff: ISODateTime;
  /** Global ordering fallback for a stable display when times are equal. */
  order: number;
  result?: ClubResult;
  /** Organiser note, e.g. "Postponed", "2nd leg". Purely informational. */
  note?: string;
}

// --- Predictions & people --------------------------------------------------

export type ClubOutcome = '1' | 'X' | '2';
export type ClubTotals = 'over' | 'under';
export type ClubBtts = 'yes' | 'no';

/** One person's markets for one fixture. Each market is independent and
 * optional — an unfilled market simply scores nothing. */
export interface ClubPrediction {
  fixtureId: string;
  predictorId: string;
  outcome?: ClubOutcome;
  totals?: ClubTotals;
  btts?: ClubBtts;
  /** Doubles everything earned on this fixture. At most one banker per predictor
   * per period (enforced by {@link setBanker}). */
  banker?: boolean;
  updatedAt: ISODateTime;
}

export interface ClubPredictor {
  id: string;
  name: string;
}

/** A named stretch of the season. Periods tile the calendar in order; a fixture
 * belongs to the period whose window contains its kick-off. */
export interface SeasonPeriod {
  id: string;
  name: string;
  startsAt: ISODateTime;
  /** Exclusive end. The last period may run open-ended (very far future). */
  endsAt: ISODateTime;
  /** Marks the closing period as the Champions Run-In (title decider). */
  runIn?: boolean;
}

/** The complete, serialisable Club Football state. */
export interface ClubLeagueState {
  season: string;
  title: string;
  /** Seed-data version, bumped when the seeded teams/competitions/periods change
   * so stale boards refresh in place. Absent ⇒ version 1. */
  version?: number;
  teams: ClubTeam[];
  competitions: ClubCompetition[];
  fixtures: ClubFixture[];
  predictors: ClubPredictor[];
  predictions: ClubPrediction[];
  periods: SeasonPeriod[];
  /** How many players sit in League 1 each period (the rest form League 2). */
  league1Size: number;
  /** How many top players contest the closing Champions Run-In. */
  runInContenders: number;
  createdAt: ISODateTime;
}

/** Bump when the seeded teams/competitions/periods change; older boards re-seed. */
export const CLUB_SEED_VERSION = 1;

// --- Scoring ---------------------------------------------------------------

/** Points per market. Tunable; surfaced in the in-app rules. */
export const CLUB_POINTS = {
  /** Correct 1 / X / 2. */
  result: 3,
  /** Correct Over/Under 2.5. */
  totals: 2,
  /** Correct both-teams-to-score. */
  btts: 2,
} as const;

/** The Over/Under line. 2.5 means "3 or more goals" = Over. */
export const CLUB_TOTALS_LINE = 2.5;

export interface ClubMarketOutcome {
  outcome: ClubOutcome;
  totals: ClubTotals;
  btts: ClubBtts;
}

/** Resolve a scoreline into the three market outcomes it settles. */
export function marketsForResult(r: ClubResult): ClubMarketOutcome {
  return {
    outcome: r.home > r.away ? '1' : r.home < r.away ? '2' : 'X',
    totals: r.home + r.away > CLUB_TOTALS_LINE ? 'over' : 'under',
    btts: r.home > 0 && r.away > 0 ? 'yes' : 'no',
  };
}

export interface ClubScoreBreakdown {
  /** Points from each market (0 if unfilled or wrong). */
  result: number;
  totals: number;
  btts: number;
  /** Which markets were correctly called. */
  hits: { result: boolean; totals: boolean; btts: boolean };
  /** Sum of the market points, before the banker multiplier. */
  base: number;
  banker: boolean;
  /** Final points for the fixture (base, doubled when bankered). */
  points: number;
}

/** Score a single prediction against the actual scoreline. */
export function scoreClubPrediction(
  pred: Pick<ClubPrediction, 'outcome' | 'totals' | 'btts' | 'banker'>,
  actual: ClubResult,
): ClubScoreBreakdown {
  const m = marketsForResult(actual);
  const hits = {
    result: pred.outcome != null && pred.outcome === m.outcome,
    totals: pred.totals != null && pred.totals === m.totals,
    btts: pred.btts != null && pred.btts === m.btts,
  };
  const result = hits.result ? CLUB_POINTS.result : 0;
  const totals = hits.totals ? CLUB_POINTS.totals : 0;
  const btts = hits.btts ? CLUB_POINTS.btts : 0;
  const base = result + totals + btts;
  const banker = !!pred.banker;
  return { result, totals, btts, hits, base, banker, points: banker ? base * 2 : base };
}

/** The most a single fixture can be worth (all three markets, bankered). */
export const CLUB_MAX_FIXTURE_POINTS =
  (CLUB_POINTS.result + CLUB_POINTS.totals + CLUB_POINTS.btts) * 2;

// --- Lookups & helpers -----------------------------------------------------

export function findClubTeam(
  state: ClubLeagueState,
  teamId: string | undefined,
): ClubTeam | undefined {
  if (!teamId) return undefined;
  return state.teams.find((t) => t.id === teamId);
}

export function findCompetition(state: ClubLeagueState, id: string): ClubCompetition | undefined {
  return state.competitions.find((c) => c.id === id);
}

export function findFixture(state: ClubLeagueState, id: string): ClubFixture | undefined {
  return state.fixtures.find((f) => f.id === id);
}

export function findClubPredictor(
  state: ClubLeagueState,
  id: string | undefined,
): ClubPredictor | undefined {
  if (!id) return undefined;
  return state.predictors.find((p) => p.id === id);
}

/** Fixtures sorted by kick-off (then stable order). */
export function orderedFixtures(state: ClubLeagueState): ClubFixture[] {
  return [...state.fixtures].sort((a, b) => toMs(a.kickoff) - toMs(b.kickoff) || a.order - b.order);
}

export function findPrediction(
  state: ClubLeagueState,
  fixtureId: string,
  predictorId: string,
): ClubPrediction | undefined {
  return state.predictions.find((p) => p.fixtureId === fixtureId && p.predictorId === predictorId);
}

/** Whether a fixture is closed to (non-organiser) predictions: kicked off or
 * already resulted. Rescheduling the kick-off re-opens it automatically. */
export function isFixtureLocked(fixture: ClubFixture, now: Date): boolean {
  return !!fixture.result || now.getTime() >= toMs(fixture.kickoff);
}

/** The period a fixture falls in (by kick-off), or undefined if it sits outside
 * every defined window. */
export function periodForKickoff(
  state: ClubLeagueState,
  kickoff: ISODateTime,
): SeasonPeriod | undefined {
  const ms = toMs(kickoff);
  return state.periods.find((p) => ms >= toMs(p.startsAt) && ms < toMs(p.endsAt));
}

export function periodForFixture(
  state: ClubLeagueState,
  fixture: ClubFixture,
): SeasonPeriod | undefined {
  return periodForKickoff(state, fixture.kickoff);
}

export function clubPlayedCount(state: ClubLeagueState): number {
  return state.fixtures.filter((f) => f.result).length;
}

/** Fixtures the given player still has open to predict at `now` (not locked and
 * missing at least one market). */
export function clubPendingForMe(
  state: ClubLeagueState,
  predictorId: string,
  now: Date,
): ClubFixture[] {
  return orderedFixtures(state).filter((f) => {
    if (isFixtureLocked(f, now)) return false;
    const pred = findPrediction(state, f.id, predictorId);
    return !pred || pred.outcome == null || pred.totals == null || pred.btts == null;
  });
}

/** Unlocked fixtures kicking off within `withinMs` the player hasn't fully picked. */
export function clubLockingSoon(
  state: ClubLeagueState,
  predictorId: string,
  now: Date,
  withinMs = 6 * 60 * 60 * 1000,
): ClubFixture[] {
  const t = now.getTime();
  return clubPendingForMe(state, predictorId, now).filter((f) => toMs(f.kickoff) - t <= withinMs);
}

// --- Season clubLeaderboard ----------------------------------------------------

export interface ClubLeaderRow {
  predictorId: string;
  name: string;
  points: number;
  /** Fixtures with at least one market scored. */
  scored: number;
  /** Correct result (1X2) calls. */
  resultsRight: number;
  /** Individual markets called correctly across all fixtures. */
  marketsRight: number;
  /** Bankers that have landed (been scored). */
  bankersHit: number;
}

function emptyRow(p: ClubPredictor): ClubLeaderRow {
  return {
    predictorId: p.id,
    name: p.name,
    points: 0,
    scored: 0,
    resultsRight: 0,
    marketsRight: 0,
    bankersHit: 0,
  };
}

/**
 * The overall season table — every player's cumulative points across all
 * resulted fixtures. `fixtureIds`, when given, restricts scoring to that subset
 * (used for per-period and run-in tables).
 */
export function clubLeaderboard(
  state: ClubLeagueState,
  opts?: { fixtureIds?: ReadonlySet<string> },
): ClubLeaderRow[] {
  const only = opts?.fixtureIds;
  const rows = new Map(state.predictors.map((p) => [p.id, emptyRow(p)]));
  for (const fixture of state.fixtures) {
    if (!fixture.result) continue;
    if (only && !only.has(fixture.id)) continue;
    for (const pred of state.predictions) {
      if (pred.fixtureId !== fixture.id) continue;
      const row = rows.get(pred.predictorId);
      if (!row) continue;
      const s = scoreClubPrediction(pred, fixture.result);
      row.points += s.points;
      const markets = (s.hits.result ? 1 : 0) + (s.hits.totals ? 1 : 0) + (s.hits.btts ? 1 : 0);
      if (markets > 0) row.scored++;
      row.marketsRight += markets;
      if (s.hits.result) row.resultsRight++;
      if (s.banker && s.base > 0) row.bankersHit++;
    }
  }
  return sortRows([...rows.values()]);
}

function sortRows(rows: ClubLeaderRow[]): ClubLeaderRow[] {
  return rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.resultsRight - a.resultsRight ||
      b.marketsRight - a.marketsRight ||
      a.name.localeCompare(b.name),
  );
}

export interface ClubLeaderRowRanked extends ClubLeaderRow {
  rank: number;
}

export function rankedLeaderboard(state: ClubLeagueState): ClubLeaderRowRanked[] {
  return clubLeaderboard(state).map((r, i) => ({ ...r, rank: i + 1 }));
}

// --- Periods, divisions, promotion / relegation ----------------------------

/** Ordered periods by start time. */
export function orderedPeriods(state: ClubLeagueState): SeasonPeriod[] {
  return [...state.periods].sort((a, b) => toMs(a.startsAt) - toMs(b.startsAt));
}

/** The set of resulted-fixture ids that belong to a period. */
function resultedFixtureIdsIn(state: ClubLeagueState, period: SeasonPeriod): Set<string> {
  const start = toMs(period.startsAt);
  const end = toMs(period.endsAt);
  return new Set(
    state.fixtures
      .filter((f) => f.result && toMs(f.kickoff) >= start && toMs(f.kickoff) < end)
      .map((f) => f.id),
  );
}

/** A player's points earned within a single period. */
export function periodPoints(state: ClubLeagueState, period: SeasonPeriod): ClubLeaderRow[] {
  return clubLeaderboard(state, { fixtureIds: resultedFixtureIdsIn(state, period) });
}

export type Division = 'league1' | 'league2';

export interface DivisionMovement {
  predictorId: string;
  /** 'promoted' / 'relegated' relative to the *previous* period, else 'same'. */
  change: 'promoted' | 'relegated' | 'same';
}

export interface PeriodDivisions {
  period: SeasonPeriod;
  /** True once at least one fixture in this period has a result. */
  started: boolean;
  /** Ranked period table for League 1 (empty in the opening period, which is a
   * single combined table under `combined`). */
  league1: ClubLeaderRow[];
  league2: ClubLeaderRow[];
  /** The opening period runs as one combined table (no split yet). */
  combined?: ClubLeaderRow[];
  /** Membership carried into this period (predictor id → division). */
  membership: Record<string, Division>;
  /** How each player moved versus the previous period. */
  movement: DivisionMovement[];
  /** Set on the closing period when the finale is active. */
  runIn?: RunIn;
}

export interface RunIn {
  /** Contenders (top of the season table entering the run-in), reset to level. */
  contenders: ClubLeaderRow[];
  /** Everyone else, still playing their normal division within the period. */
  others: ClubLeaderRow[];
}

/**
 * Rank players purely on a snapshot table, tie-broken by season standing so
 * membership is deterministic even before any period fixture is played.
 */
function orderBySnapshot(
  ids: string[],
  periodTable: ClubLeaderRow[],
  seasonRank: Map<string, number>,
): string[] {
  const pts = new Map(periodTable.map((r) => [r.predictorId, r.points]));
  return [...ids].sort(
    (a, b) =>
      (pts.get(b) ?? 0) - (pts.get(a) ?? 0) || (seasonRank.get(a) ?? 0) - (seasonRank.get(b) ?? 0),
  );
}

/**
 * Compute the division picture for every period, threading promotion/relegation
 * through the season.
 *
 * - The **opening** period is a single combined table. Its final order seeds the
 *   first split: the top `league1Size` go to League 1, the rest to League 2.
 * - Each later period inherits the previous period's membership, then applies
 *   promotion/relegation from the previous period's *within-division* results:
 *   the bottom of L1 swaps with the top of L2 (one up, one down).
 * - The **closing** period, when the finale is on, additionally pulls the top
 *   `runInContenders` (by season points entering the period) into a reset title
 *   decider; everyone else keeps playing their division.
 */
export function computeDivisions(state: ClubLeagueState): PeriodDivisions[] {
  const periods = orderedPeriods(state);
  const seasonRank = new Map(rankedLeaderboard(state).map((r) => [r.predictorId, r.rank]));
  const rowById = (table: ClubLeaderRow[]) => new Map(table.map((r) => [r.predictorId, r]));
  const out: PeriodDivisions[] = [];
  let membership: Record<string, Division> | null = null;

  periods.forEach((period, idx) => {
    const table = periodPoints(state, period);
    const byId = rowById(table);
    const started = resultedFixtureIdsIn(state, period).size > 0;
    const isRunIn = idx === periods.length - 1 && !!period.runIn && state.runInContenders > 0;

    if (idx === 0 || !membership) {
      // Opening period: one combined table; seed membership from its order.
      const ordered = table.map((r) => r.predictorId);
      const nextMembership: Record<string, Division> = {};
      ordered.forEach((id, i) => {
        nextMembership[id] = i < state.league1Size ? 'league1' : 'league2';
      });
      out.push({
        period,
        started,
        league1: [],
        league2: [],
        combined: table,
        membership: {},
        movement: table.map((r) => ({ predictorId: r.predictorId, change: 'same' as const })),
      });
      membership = nextMembership;
      return;
    }

    const prev = membership;
    const l1Ids = orderBySnapshot(
      table.filter((r) => prev[r.predictorId] === 'league1').map((r) => r.predictorId),
      table,
      seasonRank,
    );
    const l2Ids = orderBySnapshot(
      table.filter((r) => prev[r.predictorId] !== 'league1').map((r) => r.predictorId),
      table,
      seasonRank,
    );

    const movement: DivisionMovement[] = table.map((r) => ({
      predictorId: r.predictorId,
      change: 'same',
    }));
    const mark = (id: string, change: DivisionMovement['change']) => {
      const m = movement.find((x) => x.predictorId === id);
      if (m) m.change = change;
    };

    // Runners appearing in League 1 that were League 2 last period were promoted;
    // vice-versa relegated. Movement is derived from the membership diff below.
    const league1Rows = l1Ids.map((id) => byId.get(id)!).filter(Boolean);
    const league2Rows = l2Ids.map((id) => byId.get(id)!).filter(Boolean);

    let runIn: RunIn | undefined;
    if (isRunIn) {
      // Season standing entering the closing period decides the contenders.
      const beforeIds = new Set(
        periods.slice(0, idx).flatMap((p) => [...resultedFixtureIdsIn(state, p)]),
      );
      const seasonBefore = clubLeaderboard(state, { fixtureIds: beforeIds });
      const contenderIds = seasonBefore.slice(0, state.runInContenders).map((r) => r.predictorId);
      const contenderSet = new Set(contenderIds);
      runIn = {
        // Reset to level: rank the contenders purely on their run-in (period) points.
        contenders: sortRows(contenderIds.map((id) => byId.get(id)!).filter(Boolean)),
        others: table.filter((r) => !contenderSet.has(r.predictorId)),
      };
    }

    // Carry membership forward for the *next* period, applying promotion/relegation
    // from this period's within-division standings.
    const nextMembership: Record<string, Division> = { ...prev };
    if (l1Ids.length > 0 && l2Ids.length > 0) {
      const relegated = l1Ids[l1Ids.length - 1]!;
      const promoted = l2Ids[0]!;
      nextMembership[relegated] = 'league2';
      nextMembership[promoted] = 'league1';
    }

    // Movement of *this* period vs the previous membership.
    for (const id of Object.keys(prev)) {
      if (prev[id] === 'league2' && l1Ids.includes(id)) mark(id, 'promoted');
      if (prev[id] === 'league1' && l2Ids.includes(id)) mark(id, 'relegated');
    }

    out.push({
      period,
      started,
      league1: league1Rows,
      league2: league2Rows,
      membership: prev,
      movement,
      runIn,
    });
    membership = nextMembership;
  });

  return out;
}

// --- Mutations (pure) ------------------------------------------------------

function touch(now: () => Date): ISODateTime {
  return now().toISOString();
}

function nextOrder(state: ClubLeagueState): number {
  return state.fixtures.reduce((max, f) => Math.max(max, f.order), 0) + 1;
}

/** Set (or update) one or more markets of a prediction. Rejected once the
 * fixture is locked, unless `force` (organiser override) is passed. */
export function setClubPrediction(
  state: ClubLeagueState,
  input: {
    fixtureId: string;
    predictorId: string;
    outcome?: ClubOutcome;
    totals?: ClubTotals;
    btts?: ClubBtts;
  },
  opts: { now?: () => Date; force?: boolean } = {},
): ClubLeagueState {
  const now = opts.now ?? (() => new Date());
  const fixture = findFixture(state, input.fixtureId);
  if (!fixture) throw new Error('Unknown fixture');
  if (!opts.force && isFixtureLocked(fixture, now())) {
    throw new Error('This fixture is locked — predictions closed at kick-off.');
  }
  const existing = findPrediction(state, input.fixtureId, input.predictorId);
  const merged: ClubPrediction = {
    fixtureId: input.fixtureId,
    predictorId: input.predictorId,
    outcome: input.outcome ?? existing?.outcome,
    totals: input.totals ?? existing?.totals,
    btts: input.btts ?? existing?.btts,
    banker: existing?.banker,
    updatedAt: touch(now),
  };
  const predictions = existing
    ? state.predictions.map((p) => (p === existing ? merged : p))
    : [...state.predictions, merged];
  return { ...state, predictions };
}

/** Remove a player's whole prediction for a fixture. */
export function clearClubPrediction(
  state: ClubLeagueState,
  fixtureId: string,
  predictorId: string,
): ClubLeagueState {
  return {
    ...state,
    predictions: state.predictions.filter(
      (p) => !(p.fixtureId === fixtureId && p.predictorId === predictorId),
    ),
  };
}

/**
 * Nominate (or clear) a player's Banker for a fixture. Setting a banker clears
 * any other banker that player holds **in the same period**, so it stays one per
 * period. A banker requires an existing prediction on the fixture.
 */
export function setBanker(
  state: ClubLeagueState,
  fixtureId: string,
  predictorId: string,
  on: boolean,
  opts: { now?: () => Date; force?: boolean } = {},
): ClubLeagueState {
  const now = opts.now ?? (() => new Date());
  const fixture = findFixture(state, fixtureId);
  if (!fixture) throw new Error('Unknown fixture');
  if (!opts.force && isFixtureLocked(fixture, now())) {
    throw new Error('This fixture is locked — the banker can no longer change.');
  }
  const period = periodForFixture(state, fixture);
  const samePeriodFixtureIds = period
    ? new Set(
        state.fixtures.filter((f) => periodForFixture(state, f)?.id === period.id).map((f) => f.id),
      )
    : new Set([fixtureId]);

  let found = false;
  let predictions = state.predictions.map((p) => {
    if (p.predictorId !== predictorId) return p;
    if (p.fixtureId === fixtureId) {
      found = true;
      return { ...p, banker: on, updatedAt: touch(now) };
    }
    // Clear a rival banker in the same period when turning one on.
    if (on && p.banker && samePeriodFixtureIds.has(p.fixtureId)) {
      return { ...p, banker: false, updatedAt: touch(now) };
    }
    return p;
  });
  if (on && !found) {
    // No prediction yet — create a bare one carrying the banker flag.
    predictions = [...predictions, { fixtureId, predictorId, banker: true, updatedAt: touch(now) }];
  }
  return { ...state, predictions };
}

/** Organiser: enter (or overwrite) a fixture's full-time result. */
export function setFixtureResult(
  state: ClubLeagueState,
  fixtureId: string,
  result: ClubResult,
): ClubLeagueState {
  const fixture = findFixture(state, fixtureId);
  if (!fixture) throw new Error('Unknown fixture');
  if (result.home < 0 || result.away < 0) throw new Error('Scores cannot be negative');
  return {
    ...state,
    fixtures: state.fixtures.map((f) =>
      f.id === fixtureId ? { ...f, result: { home: result.home, away: result.away } } : f,
    ),
  };
}

export function clearFixtureResult(state: ClubLeagueState, fixtureId: string): ClubLeagueState {
  return {
    ...state,
    fixtures: state.fixtures.map((f) => {
      if (f.id !== fixtureId) return f;
      const { result: _drop, ...rest } = f;
      return rest;
    }),
  };
}

export interface FixtureDraft {
  competitionId: string;
  home: ClubSide;
  away: ClubSide;
  kickoff: ISODateTime;
  note?: string;
}

/** Organiser: add a new fixture. */
export function addFixture(state: ClubLeagueState, draft: FixtureDraft): ClubLeagueState {
  if (!findCompetition(state, draft.competitionId)) throw new Error('Unknown competition');
  const fixture: ClubFixture = {
    id: generateId('cf'),
    competitionId: draft.competitionId,
    home: draft.home,
    away: draft.away,
    kickoff: draft.kickoff,
    order: nextOrder(state),
    note: draft.note?.trim() || undefined,
  };
  return { ...state, fixtures: [...state.fixtures, fixture] };
}

/** Organiser: edit a fixture — reschedule the kick-off, fix teams, add a note.
 * Rescheduling to the future automatically re-opens predictions. */
export function updateFixture(
  state: ClubLeagueState,
  fixtureId: string,
  patch: Partial<Pick<ClubFixture, 'competitionId' | 'home' | 'away' | 'kickoff' | 'note'>>,
): ClubLeagueState {
  const fixture = findFixture(state, fixtureId);
  if (!fixture) throw new Error('Unknown fixture');
  if (patch.competitionId && !findCompetition(state, patch.competitionId)) {
    throw new Error('Unknown competition');
  }
  return {
    ...state,
    fixtures: state.fixtures.map((f) =>
      f.id === fixtureId
        ? {
            ...f,
            ...patch,
            note: patch.note !== undefined ? patch.note.trim() || undefined : f.note,
          }
        : f,
    ),
  };
}

/** Organiser: delete a fixture and any predictions made on it. */
export function removeFixture(state: ClubLeagueState, fixtureId: string): ClubLeagueState {
  return {
    ...state,
    fixtures: state.fixtures.filter((f) => f.id !== fixtureId),
    predictions: state.predictions.filter((p) => p.fixtureId !== fixtureId),
  };
}

export function addClubPredictor(state: ClubLeagueState, name: string): ClubLeagueState {
  const clean = name.trim();
  if (!clean) throw new Error('Name is required');
  if (state.predictors.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error('That name is already taken');
  }
  return {
    ...state,
    predictors: [...state.predictors, { id: generateId('clp'), name: clean }],
  };
}

export function renameClubPredictor(
  state: ClubLeagueState,
  id: string,
  name: string,
): ClubLeagueState {
  const clean = name.trim();
  if (!clean) throw new Error('Name is required');
  return {
    ...state,
    predictors: state.predictors.map((p) => (p.id === id ? { ...p, name: clean } : p)),
  };
}

export function removeClubPredictor(state: ClubLeagueState, id: string): ClubLeagueState {
  return {
    ...state,
    predictors: state.predictors.filter((p) => p.id !== id),
    predictions: state.predictions.filter((p) => p.predictorId !== id),
  };
}

// --- Seed ------------------------------------------------------------------

const TEAMS: ClubTeam[] = [
  { id: 'MUN', name: 'Manchester United', short: 'MUN', color: '#DA020E', country: '🏴' },
  { id: 'TOT', name: 'Tottenham Hotspur', short: 'TOT', color: '#132257', country: '🏴' },
  { id: 'MCI', name: 'Manchester City', short: 'MCI', color: '#6CABDD', country: '🏴' },
  { id: 'LIV', name: 'Liverpool', short: 'LIV', color: '#C8102E', country: '🏴' },
  { id: 'ARS', name: 'Arsenal', short: 'ARS', color: '#EF0107', country: '🏴' },
  { id: 'RMA', name: 'Real Madrid', short: 'RMA', color: '#FEBE10', country: '🇪🇸' },
  { id: 'BAR', name: 'FC Barcelona', short: 'BAR', color: '#A50044', country: '🇪🇸' },
  { id: 'INT', name: 'Inter Milan', short: 'INT', color: '#010E80', country: '🇮🇹' },
  { id: 'JUV', name: 'Juventus', short: 'JUV', color: '#000000', country: '🇮🇹' },
  { id: 'MIL', name: 'AC Milan', short: 'MIL', color: '#FB090B', country: '🇮🇹' },
];

const COMPETITIONS: ClubCompetition[] = [
  { id: 'epl', name: 'Premier League', short: 'PL', emoji: '🏴' },
  { id: 'laliga', name: 'La Liga', short: 'LaLiga', emoji: '🇪🇸' },
  { id: 'seriea', name: 'Serie A', short: 'Serie A', emoji: '🇮🇹' },
  { id: 'ucl', name: 'Champions League', short: 'UCL', emoji: '🏆' },
  { id: 'uel', name: 'Europa League', short: 'UEL', emoji: '🥈' },
  { id: 'facup', name: 'FA Cup', short: 'FA Cup', emoji: '🏴' },
  { id: 'efl', name: 'EFL Cup', short: 'EFL Cup', emoji: '🏴' },
  { id: 'copa', name: 'Copa del Rey', short: 'Copa', emoji: '🇪🇸' },
  { id: 'coppa', name: 'Coppa Italia', short: 'Coppa', emoji: '🇮🇹' },
];

const PREDICTOR_NAMES = ['John', 'Noel', 'Daniel', 'Saviour', 'Manuel', 'Kevin', 'Jonathan'];

const PERIODS: SeasonPeriod[] = [
  {
    id: 'p1',
    name: 'Opening',
    startsAt: '2026-08-01T00:00:00.000Z',
    endsAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'p2',
    name: 'Autumn',
    startsAt: '2026-11-01T00:00:00.000Z',
    endsAt: '2027-02-01T00:00:00.000Z',
  },
  {
    id: 'p3',
    name: 'Spring',
    startsAt: '2027-02-01T00:00:00.000Z',
    endsAt: '2027-05-01T00:00:00.000Z',
  },
  {
    id: 'p4',
    name: 'Champions Run-In',
    startsAt: '2027-05-01T00:00:00.000Z',
    endsAt: '2027-07-01T00:00:00.000Z',
    runIn: true,
  },
];

function side(teamId: string): ClubSide {
  const t = TEAMS.find((x) => x.id === teamId)!;
  return { name: t.name, short: t.short, color: t.color, teamId: t.id };
}

function opponent(name: string, short: string): ClubSide {
  return { name, short };
}

/** A small illustrative set of opening fixtures — organisers edit/replace these
 * with the real calendar as the season unfolds. */
function seedFixtures(): ClubFixture[] {
  const raw: Omit<ClubFixture, 'id' | 'order'>[] = [
    {
      competitionId: 'epl',
      home: side('MUN'),
      away: side('ARS'),
      kickoff: '2026-08-15T16:30:00.000Z',
    },
    {
      competitionId: 'epl',
      home: side('LIV'),
      away: opponent('Everton', 'EVE'),
      kickoff: '2026-08-15T14:00:00.000Z',
    },
    {
      competitionId: 'epl',
      home: opponent('Chelsea', 'CHE'),
      away: side('TOT'),
      kickoff: '2026-08-16T15:30:00.000Z',
    },
    {
      competitionId: 'epl',
      home: side('MCI'),
      away: opponent('Newcastle', 'NEW'),
      kickoff: '2026-08-16T13:00:00.000Z',
    },
    {
      competitionId: 'laliga',
      home: side('RMA'),
      away: opponent('Sevilla', 'SEV'),
      kickoff: '2026-08-17T19:00:00.000Z',
    },
    {
      competitionId: 'laliga',
      home: opponent('Atlético Madrid', 'ATM'),
      away: side('BAR'),
      kickoff: '2026-08-18T19:00:00.000Z',
    },
    {
      competitionId: 'seriea',
      home: side('INT'),
      away: side('MIL'),
      kickoff: '2026-08-22T18:45:00.000Z',
    },
    {
      competitionId: 'seriea',
      home: side('JUV'),
      away: opponent('Napoli', 'NAP'),
      kickoff: '2026-08-23T18:45:00.000Z',
    },
  ];
  return raw.map((f, i) => ({ ...f, id: generateId('cf'), order: i + 1 }));
}

/** Build a fresh Club Football board. */
export function seedClubLeague(now: () => Date = () => new Date()): ClubLeagueState {
  return {
    season: '2026/27',
    title: 'Club Football Predictions',
    version: CLUB_SEED_VERSION,
    teams: TEAMS,
    competitions: COMPETITIONS,
    fixtures: seedFixtures(),
    predictors: PREDICTOR_NAMES.map((name) => ({ id: generateId('clp'), name })),
    predictions: [],
    periods: PERIODS,
    league1Size: 4,
    runInContenders: 3,
    createdAt: now().toISOString(),
  };
}
