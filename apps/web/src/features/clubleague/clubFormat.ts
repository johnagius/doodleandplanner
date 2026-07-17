import { WC_TIMEZONE } from '@dap/shared';

/** Club Football board formatters — shown in Malta time to match the rest. */
const LOCALE = 'en-GB';
export const CLUB_TIMEZONE = WC_TIMEZONE;

/** "Saturday 15 August 2026" — day heading for a fixture. */
export function formatFixtureDayLong(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: CLUB_TIMEZONE,
  });
}

/** Malta-local calendar day key ("YYYY-MM-DD") for grouping fixtures by day. */
export function maltaDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: CLUB_TIMEZONE });
}

/** "16:30" kick-off time in Malta time. */
export function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: CLUB_TIMEZONE,
  });
}
