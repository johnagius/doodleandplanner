/**
 * Lightweight reverse geocoding via OpenStreetMap's free Nominatim service.
 * We only need a coarse **country** (plus an optional locality label) to group
 * photos into albums, so we request a low zoom and fail soft on any error.
 */
export interface GeoPlace {
  country?: string;
  place?: string;
}

export interface GeoResult {
  label: string;
  lat: number;
  lng: number;
}

/**
 * Forward geocoding: turn a free-text query ("Colosseum, Rome") into candidate
 * locations via Nominatim. Returns up to `limit` results; empty on any failure.
 */
export async function forwardGeocode(query: string, limit = 5): Promise<GeoResult[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2` +
      `&q=${encodeURIComponent(q)}&limit=${limit}&accept-language=en`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = (await res.json()) as { display_name?: string; lat?: string; lon?: string }[];
    return data
      .filter((d) => d.lat && d.lon)
      .map((d) => ({ label: d.display_name ?? q, lat: Number(d.lat), lng: Number(d.lon) }))
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  } catch {
    return [];
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoPlace> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=8&accept-language=en`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return {};
    const data = (await res.json()) as { address?: Record<string, string> };
    const a = data.address ?? {};
    return {
      country: a.country,
      place: a.city ?? a.town ?? a.village ?? a.state ?? a.county,
    };
  } catch {
    return {};
  }
}

/** Promisified one-shot geolocation read. Rejects if denied/unavailable. */
export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60000,
    });
  });
}
