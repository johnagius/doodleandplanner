import {
  WC_SEED_VERSION,
  createRoom,
  emptyRoomState,
  populateBracket,
  seedWorldCup,
  type RoomState,
  type WorldCupState,
} from '@dap/shared';
import { getRepository, SaveLockedError, type Repository } from '../../lib/storage/index.js';

/**
 * Migrate a stale board onto the current seed, keeping everything that was played
 * for real and discarding only what the seed change invalidated.
 *
 * **Group games are sacred** — every group prediction and every entered group
 * result carries over untouched (group fixtures and their ids are unchanged), so
 * nobody's group scoring shifts. The match *structure* (the corrected knockout
 * bracket) comes from the fresh seed, and the knockout slots re-populate from the
 * preserved group results.
 *
 * **Knockout predictions are cleared** (the default): any pick made against the
 * old, wrongly-wired bracket is dropped so no one is scored on a tie that never
 * existed. Champion picks, reactions and player identities are kept. Clearing a
 * *claimed* predictor's knockout picks is allowed by the Worker only as part of a
 * seed-version upgrade (see `authorizeWcWrite`); `keepKnockoutPicks` is the
 * caller's fallback if an older Worker still rejects that.
 */
export function reseed(
  old: WorldCupState,
  opts: { keepKnockoutPicks?: boolean } = {},
): WorldCupState {
  const fresh = seedWorldCup();
  const groupMatchIds = new Set(fresh.matches.filter((m) => m.stage === 'group').map((m) => m.id));
  // Carry entered group results across (group fixtures + ids are unchanged); the
  // knockout teams then re-populate from them under the corrected bracket.
  const oldById = new Map(old.matches.map((m) => [m.id, m]));
  const matches = fresh.matches.map((m) => {
    const prior = m.stage === 'group' ? oldById.get(m.id) : undefined;
    return prior?.result ? { ...m, result: prior.result } : m;
  });
  const migrated: WorldCupState = {
    ...fresh,
    predictors: old.predictors.length ? old.predictors : fresh.predictors,
    // Keep every group prediction exactly; drop knockout picks unless asked to
    // keep them (the fallback for a Worker that can't yet authorise the clear).
    predictions: opts.keepKnockoutPicks
      ? old.predictions
      : old.predictions.filter((p) => groupMatchIds.has(p.matchId)),
    championPicks: old.championPicks,
    matchReactions: old.matchReactions,
    cardReactions: old.cardReactions,
    odds: old.odds,
    createdAt: old.createdAt,
    matches,
  };
  return populateBracket(migrated);
}

/**
 * The World Cup board is a single, shared "room" so it can ride the same
 * persistence + realtime sync as everything else. This well-known slug is how
 * every device finds the one board.
 */
export const WORLD_CUP_SLUG = 'world-cup';

/**
 * Load the shared World Cup board, seeding it the first time anyone opens it.
 * Tolerates the race where two devices create it at once (second one re-reads).
 */
export async function loadOrCreateWorldCup(repo: Repository = getRepository()): Promise<RoomState> {
  const existing = await repo.getRoom(WORLD_CUP_SLUG);
  if (existing?.worldCup) {
    // Up-to-date board: use it. Stale seed: migrate in place (keeps group games +
    // people, clears knockout picks from the old bracket).
    if ((existing.worldCup.version ?? 1) >= WC_SEED_VERSION) return existing;
    try {
      return await repo.saveRoom({ ...existing, worldCup: reseed(existing.worldCup) });
    } catch (err) {
      if (!(err instanceof SaveLockedError)) throw err;
      // An older Worker can't yet authorise clearing a claimed predictor's
      // knockout picks. Ship the corrected bracket anyway (keeping those picks)
      // but stay on the old version, so the clear is retried once the Worker
      // catches up — and the board opens now instead of erroring.
      const safe = reseed(existing.worldCup, { keepKnockoutPicks: true });
      return repo.saveRoom({
        ...existing,
        worldCup: { ...safe, version: existing.worldCup.version },
      });
    }
  }
  if (existing) {
    // Room exists but predates the World Cup feature — seed it in place.
    return repo.saveRoom({ ...existing, worldCup: seedWorldCup() });
  }

  const { room } = await createRoom({
    name: 'World Cup 2026 Predictions',
    ownerName: 'Predictions',
    slug: WORLD_CUP_SLUG,
  });
  const state: RoomState = { ...emptyRoomState(room), worldCup: seedWorldCup() };
  try {
    await repo.createRoom(state);
    return state;
  } catch {
    // Someone beat us to it — use theirs.
    const again = await repo.getRoom(WORLD_CUP_SLUG);
    if (again) return again;
    throw new Error('Could not open the World Cup board');
  }
}
