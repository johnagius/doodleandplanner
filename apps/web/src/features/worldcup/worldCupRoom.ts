import {
  WC_SEED_VERSION,
  createRoom,
  emptyRoomState,
  seedWorldCup,
  type RoomState,
  type WorldCupState,
} from '@dap/shared';
import { getRepository, type Repository } from '../../lib/storage/index.js';

/**
 * Refresh a stale board's teams + fixtures to the current seed while keeping the
 * people: their names carry over, but predictions are cleared because the
 * matches (and their ids) have changed.
 */
function reseed(old: WorldCupState): WorldCupState {
  const fresh = seedWorldCup();
  return {
    ...fresh,
    predictors: old.predictors.length ? old.predictors : fresh.predictors,
    predictions: [],
    createdAt: old.createdAt,
  };
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
    // Up-to-date board: use it. Stale seed (older teams/fixtures): refresh in
    // place, keeping the predictors.
    if ((existing.worldCup.version ?? 1) >= WC_SEED_VERSION) return existing;
    return repo.saveRoom({ ...existing, worldCup: reseed(existing.worldCup) });
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
