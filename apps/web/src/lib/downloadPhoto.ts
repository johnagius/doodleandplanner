import { getRepository } from './storage/index.js';

function safeName(s: string): string {
  return (
    s
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'photo'
  );
}

/** Fetch a photo's bytes and trigger a browser download. */
export async function downloadPhoto(
  slug: string,
  photoId: string,
  caption?: string,
): Promise<void> {
  const blob = await getRepository().getPhotoBlob(slug, photoId);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(caption || 'photo')}-${photoId.slice(-6)}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
