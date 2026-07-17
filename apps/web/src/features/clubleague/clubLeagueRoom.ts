import {
  CLUB_SEED_VERSION,
  createRoom,
  emptyRoomState,
  seedClubLeague,
  type ClubLeagueState,
  type RoomState,
} from '@dap/shared';
import { getRepository, type Repository } from '../../lib/storage/index.js';

/**
 * The Club Football board is a single, shared "room" so it rides the same
 * persistence + realtime sync as everything else. This well-known slug is how
 * every device finds the one board.
 */
export const CLUB_LEAGUE_SLUG = 'club-league';

/**
 * Migrate a stale board onto the current seed. Fixtures, predictions, people and
 * entered results are all user data — they carry across untouched. Only the
 * static scaffolding (teams, competitions, periods, tuning) is refreshed from the
 * new seed, so a seed bump never wipes a live season.
 */
export function reseed(old: ClubLeagueState): ClubLeagueState {
  const fresh = seedClubLeague();
  return {
    ...old,
    version: CLUB_SEED_VERSION,
    teams: fresh.teams,
    competitions: fresh.competitions,
    // Keep the organiser's own periods/tuning if they've been customised beyond
    // the seed; otherwise adopt the fresh defaults.
    periods: old.periods.length ? old.periods : fresh.periods,
    league1Size: old.league1Size || fresh.league1Size,
    runInContenders: old.runInContenders || fresh.runInContenders,
  };
}

/**
 * Load the shared Club Football board, seeding it the first time anyone opens it.
 * Tolerates the race where two devices create it at once (second one re-reads).
 */
export async function loadOrCreateClubLeague(
  repo: Repository = getRepository(),
): Promise<RoomState> {
  const existing = await repo.getRoom(CLUB_LEAGUE_SLUG);
  if (existing?.clubLeague) {
    if ((existing.clubLeague.version ?? 1) >= CLUB_SEED_VERSION) return existing;
    return repo.saveRoom({ ...existing, clubLeague: reseed(existing.clubLeague) });
  }
  if (existing) {
    // Room exists but predates the Club Football feature — seed it in place.
    return repo.saveRoom({ ...existing, clubLeague: seedClubLeague() });
  }

  const { room } = await createRoom({
    name: 'Club Football Predictions',
    ownerName: 'Predictions',
    slug: CLUB_LEAGUE_SLUG,
  });
  const state: RoomState = { ...emptyRoomState(room), clubLeague: seedClubLeague() };
  try {
    await repo.createRoom(state);
    return state;
  } catch {
    const again = await repo.getRoom(CLUB_LEAGUE_SLUG);
    if (again) return again;
    throw new Error('Could not open the Club Football board');
  }
}
