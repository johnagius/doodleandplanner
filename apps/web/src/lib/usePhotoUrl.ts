import { useEffect, useState } from 'react';
import { getRepository } from './storage/index.js';

/**
 * Resolve a displayable URL for a stored photo. With the Worker backend this is
 * the cacheable endpoint URL; in client-only mode we read the blob from
 * IndexedDB and hand back an object URL (revoked on cleanup).
 */
export function usePhotoUrl(slug: string, photoId: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const repo = getRepository();
    if (repo.photoEndpoint) {
      setUrl(repo.photoEndpoint(slug, photoId));
      return;
    }
    let alive = true;
    let objectUrl: string | null = null;
    void repo.getPhotoBlob(slug, photoId).then((blob) => {
      if (alive && blob) {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      }
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [slug, photoId]);
  return url;
}
