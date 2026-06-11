import { WC_TIMEZONE } from '@dap/shared';

/** Locale-friendly formatters for the World Cup board, shown in Malta time. */

const LOCALE = 'en-GB';

/** "Thu 11 Jun" from a Malta-local "YYYY-MM-DD" day key. */
export function formatDay(dateKey: string): string {
  // Noon UTC is safely inside the same Malta calendar day.
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: WC_TIMEZONE,
  });
}

/** "Thursday 11 June" — fuller heading variant. */
export function formatDayLong(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: WC_TIMEZONE,
  });
}

/** "21:00" kick-off time in Malta time from an ISO timestamp. */
export function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: WC_TIMEZONE,
  });
}
