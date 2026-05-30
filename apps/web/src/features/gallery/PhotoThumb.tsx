import type { Photo } from '@dap/shared';
import { usePhotoUrl } from '../../lib/usePhotoUrl.js';

export function PhotoThumb({
  slug,
  photo,
  onOpen,
}: {
  slug: string;
  photo: Photo;
  onOpen: () => void;
}) {
  const url = usePhotoUrl(slug, photo.id);
  return (
    <button className="gallery-thumb" onClick={onOpen} aria-label={photo.caption || 'Open photo'}>
      {url ? (
        <img src={url} alt={photo.caption ?? ''} loading="lazy" />
      ) : (
        <span className="gallery-thumb-loading" aria-hidden />
      )}
      {photo.caption && <span className="gallery-thumb-cap">{photo.caption}</span>}
    </button>
  );
}
