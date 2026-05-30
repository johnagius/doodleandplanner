import { usePhotoUrl } from '../../lib/usePhotoUrl.js';

export function ChatPhoto({
  slug,
  photoId,
  alt,
  onOpen,
}: {
  slug: string;
  photoId: string;
  alt: string;
  onOpen: () => void;
}) {
  const url = usePhotoUrl(slug, photoId);
  if (!url) return <span className="chat-photo-loading" aria-hidden />;
  return (
    <button className="chat-photo" onClick={onOpen} aria-label="Open photo">
      <img src={url} alt={alt} loading="lazy" />
    </button>
  );
}
