/**
 * Club Football name-lock authorisation, shared by the Worker and the web app.
 *
 * Same model as the World Cup board: a "predictor" is just a name in the synced
 * state, so a claimed name's picks may only be changed by its verified owner.
 * The email↔name binding lives in the Worker's private storage; only a per-
 * predictor `claimed` boolean is ever synced. The Worker enforces this on every
 * save via {@link authorizeClubWrite}. Session tokens and OTP/email helpers are
 * reused from `wcAuth.ts` (they're generic).
 */
import type { ClubLeagueState } from './clubleague.js';

/**
 * Fingerprint a predictor's ownership-bound data: their markets on fixtures that
 * still exist in `state`. A prediction dropped because its **fixture was removed**
 * (an automatic feed prune, or an organiser deleting a fixture) is deliberately
 * excluded, so routine fixture housekeeping is never mistaken for someone editing
 * a claimed player's picks.
 */
function fingerprint(
  state: ClubLeagueState,
  predictorId: string,
  liveFixtureIds: ReadonlySet<string>,
): string {
  return state.predictions
    .filter((p) => p.predictorId === predictorId && liveFixtureIds.has(p.fixtureId))
    .map((p) => `${p.fixtureId}:${p.outcome ?? ''}/${p.totals ?? ''}/${p.btts ?? ''}`)
    .sort()
    .join('|');
}

/** Predictor ids whose ownership-bound data differs between two states: their
 * markets or their presence / display name. Both fingerprints are taken over the
 * **surviving** (next) fixture set, so a prediction dropped because its fixture
 * was removed (feed prune / organiser delete) is not counted as an edit. */
export function changedClubPredictorIds(prev: ClubLeagueState, next: ClubLeagueState): Set<string> {
  const live = new Set(next.fixtures.map((f) => f.id));
  const prevName = new Map(prev.predictors.map((p) => [p.id, p.name]));
  const nextName = new Map(next.predictors.map((p) => [p.id, p.name]));
  const changed = new Set<string>();
  for (const id of new Set([...prevName.keys(), ...nextName.keys()])) {
    if (prevName.get(id) !== nextName.get(id))
      changed.add(id); // added, removed or renamed
    else if (fingerprint(prev, id, live) !== fingerprint(next, id, live)) changed.add(id);
  }
  return changed;
}

export interface ClubWriteAuth {
  ok: boolean;
  /** The claimed predictor a rejected save tried to touch. */
  lockedId?: string;
}

/**
 * Decide whether a full-state save is allowed. Any change to a **claimed**
 * predictor's markets/name/presence is permitted only by that predictor's
 * verified owner (`owner` = the predictorId from the request's session token).
 * Unclaimed predictors stay fully open, and organiser actions (entering results),
 * fixture-feed syncs and comments touch no claimed player's markets, so they're
 * never blocked.
 */
export function authorizeClubWrite(
  prev: ClubLeagueState,
  next: ClubLeagueState,
  claimedIds: ReadonlySet<string>,
  owner: string | null,
): ClubWriteAuth {
  for (const id of changedClubPredictorIds(prev, next)) {
    if (!claimedIds.has(id) || id === owner) continue;
    return { ok: false, lockedId: id };
  }
  return { ok: true };
}

/** Stamp the synced state's `claimed` flags from the authoritative server set,
 * so clients can show locks but can never forge the flag. Returns a new state
 * only if something changed (cheap identity check for the caller). */
export function stampClaimedClub(
  club: ClubLeagueState,
  claimedIds: ReadonlySet<string>,
): ClubLeagueState {
  let changed = false;
  const predictors = club.predictors.map((p) => {
    const claimed = claimedIds.has(p.id);
    if (!!p.claimed === claimed) return p;
    changed = true;
    return claimed ? { ...p, claimed: true } : { ...p, claimed: false };
  });
  return changed ? { ...club, predictors } : club;
}
