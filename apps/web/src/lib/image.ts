/** Client-side image downscaling so uploads stay small and fast. */

export interface DownscaledImage {
  blob: Blob;
  width: number;
  height: number;
}

function fit(w: number, h: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // `from-image` applies EXIF orientation so phone photos aren't sideways.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read image'));
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Downscale an image file to a JPEG no larger than `maxEdge` on its longest
 * side. Returns the encoded blob and its pixel dimensions.
 */
export async function downscaleImage(
  file: Blob,
  maxEdge = 1800,
  quality = 0.82,
): Promise<DownscaledImage> {
  const bitmap = await loadBitmap(file);
  const srcW = 'width' in bitmap ? bitmap.width : 0;
  const srcH = 'height' in bitmap ? bitmap.height : 0;
  const { width, height } = fit(srcW || 1, srcH || 1, maxEdge);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
  if ('close' in bitmap) (bitmap as ImageBitmap).close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob) throw new Error('Could not encode image');
  return { blob, width, height };
}
