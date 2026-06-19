import { useState } from 'react';
import { WC_GIF_CATEGORIES, gifUrl } from './wcGifs.js';

/** The shared curated-GIF picker: mood tabs over a thumbnail grid. Calls
 * `onPick` with the chosen GIF's media URL. Broken/removed GIFs hide themselves
 * (onError), so the grid only ever shows ones that load. */
export function GifPicker({ onPick }: { onPick: (url: string) => void }) {
  const [cat, setCat] = useState(WC_GIF_CATEGORIES[0]!.key);
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const gifs = (WC_GIF_CATEGORIES.find((c) => c.key === cat) ?? WC_GIF_CATEGORIES[0]!).gifs;
  return (
    <div className="wc-gif-picker">
      <div className="wc-gif-cats">
        {WC_GIF_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`wc-gif-cat ${cat === c.key ? 'is-active' : ''}`}
            onClick={() => setCat(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="wc-gif-grid">
        {gifs
          .filter((g) => !broken.has(g.id))
          .map((g) => (
            <button
              key={g.id}
              type="button"
              className="wc-gif-thumb"
              title={g.alt}
              onClick={() => onPick(gifUrl(g.id))}
            >
              <img
                src={gifUrl(g.id)}
                alt={g.alt}
                loading="lazy"
                onError={() => setBroken((b) => new Set(b).add(g.id))}
              />
            </button>
          ))}
      </div>
    </div>
  );
}
