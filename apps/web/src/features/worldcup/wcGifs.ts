/**
 * A small, hand-picked set of reaction GIFs for the match banter, grouped by
 * mood. We store only the Giphy media URL on a message (not bytes), and hotlink
 * the CDN — a broken/removed GIF just hides itself in the UI. No API key, so it
 * works out of the box; swap in a search API later if an endless library is
 * wanted. IDs were sourced from Giphy's public pages.
 */
export interface WcGif {
  id: string;
  alt: string;
}

export interface WcGifCategory {
  key: string;
  label: string;
  gifs: WcGif[];
}

/** The direct, hotlinkable Giphy media URL for a GIF id. */
export function gifUrl(id: string): string {
  return `https://media.giphy.com/media/${id}/giphy.gif`;
}

export const WC_GIF_CATEGORIES: WcGifCategory[] = [
  {
    key: 'worldcup',
    label: '⚽ World Cup',
    gifs: [
      { id: '40KfwvNwBjJZuj2OYP', alt: 'Messi celebration' },
      { id: 'SOJBmp8r0wHwUkpYxW', alt: 'Griezmann celebration' },
      { id: '26BRLCZLjrl2vqFQA', alt: 'Goal celebration' },
      { id: 'hrwmeFmQ4K2dCvI8aa', alt: 'Football celebration' },
      { id: 'YjejgL5t0fqsVR4p9b', alt: 'Player celebration' },
      { id: 'l3UcicwEsOOan1Q2c', alt: 'Team celebration' },
    ],
  },
  {
    key: 'elation',
    label: '🎉 Elation',
    gifs: [
      { id: 'S7Q8eVYii3z1Ak0N5B', alt: 'Get in!' },
      { id: 'VIQQi366J7dC1R5b8n', alt: 'Fans going wild' },
      { id: 'F6PFPjc3K0CPe', alt: 'Excited' },
      { id: '31lPv5L3aIvTi', alt: 'So excited' },
      { id: 'hZj44bR9FVI3K', alt: 'Yay!' },
      { id: 'IwAZ6dvvvaTtdI8SD5', alt: 'Celebrating' },
    ],
  },
  {
    key: 'fuming',
    label: '😤 Fuming',
    gifs: [
      { id: 'Xbh3RSUbOpH1u', alt: 'Table flip' },
      { id: 'v7wdD79z33oUJBM0Iz', alt: 'Smashing things' },
      { id: '3ohs81rDuEz9ioJzAA', alt: 'Raging at the screen' },
      { id: 'jdiJDXdnEa88j1oBTQ', alt: 'Furious' },
      { id: 'rKCUYdpnhwS8qCpCIY', alt: 'Angry cat' },
      { id: 'okrv1eWeKVM9W', alt: 'Anger' },
    ],
  },
  {
    key: 'bored',
    label: '🥱 Bored',
    gifs: [
      { id: '4WFFxEKr5rStT6fbSd', alt: 'Yawn' },
      { id: '3d5O10XObbr8LW4bDY', alt: 'So boring' },
      { id: 'QvssBRVtE4rJK', alt: 'Unimpressed' },
      { id: 'vgzwlRwU47uAVfydgX', alt: 'Bored sigh' },
      { id: 'et2rkCm8vvF06UtqbR', alt: 'Sleepy' },
    ],
  },
  {
    key: 'onedge',
    label: '😬 On edge',
    gifs: [
      { id: 'xUOxfgpZFJmCgHy5UY', alt: 'Nail biting' },
      { id: '7zSBli5e72PVGxcDtf', alt: 'Anxious wait' },
      { id: '3oz8xLlw6GHVfokaNW', alt: 'Nervous' },
      { id: 'snEeOh54kCFxe', alt: 'On the edge of my seat' },
      { id: '3ohc15hpGuLpSTx960', alt: 'Tense' },
    ],
  },
];
