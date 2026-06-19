import { describe, expect, it } from 'vitest';
import { WC_GIF_CATEGORIES, gifUrl } from './wcGifs.js';

describe('wcGifs', () => {
  it('builds a hotlinkable Giphy media URL', () => {
    expect(gifUrl('abc123')).toBe('https://media.giphy.com/media/abc123/giphy.gif');
  });

  it('offers several non-empty mood categories with unique ids', () => {
    expect(WC_GIF_CATEGORIES.length).toBeGreaterThanOrEqual(4);
    const ids: string[] = [];
    for (const cat of WC_GIF_CATEGORIES) {
      expect(cat.gifs.length).toBeGreaterThan(0);
      expect(cat.label).toMatch(/\S/);
      for (const g of cat.gifs) ids.push(g.id);
    }
    expect(new Set(ids).size).toBe(ids.length); // no dupes across the whole set
  });
});
