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

/**
 * A team's brand colour nudged so the live score stays readable on both themes.
 * ESPN hands back raw kit colours and several are pure white (Saudi Arabia, Iran)
 * or black (New Zealand) — those vanish on the white card or in dark mode (the
 * "missing score" bug). We keep the hue but pull the luminance into a legible
 * mid-band. Returns undefined for a missing/invalid colour so the caller falls
 * back to its default text colour.
 */
export function legibleScoreColor(hex: string | null | undefined): string | undefined {
  if (!hex) return undefined;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  const body = m?.[1];
  if (!body) return undefined;
  const n = parseInt(body, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b; // perceived brightness, 0..255
  const MAX = 175; // lighter than this washes out on the white card
  const MIN = 75; //  darker than this disappears in dark mode
  if (lum > MAX) {
    const f = MAX / lum; // darken toward black, preserving hue
    r *= f;
    g *= f;
    b *= f;
  } else if (lum < MIN) {
    const f = (MIN - lum) / (255 - lum); // lighten toward white, preserving hue
    r += (255 - r) * f;
    g += (255 - g) * f;
    b += (255 - b) * f;
  } else {
    return `#${body.toLowerCase()}`;
  }
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
