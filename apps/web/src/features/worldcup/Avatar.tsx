import { useEffect, useState, type CSSProperties } from 'react';
import { usePhotoUrl } from '../../lib/usePhotoUrl.js';
import { WORLD_CUP_SLUG } from './worldCupRoom.js';

/** First + last initial, e.g. "John Agius" → "JA". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

/** Deterministic hue (0–359) from the name, for a stable fallback colour. */
function hue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/** A predictor's profile picture (from the shared photo store) or a coloured
 * initials chip when they haven't set one. Reused wherever a name is shown. */
export function Avatar({
  predictor,
  size = 28,
}: {
  predictor?: { name: string; avatarPhotoId?: string } | null;
  size?: number;
}) {
  const photoId = predictor?.avatarPhotoId ?? '';
  const url = usePhotoUrl(WORLD_CUP_SLUG, photoId);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [photoId]);

  const name = predictor?.name ?? '?';
  const showImg = !!photoId && !!url && !broken;
  return (
    <span
      className="wc-avatar"
      style={
        {
          width: size,
          height: size,
          fontSize: Math.round(size * 0.4),
          ['--wc-av-hue' as string]: hue(name),
        } as CSSProperties
      }
      aria-hidden
    >
      {showImg ? (
        <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <span className="wc-avatar-fallback">{initials(name)}</span>
      )}
    </span>
  );
}
