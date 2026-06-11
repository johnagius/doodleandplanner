/** Small, locale-friendly formatters for the World Cup board (UTC-based). */

const LOCALE = 'en-GB';

/** "Thu 11 Jun" from a "YYYY-MM-DD" day key. */
export function formatDay(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** "Thursday 11 June" — fuller heading variant. */
export function formatDayLong(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** "16:00" kickoff time (UTC) from an ISO timestamp. */
export function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
}
