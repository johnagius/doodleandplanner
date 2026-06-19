import { venueCoords } from '@dap/shared';
import { useEffect, useState } from 'react';

/**
 * Live match-day forecast for a venue from Open-Meteo — a free, CORS-enabled,
 * no-key weather API (10k calls/day). Gives the actual kickoff conditions,
 * complementing our static climate estimate. Cached + de-duped per venue/day;
 * null when the venue is unknown, the match is outside the forecast window, or
 * we're offline.
 */
export interface VenueForecast {
  tempC: number;
  precipPct: number;
  windKph: number;
  emoji: string;
  label: string;
}

/** YYYY-MM-DD (UTC) from a kickoff ISO string. */
export function forecastDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Open-Meteo's free forecast spans ~16 days ahead (and the last day or two), so
 * only fetch for matches in that window — older/further games use the estimate. */
export function withinForecastWindow(iso: string, now: number = Date.now()): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const days = (t - now) / 86_400_000;
  return days >= -1.5 && days <= 15.5;
}

/** WMO weather code → a compact emoji + label. */
export function wmoLook(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: '☀️', label: 'Clear' };
  if (code <= 2) return { emoji: '🌤️', label: 'Mostly clear' };
  if (code === 3) return { emoji: '☁️', label: 'Cloudy' };
  if (code <= 48) return { emoji: '🌫️', label: 'Fog' };
  if (code <= 57) return { emoji: '🌦️', label: 'Drizzle' };
  if (code <= 67) return { emoji: '🌧️', label: 'Rain' };
  if (code <= 77) return { emoji: '🌨️', label: 'Snow' };
  if (code <= 82) return { emoji: '🌦️', label: 'Showers' };
  if (code <= 86) return { emoji: '🌨️', label: 'Snow showers' };
  return { emoji: '⛈️', label: 'Thunderstorm' };
}

interface OpenMeteoHourly {
  time?: string[];
  temperature_2m?: number[];
  precipitation_probability?: number[];
  wind_speed_10m?: number[];
  weather_code?: number[];
}

const cache = new Map<string, VenueForecast | null>();
const inflight = new Map<string, Promise<VenueForecast | null>>();

const cacheKey = (venue: string, iso: string) => `${venue}|${forecastDate(iso)}`;

async function fetchForecast(venue: string, kickoffIso: string): Promise<VenueForecast | null> {
  const c = venueCoords(venue);
  if (!c) return null;
  try {
    const date = forecastDate(kickoffIso);
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}` +
      `&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code` +
      `&timezone=UTC&start_date=${date}&end_date=${date}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { hourly?: OpenMeteoHourly };
    const h = data.hourly;
    if (!h?.time?.length) return null;
    const hour = kickoffIso.slice(11, 13);
    let idx = h.time.findIndex((t) => t.slice(11, 13) === hour);
    if (idx < 0) idx = Math.min(h.time.length - 1, 12); // fall back to midday
    const at = (arr: number[] | undefined): number | null =>
      arr && typeof arr[idx] === 'number' ? arr[idx]! : null;
    const temp = at(h.temperature_2m);
    if (temp == null) return null;
    const look = wmoLook(at(h.weather_code) ?? 0);
    return {
      tempC: Math.round(temp),
      precipPct: Math.round(at(h.precipitation_probability) ?? 0),
      windKph: Math.round(at(h.wind_speed_10m) ?? 0),
      emoji: look.emoji,
      label: look.label,
    };
  } catch {
    return null;
  }
}

export async function fetchVenueForecast(
  venue: string,
  kickoffIso: string,
): Promise<VenueForecast | null> {
  const key = cacheKey(venue, kickoffIso);
  if (cache.has(key)) return cache.get(key) ?? null;
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = fetchForecast(venue, kickoffIso);
  inflight.set(key, promise);
  const result = await promise;
  cache.set(key, result);
  inflight.delete(key);
  return result;
}

export function useVenueForecast(
  venue: string | undefined,
  kickoffIso: string | undefined,
): { forecast: VenueForecast | null; loading: boolean } {
  const enabled =
    !!venue && !!kickoffIso && !!venueCoords(venue) && withinForecastWindow(kickoffIso);
  const key = enabled ? cacheKey(venue!, kickoffIso!) : '';
  const [forecast, setForecast] = useState<VenueForecast | null>(() =>
    key ? (cache.get(key) ?? null) : null,
  );
  const [loading, setLoading] = useState(enabled && !cache.has(key));
  useEffect(() => {
    if (!enabled) {
      setForecast(null);
      setLoading(false);
      return;
    }
    if (cache.has(key)) {
      setForecast(cache.get(key) ?? null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void fetchVenueForecast(venue!, kickoffIso!).then((f) => {
      if (active) {
        setForecast(f);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [enabled, key, venue, kickoffIso]);
  return { forecast, loading };
}
