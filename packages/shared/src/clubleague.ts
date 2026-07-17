/**
 * Club Football Predictions — a self-contained, multi-competition prediction game.
 *
 * A small group of friends predicts every fixture played by a fixed set of clubs
 * across every competition they're in — league, domestic cups and Europe. Each
 * fixture offers three **markets**:
 *
 *   • Result   — 1 / X / 2 (home win / draw / away win)               → 3 pts
 *   • Goals    — Over / Under 2.5 (i.e. "3 or more goals?")           → 2 pts
 *   • BTTS     — will both teams score?                               → 2 pts
 *
 * The season is split into ordered **periods**. Within every period the field is
 * split into two divisions — **League 1** (the top players) and **League 2** —
 * and promotion/relegation swaps the bottom of L1 with the top of L2 between
 * periods, so the chasing pack always has a live race even if a leader runs away
 * with the overall total. The final period is a **Champions Run-In**: the top
 * contenders reset to level and fight out the title over the closing fixtures.
 *
 * **Fixtures are automatic.** They're pulled from a live feed of every game our
 * clubs play: new cup rounds appear as they're drawn, an eliminated club's future
 * cup games never show up, and kick-off dates/times self-adjust when they move.
 * Finished games auto-fill their result. The organiser only ever steps in for an
 * edge case — e.g. correcting a cup tie that went to extra time so the 90-minute
 * markets settle right — via a manual override the feed then leaves alone.
 *
 * Everything here is **pure, immutable and serialisable** so it can live inside a
 * {@link RoomState} and sync through the same Repository as the rest of the app.
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
  /** Emoji fallback shown when the official logo can't load. */
  emoji: string;
  /** Official competition logo URL. */
  logo?: string;
}

/**
 * One side of a fixture. Usually a tracked {@link ClubTeam} (via `teamId`), but
 * the opponent can be any club — the feed carries a name/abbreviation, so a side
 * is fully self-describing and scoring never depends on team identity.
 */
export interface ClubSide {
  name: string;
  short: string;
  color?: string;
  /** Official club crest URL (from the feed, or derived for a tracked club). */
  crest?: string;
  /** Set when this side is one of the tracked clubs. */
  teamId?: string;
}

/** The official ESPN crest URL for a given ESPN team id. */
export function espnCrestUrl(espnId: string): string {
  return `https://a.espncdn.com/i/teamlogos/soccer/500/${espnId}.png`;
}

/** The real-world full-time result of a fixture. */
export interface ClubResult {
  home: number;
  away: number;
}

/** Feed status of a fixture. */
export type ClubFixtureStatus = 'scheduled' | 'live' | 'final';

/** A goal or card during a match, from the live feed. Display-only. */
export interface ClubMatchEvent {
  kind: 'goal' | 'own-goal' | 'penalty' | 'yellow' | 'red';
  team: 'home' | 'away';
  player?: string;
  /** Display clock, e.g. "67'". */
  clock?: string;
}

/** Ephemeral in-play info for a fixture — never persisted, held on the device for
 * live display + "as it stands" scoring. */
export interface ClubLiveInfo {
  home: number;
  away: number;
  minute?: number | null;
  /** Short status text, e.g. "HT", "67'". */
  detail?: string | null;
  status: ClubFixtureStatus;
  events?: ClubMatchEvent[];
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
  /** Stable id of the source feed event (e.g. "espn:707980"). Present on every
   * feed-sourced fixture; the reconciler keys off it. Absent ⇒ organiser-added. */
  externalId?: string;
  /** Latest status from the feed. */
  status?: ClubFixtureStatus;
  /** Set when the organiser hand-enters a result (e.g. an extra-time correction).
   * The feed will not overwrite a manual result. */
  resultManual?: boolean;
  /** Organiser note, e.g. "2nd leg". Purely informational. */
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
  updatedAt: ISODateTime;
}

export interface ClubPredictor {
  id: string;
  name: string;
  /** Server-set: true once an email has been verified for this name. Clients can
   * read it (to show a lock) but cannot forge it — the Worker recomputes it on
   * every save from its private bindings. */
  claimed?: boolean;
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
  /** When the fixture feed was last successfully applied (ISO). */
  feedSyncedAt?: ISODateTime;
  createdAt: ISODateTime;
}

/** Bump when the seeded teams/competitions/periods change; older boards re-seed. */
export const CLUB_SEED_VERSION = 5;

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

/** The most a single fixture can be worth (all three markets right). */
export const CLUB_MAX_FIXTURE_POINTS = CLUB_POINTS.result + CLUB_POINTS.totals + CLUB_POINTS.btts;

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
  /** Total points for the fixture. */
  points: number;
}

/** Score a single prediction against the actual scoreline. */
export function scoreClubPrediction(
  pred: Pick<ClubPrediction, 'outcome' | 'totals' | 'btts'>,
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
  return { result, totals, btts, hits, points: result + totals + btts };
}

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

/** Whether a fixture is closed to predictions: kicked off or already resulted.
 * A feed reschedule to the future re-opens it automatically. */
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

// --- Season leaderboard ----------------------------------------------------

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
}

function emptyRow(p: ClubPredictor): ClubLeaderRow {
  return {
    predictorId: p.id,
    name: p.name,
    points: 0,
    scored: 0,
    resultsRight: 0,
    marketsRight: 0,
  };
}

/**
 * The overall season table — every player's cumulative points across all
 * resulted fixtures. `fixtureIds`, when given, restricts scoring to that subset
 * (used for per-period and run-in tables). `liveScores` folds in-play games into
 * the totals "as it stands" (fixtureId → current score) — a provisional fixture
 * with no final result yet is scored against its live score.
 */
export function clubLeaderboard(
  state: ClubLeagueState,
  opts?: { fixtureIds?: ReadonlySet<string>; liveScores?: Record<string, ClubResult> },
): ClubLeaderRow[] {
  const only = opts?.fixtureIds;
  const live = opts?.liveScores;
  const rows = new Map(state.predictors.map((p) => [p.id, emptyRow(p)]));
  for (const fixture of state.fixtures) {
    const result = fixture.result ?? live?.[fixture.id];
    if (!result) continue;
    if (only && !only.has(fixture.id)) continue;
    for (const pred of state.predictions) {
      if (pred.fixtureId !== fixture.id) continue;
      const row = rows.get(pred.predictorId);
      if (!row) continue;
      const s = scoreClubPrediction(pred, result);
      row.points += s.points;
      const markets = (s.hits.result ? 1 : 0) + (s.hits.totals ? 1 : 0) + (s.hits.btts ? 1 : 0);
      if (markets > 0) row.scored++;
      row.marketsRight += markets;
      if (s.hits.result) row.resultsRight++;
    }
  }
  return sortRows([...rows.values()]);
}

export interface ClubLeaderRowMoved extends ClubLeaderRowRanked {
  /** Places climbed since before the live games folded in (+up, −down, 0 same). */
  movement: number;
}

/** Season table with rank + how each player has moved once the live "as it
 * stands" scores are folded in — the World-Cup-style who-pips-who. */
export function clubLeaderboardWithMovement(
  state: ClubLeagueState,
  liveScores?: Record<string, ClubResult>,
): ClubLeaderRowMoved[] {
  const live = clubLeaderboard(state, liveScores ? { liveScores } : undefined);
  const settled = liveScores ? clubLeaderboard(state) : live;
  const prevRank = new Map(settled.map((r, i) => [r.predictorId, i + 1]));
  return live.map((r, i) => ({
    ...r,
    rank: i + 1,
    movement: (prevRank.get(r.predictorId) ?? i + 1) - (i + 1),
  }));
}

/**
 * Human notes for how a live score change swings the markets — "one team
 * equalises → now a draw, favours Daniel". Pure: pass the previous and new live
 * score; returns a note per market that flipped.
 */
export function clubLiveSwings(
  state: ClubLeagueState,
  fixtureId: string,
  prev: ClubResult | null,
  next: ClubResult,
): string[] {
  const pm = prev ? marketsForResult(prev) : null;
  const nm = marketsForResult(next);
  const preds = state.predictions.filter((p) => p.fixtureId === fixtureId);
  const nameOf = (id: string) => state.predictors.find((p) => p.id === id)?.name;
  const who = (pick: (p: ClubPrediction) => boolean): string[] =>
    preds
      .filter(pick)
      .map((p) => nameOf(p.predictorId))
      .filter((n): n is string => !!n);
  const notes: string[] = [];
  if (!pm || pm.outcome !== nm.outcome) {
    const label = nm.outcome === '1' ? 'a home win' : nm.outcome === '2' ? 'an away win' : 'a draw';
    const names = who((p) => p.outcome === nm.outcome);
    notes.push(`Now ${label}${names.length ? ` — favours ${names.join(', ')}` : ''}`);
  }
  if (!pm || pm.totals !== nm.totals) {
    const names = who((p) => p.totals === nm.totals);
    notes.push(
      `${nm.totals === 'over' ? 'Over' : 'Under'} 2.5 now${names.length ? ` — favours ${names.join(', ')}` : ''}`,
    );
  }
  if ((!pm || pm.btts !== nm.btts) && nm.btts === 'yes') {
    const names = who((p) => p.btts === 'yes');
    notes.push(`Both teams have scored${names.length ? ` — favours ${names.join(', ')}` : ''}`);
  }
  return notes;
}

export interface ClubRivalry {
  rank: number;
  of: number;
  points: number;
  /** The player directly above (to catch) and below (to hold off), with the gap. */
  ahead?: { name: string; gap: number };
  behind?: { name: string; gap: number };
}

/** "Where you stand" for one player — rank plus the gap to the rivals either
 * side, folding in live scores when given. */
export function clubRivalry(
  state: ClubLeagueState,
  predictorId: string,
  liveScores?: Record<string, ClubResult>,
): ClubRivalry | null {
  const rows = clubLeaderboard(state, liveScores ? { liveScores } : undefined);
  const i = rows.findIndex((r) => r.predictorId === predictorId);
  if (i < 0) return null;
  const me = rows[i]!;
  const above = rows[i - 1];
  const below = rows[i + 1];
  return {
    rank: i + 1,
    of: rows.length,
    points: me.points,
    ahead: above ? { name: above.name, gap: above.points - me.points } : undefined,
    behind: below ? { name: below.name, gap: me.points - below.points } : undefined,
  };
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
  /** Elite finale — the top contenders overall, reset to level, playing for the
   * top trophy. Set on the closing period when the finale is active. */
  runIn?: RunIn;
  /** Second-tier finale — the top of League 2, reset to level, playing for the
   * lesser trophy. Set on the closing period when the finale is active. */
  runInSecond?: RunIn;
  /** Anyone in neither run-in, still playing out the closing period. */
  runInOthers?: ClubLeaderRow[];
}

export interface RunIn {
  /** Which trophy this run-in decides. */
  trophy: ClubTrophy;
  /** Contenders, reset to level and ranked purely on their run-in points. */
  contenders: ClubLeaderRow[];
}

export interface ClubTrophy {
  /** Name of the run-in competition, e.g. "Champions Run-In". */
  runInName: string;
  /** Name of the trophy on the line, e.g. "The Champions' Crown". */
  name: string;
  /** Which drawn mark represents it. */
  icon: 'trophy' | 'shield';
  /** Emoji fallback for compact/plain contexts. */
  emoji: string;
}

/** The elite finale for the leaders — the most prestigious league prize. */
export const CLUB_TROPHY_TOP: ClubTrophy = {
  runInName: 'Master League Run-In',
  name: 'Master League Trophy',
  icon: 'trophy',
  emoji: '🏆',
};

/** The second-tier finale for the top of League 2 — a prize of its own. */
export const CLUB_TROPHY_SECOND: ClubTrophy = {
  runInName: 'First Division Run-In',
  name: 'First Division Shield',
  icon: 'shield',
  emoji: '🛡️',
};

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
  const out: PeriodDivisions[] = [];
  let prevMembership: Record<string, Division> | null = null;

  periods.forEach((period, idx) => {
    const table = periodPoints(state, period); // this period's points, for ranking within a division
    const byId = new Map(table.map((r) => [r.predictorId, r]));
    const started = resultedFixtureIdsIn(state, period).size > 0;
    const isRunIn = idx === periods.length - 1 && !!period.runIn && state.runInContenders > 0;

    // Divisions are re-cut from the CUMULATIVE season table as the period opens:
    // the top `league1Size` sit in League 1, the rest in League 2. This is stable
    // (a quiet period never scrambles anyone) and reads as promotion/relegation
    // between periods — you move up or down with where you stand on the table.
    const beforeIds = new Set(
      periods.slice(0, idx).flatMap((p) => [...resultedFixtureIdsIn(state, p)]),
    );
    const orderBefore = clubLeaderboard(state, { fixtureIds: beforeIds }).map((r) => r.predictorId);

    if (idx === 0) {
      // Opening period: one combined table, no split yet.
      out.push({
        period,
        started,
        league1: [],
        league2: [],
        combined: table,
        membership: {},
        movement: table.map((r) => ({ predictorId: r.predictorId, change: 'same' as const })),
      });
      // Seed the first split from the opening period's own standings.
      const openingOrder = table.map((r) => r.predictorId);
      prevMembership = Object.fromEntries(
        openingOrder.map((id, i) => [id, i < state.league1Size ? 'league1' : 'league2']),
      );
      return;
    }

    const membership: Record<string, Division> = Object.fromEntries(
      orderBefore.map((id, i) => [id, i < state.league1Size ? 'league1' : 'league2']),
    );
    const prev = prevMembership;
    const movement: DivisionMovement[] = table.map((r) => {
      const now = membership[r.predictorId];
      const was = prev?.[r.predictorId];
      const change: DivisionMovement['change'] =
        !was || was === now ? 'same' : now === 'league1' ? 'promoted' : 'relegated';
      return { predictorId: r.predictorId, change };
    });

    // Period tables are ranked by this period's points (already sorted), split by
    // the cumulative-standing membership.
    const league1Rows = table.filter((r) => membership[r.predictorId] === 'league1');
    const league2Rows = table.filter((r) => membership[r.predictorId] !== 'league1');

    let runIn: RunIn | undefined;
    let runInSecond: RunIn | undefined;
    let runInOthers: ClubLeaderRow[] | undefined;
    if (isRunIn) {
      // Elite: the top of League 1 (= the top contenders overall) play for the Crown.
      const eliteIds = orderBefore
        .filter((id) => membership[id] === 'league1')
        .slice(0, state.runInContenders);
      // Second tier: the top of League 2 play for the Plate. Disjoint from the elite
      // because the divisions never overlap.
      const secondIds = orderBefore
        .filter((id) => membership[id] === 'league2')
        .slice(0, state.runInContenders);
      const inRunIn = new Set([...eliteIds, ...secondIds]);
      // Reset to level: rank each run-in purely on its run-in (period) points.
      runIn = {
        trophy: CLUB_TROPHY_TOP,
        contenders: sortRows(eliteIds.map((id) => byId.get(id)!).filter(Boolean)),
      };
      if (secondIds.length > 0) {
        runInSecond = {
          trophy: CLUB_TROPHY_SECOND,
          contenders: sortRows(secondIds.map((id) => byId.get(id)!).filter(Boolean)),
        };
      }
      runInOthers = table.filter((r) => !inRunIn.has(r.predictorId));
    }

    out.push({
      period,
      started,
      league1: league1Rows,
      league2: league2Rows,
      membership,
      movement,
      runIn,
      runInSecond,
      runInOthers,
    });
    prevMembership = membership;
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

/** Organiser: enter (or overwrite) a fixture's full-time result. Marks it manual
 * so the feed won't clobber the correction (e.g. an extra-time adjustment). */
export function setFixtureResult(
  state: ClubLeagueState,
  fixtureId: string,
  result: ClubResult,
  opts: { manual?: boolean } = {},
): ClubLeagueState {
  const fixture = findFixture(state, fixtureId);
  if (!fixture) throw new Error('Unknown fixture');
  if (result.home < 0 || result.away < 0) throw new Error('Scores cannot be negative');
  return {
    ...state,
    fixtures: state.fixtures.map((f) =>
      f.id === fixtureId
        ? {
            ...f,
            result: { home: result.home, away: result.away },
            status: 'final',
            resultManual: opts.manual ? true : f.resultManual,
          }
        : f,
    ),
  };
}

/** Organiser: clear a fixture's result (and its manual flag). */
export function clearFixtureResult(state: ClubLeagueState, fixtureId: string): ClubLeagueState {
  return {
    ...state,
    fixtures: state.fixtures.map((f) => {
      if (f.id !== fixtureId) return f;
      const { result: _r, resultManual: _m, ...rest } = f;
      return rest;
    }),
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

// --- Fixture feed (automatic) ----------------------------------------------

/** One fixture as delivered by the live feed (produced by the Worker from the
 * upstream football provider). Pure data, so the reconciler unit-tests easily. */
export interface ClubFeedFixture {
  /** Stable source id, e.g. "espn:707980". */
  externalId: string;
  competitionId: string;
  kickoff: ISODateTime;
  home: ClubSide;
  away: ClubSide;
  status: ClubFixtureStatus;
  /** Present once the game is final (the 90-minute regulation score). */
  result?: ClubResult;
  /** In-play score + minute (live games) — ephemeral, never persisted. */
  live?: ClubLiveInfo;
}

/** Re-apply our tracked club's canonical name/short/colour to a side that the
 * feed tagged with one of our team ids, so crests stay consistent. */
function enrichSide(state: ClubLeagueState, side: ClubSide): ClubSide {
  const team = side.teamId ? findClubTeam(state, side.teamId) : undefined;
  if (!team) return side;
  // Keep our canonical name/short/colour; keep the feed crest, or derive the
  // official one from the tracked club's ESPN id.
  const espnId = CLUB_ESPN_TEAM_IDS[team.id];
  const crest = side.crest ?? (espnId ? espnCrestUrl(espnId) : undefined);
  return { name: team.name, short: team.short, color: team.color, crest, teamId: team.id };
}

/**
 * Reconcile the board against the latest feed. This is the automatic-fixtures
 * engine:
 *
 * - **New** feed fixtures are added (new cup rounds appear as they're drawn).
 * - **Existing** feed fixtures update in place — kick-off, competition, teams and
 *   status all self-adjust; a final score auto-fills unless the organiser has hand-
 *   set a manual result.
 * - **Vanished** feed fixtures that never kicked off and have no result are removed
 *   (a cancelled game, or a cup round an eliminated club will now never play),
 *   dropping their predictions with them.
 *
 * The feed is a rolling *window* of upcoming games (the next week or two), so a
 * fixture is only pruned when it disappears from **within the covered window** —
 * a game scheduled beyond the window simply isn't fetched yet and must be left
 * alone. Pass `window` (the [from, to] the feed actually covered) so pruning
 * stays scoped; without it, any vanished unplayed fixture is pruned.
 *
 * Organiser-added fixtures (no `externalId`) and manual results are never touched.
 * Predictions survive because a fixture keeps its stable local id across updates.
 */
export function syncClubFeed(
  state: ClubLeagueState,
  feed: ClubFeedFixture[],
  opts: { now?: () => Date; window?: { from: ISODateTime; to: ISODateTime } } = {},
): ClubLeagueState {
  const now = opts.now ?? (() => new Date());
  const nowMs = now().getTime();
  const winFrom = opts.window ? toMs(opts.window.from) : -Infinity;
  const winTo = opts.window ? toMs(opts.window.to) : Infinity;
  const byExt = new Map(state.fixtures.filter((f) => f.externalId).map((f) => [f.externalId!, f]));
  const feedIds = new Set(feed.map((f) => f.externalId));
  let order = nextOrder(state);

  // Update existing + add new.
  const touched = new Set<string>();
  let fixtures = state.fixtures.map((f) => {
    if (!f.externalId) return f; // organiser-added — never touched by the feed
    const inc = feed.find((x) => x.externalId === f.externalId);
    if (!inc) return f;
    touched.add(f.externalId);
    const keepManual = f.resultManual && f.result;
    return {
      ...f,
      competitionId: inc.competitionId,
      home: enrichSide(state, inc.home),
      away: enrichSide(state, inc.away),
      kickoff: inc.kickoff,
      status: inc.status,
      result: keepManual ? f.result : (inc.result ?? f.result),
    };
  });

  for (const inc of feed) {
    if (byExt.has(inc.externalId)) continue;
    fixtures.push({
      id: generateId('cf'),
      externalId: inc.externalId,
      competitionId: inc.competitionId,
      home: enrichSide(state, inc.home),
      away: enrichSide(state, inc.away),
      kickoff: inc.kickoff,
      order: order++,
      status: inc.status,
      result: inc.result,
    });
  }

  // Remove vanished, unplayed feed fixtures (cancelled / now-impossible cup games)
  // — but only within the window the feed actually covered, so a game scheduled
  // beyond the window (not yet fetched) is never wrongly dropped.
  const removedIds = new Set<string>();
  fixtures = fixtures.filter((f) => {
    if (!f.externalId || feedIds.has(f.externalId)) return true;
    const played = !!f.result || nowMs >= toMs(f.kickoff);
    if (played) return true; // keep anything that actually happened
    const k = toMs(f.kickoff);
    if (k < winFrom || k > winTo) return true; // outside the covered window — keep
    removedIds.add(f.id);
    return false;
  });

  const predictions = removedIds.size
    ? state.predictions.filter((p) => !removedIds.has(p.fixtureId))
    : state.predictions;

  return { ...state, fixtures, predictions, feedSyncedAt: touch(now) };
}

// --- ESPN feed configuration (used by the Worker) --------------------------

/** ESPN's public soccer team ids for our tracked clubs. The Worker queries each
 * club's schedule across the league slugs below to assemble every fixture. */
export const CLUB_ESPN_TEAM_IDS: Record<string, string> = {
  MUN: '360',
  TOT: '367',
  MCI: '382',
  LIV: '364',
  ARS: '359',
  RMA: '86',
  BAR: '83',
  INT: '110',
  JUV: '111',
  MIL: '103',
};

/** ESPN league slug → our competition id, with the scope that decides which
 * clubs are queried in it (a nation's clubs, or every club for UEFA). */
export interface ClubEspnLeague {
  slug: string;
  competitionId: string;
  scope: 'ENG' | 'ESP' | 'ITA' | 'UEFA';
}

export const CLUB_ESPN_LEAGUES: ClubEspnLeague[] = [
  { slug: 'eng.1', competitionId: 'epl', scope: 'ENG' },
  { slug: 'eng.fa', competitionId: 'facup', scope: 'ENG' },
  { slug: 'eng.league_cup', competitionId: 'efl', scope: 'ENG' },
  { slug: 'eng.charity', competitionId: 'charity', scope: 'ENG' },
  { slug: 'esp.1', competitionId: 'laliga', scope: 'ESP' },
  { slug: 'esp.copa_del_rey', competitionId: 'copa', scope: 'ESP' },
  { slug: 'esp.super_cup', competitionId: 'essup', scope: 'ESP' },
  { slug: 'ita.1', competitionId: 'seriea', scope: 'ITA' },
  { slug: 'ita.coppa_italia', competitionId: 'coppa', scope: 'ITA' },
  { slug: 'ita.super_cup', competitionId: 'itsup', scope: 'ITA' },
  { slug: 'uefa.champions', competitionId: 'ucl', scope: 'UEFA' },
  { slug: 'uefa.europa', competitionId: 'uel', scope: 'UEFA' },
  { slug: 'uefa.super_cup', competitionId: 'usup', scope: 'UEFA' },
  { slug: 'fifa.cwc', competitionId: 'cwc', scope: 'UEFA' },
];

/** Which nation each tracked club belongs to, for league scoping. */
export const CLUB_ESPN_NATION: Record<string, 'ENG' | 'ESP' | 'ITA'> = {
  MUN: 'ENG',
  TOT: 'ENG',
  MCI: 'ENG',
  LIV: 'ENG',
  ARS: 'ENG',
  RMA: 'ESP',
  BAR: 'ESP',
  INT: 'ITA',
  JUV: 'ITA',
  MIL: 'ITA',
};

/** ESPN team id → our tracked team id (reverse of {@link CLUB_ESPN_TEAM_IDS}). */
export const CLUB_TEAM_BY_ESPN_ID: Record<string, string> = Object.fromEntries(
  Object.entries(CLUB_ESPN_TEAM_IDS).map(([teamId, espnId]) => [espnId, teamId]),
);

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

const LEAGUE_LOGO = (id: string): string =>
  `https://a.espncdn.com/i/leaguelogos/soccer/500/${id}.png`;

const COMPETITIONS: ClubCompetition[] = [
  { id: 'epl', name: 'Premier League', short: 'PL', emoji: '🏴', logo: LEAGUE_LOGO('23') },
  { id: 'laliga', name: 'La Liga', short: 'LaLiga', emoji: '🇪🇸', logo: LEAGUE_LOGO('15') },
  { id: 'seriea', name: 'Serie A', short: 'Serie A', emoji: '🇮🇹', logo: LEAGUE_LOGO('12') },
  { id: 'ucl', name: 'Champions League', short: 'UCL', emoji: '🏆', logo: LEAGUE_LOGO('2') },
  { id: 'uel', name: 'Europa League', short: 'UEL', emoji: '🥈', logo: LEAGUE_LOGO('2310') },
  { id: 'facup', name: 'FA Cup', short: 'FA Cup', emoji: '🏴', logo: LEAGUE_LOGO('40') },
  { id: 'efl', name: 'EFL Cup', short: 'EFL Cup', emoji: '🏴', logo: LEAGUE_LOGO('41') },
  { id: 'copa', name: 'Copa del Rey', short: 'Copa', emoji: '🇪🇸', logo: LEAGUE_LOGO('80') },
  { id: 'coppa', name: 'Coppa Italia', short: 'Coppa', emoji: '🇮🇹', logo: LEAGUE_LOGO('2192') },
  { id: 'charity', name: 'Community Shield', short: 'Shield', emoji: '🛡️' },
  {
    id: 'usup',
    name: 'UEFA Super Cup',
    short: 'Super Cup',
    emoji: '🏆',
    logo: LEAGUE_LOGO('1272'),
  },
  {
    id: 'cwc',
    name: 'FIFA Club World Cup',
    short: 'Club WC',
    emoji: '🌍',
    logo: LEAGUE_LOGO('1932'),
  },
  {
    id: 'essup',
    name: 'Spanish Super Cup',
    short: 'Supercopa',
    emoji: '🇪🇸',
    logo: LEAGUE_LOGO('431'),
  },
  { id: 'itsup', name: 'Italian Super Cup', short: 'Supercoppa', emoji: '🇮🇹' },
  { id: 'other', name: 'Other', short: 'Other', emoji: '⚽' },
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

/** Build a fresh Club Football board. Fixtures start empty and are populated by
 * the live feed the first time it syncs. */
export function seedClubLeague(now: () => Date = () => new Date()): ClubLeagueState {
  return {
    season: '2026/27',
    title: 'Club Football',
    version: CLUB_SEED_VERSION,
    teams: TEAMS,
    competitions: COMPETITIONS,
    fixtures: [],
    predictors: PREDICTOR_NAMES.map((name) => ({ id: generateId('clp'), name })),
    predictions: [],
    periods: PERIODS,
    league1Size: 4,
    runInContenders: 3,
    createdAt: now().toISOString(),
  };
}
