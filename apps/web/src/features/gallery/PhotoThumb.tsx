import type { Photo } from '@dap/shared';
import { usePhotoUrl } from '../../lib/usePhotoUrl.js';

export function PhotoThumb({
  slug,
  photo,
  selectable = false,
  selected = false,
  onOpen,
}: {
  slug: string;
  photo: Photo;
  selectable?: boolean;
  selected?: boolean;
  onOpen: () => void;
}) {
  const url = usePhotoUrl(slug, photo.id);
  return (
    <button
      className={`gallery-thumb ${selected ? 'selected' : ''}`}
      onClick={onOpen}
      aria-pressed={selectable ? selected : undefined}
      aria-label={photo.caption || (selectable ? 'Select photo' : 'Open photo')}
    >
      {url ? (
        <img src={url} alt={photo.caption ?? ''} loading="lazy" />
      ) : (
        <span className="gallery-thumb-loading" aria-hidden />
      )}
      {photo.caption && <span className="gallery-thumb-cap">{photo.caption}</span>}
      {selectable && <span className={`gallery-check ${selected ? 'on' : ''}`} aria-hidden />}
    </button>
  );
}
