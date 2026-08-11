import { maltaDayKey } from './clubFormat.js';

/**
 * When the Club Football season kicks off — the opening day of the 2026/27
 * campaign. Expressed as the start of that day in Malta time (22:00Z on the
 * 15th = midnight on Sunday 16 August in Malta, CEST). The countdown poster
 * counts calendar days down to this day; the fixtures themselves still come
 * from the automatic feed, so this constant only drives the poster.
 */
export const CLUB_SEASON_KICKOFF = '2026-08-15T22:00:00.000Z';

export type PosterPhase = 'countdown' | 'today' | 'live';

export interface PosterCountdown {
  /** Whole Malta calendar days between `now` and the opening day (0 = today). */
  daysToGo: number;
  /** Exact time left until the opening day begins; all zeros once it has. */
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  phase: PosterPhase;
}

/** "YYYY-MM-DD" day key → UTC midnight ms, for exact calendar-day arithmetic. */
function dayKeyMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

const DAY_MS = 86_400_000;

/** The poster's countdown state at `now`, in Malta calendar days plus an exact
 * d/h/m/s ticker. Pure — the page re-runs it once a second. */
export function posterCountdown(now: Date, kickoff: string = CLUB_SEASON_KICKOFF): PosterCountdown {
  const daysToGo = Math.round(
    (dayKeyMs(maltaDayKey(kickoff)) - dayKeyMs(maltaDayKey(now.toISOString()))) / DAY_MS,
  );
  const msLeft = Math.max(0, new Date(kickoff).getTime() - now.getTime());
  return {
    daysToGo,
    days: Math.floor(msLeft / DAY_MS),
    hours: Math.floor(msLeft / 3_600_000) % 24,
    minutes: Math.floor(msLeft / 60_000) % 60,
    seconds: Math.floor(msLeft / 1_000) % 60,
    phase: daysToGo > 0 ? 'countdown' : daysToGo === 0 ? 'today' : 'live',
  };
}
