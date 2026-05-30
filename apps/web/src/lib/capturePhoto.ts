import { getCurrentPosition, reverseGeocode } from './geocode.js';
import { downscaleImage } from './image.js';

export interface CapturedPhoto {
  blob: Blob;
  width: number;
  height: number;
  lat?: number;
  lng?: number;
  country?: string;
  place?: string;
}

/**
 * Turn a picked/captured image file into an upload-ready, optionally geotagged
 * photo: downscale, then (best-effort) read the device location and
 * reverse-geocode it to a country. Location failures are swallowed.
 */
export async function capturePhoto(file: Blob, tagLocation: boolean): Promise<CapturedPhoto> {
  const { blob, width, height } = await downscaleImage(file);
  if (!tagLocation) return { blob, width, height };
  try {
    const pos = await getCurrentPosition();
    const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
    return { blob, width, height, lat: pos.coords.latitude, lng: pos.coords.longitude, ...place };
  } catch {
    return { blob, width, height };
  }
}
