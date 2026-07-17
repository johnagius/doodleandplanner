import { WC_TIMEZONE } from '@dap/shared';

/** Club Football board formatters — shown in Malta time to match the rest. */
const LOCALE = 'en-GB';
export const CLUB_TIMEZONE = WC_TIMEZONE;

/** "Sat 15 Aug" for a fixture's date. */
export function formatFixtureDay(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: CLUB_TIMEZONE,
  });
}

/** "Saturday 15 August" — fuller heading variant. */
export function formatFixtureDayLong(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: CLUB_TIMEZONE,
  });
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

/** Malta-local calendar day key ("YYYY-MM-DD") for grouping fixtures by day. */
export function dayKey(iso: string): string {
  // en-CA yields ISO-style YYYY-MM-DD, evaluated in the Malta zone.
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: CLUB_TIMEZONE });
}

/** Value for a <input type="datetime-local"> from an ISO string, in Malta time. */
export function toLocalInput(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLUB_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/**
 * Convert a <input type="datetime-local"> value (interpreted as Malta wall-clock)
 * back to a UTC ISO string. Computes the zone's offset at that instant so summer
 * time is handled correctly.
 */
export function fromLocalInput(local: string): string {
  // Treat the entered wall-clock as if it were UTC, then correct by the Malta
  // offset at that moment.
  const asUtc = new Date(`${local}:00.000Z`);
  const offsetMin = maltaOffsetMinutes(asUtc);
  return new Date(asUtc.getTime() - offsetMin * 60_000).toISOString();
}

/** Malta's UTC offset (in minutes) at a given instant. */
function maltaOffsetMinutes(at: Date): number {
  const tz = new Intl.DateTimeFormat('en-US', {
    timeZone: CLUB_TIMEZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(tz.find((p) => p.type === t)?.value);
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asIfUtc - at.getTime()) / 60_000);
}
