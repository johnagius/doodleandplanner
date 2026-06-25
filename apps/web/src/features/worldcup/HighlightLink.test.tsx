import type { WcMatch, WcTeam } from '@dap/shared';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HighlightLink } from './MatchCard.js';

const home: WcTeam = { id: 'h', name: 'Brazil', flag: '', group: 'A' };
const away: WcTeam = { id: 'a', name: 'Croatia', flag: '', group: 'A' };
const match = {
  id: 'm',
  stage: 'group',
  group: 'A',
  matchday: 1,
  order: 0,
  kickoff: '2026-06-12T00:00:00Z',
  homeId: 'h',
  awayId: 'a',
  result: { home: 1, away: 0 },
} as WcMatch;

describe('HighlightLink', () => {
  it('links to a region-agnostic YouTube search (never geo-blocked in Malta)', () => {
    const { container } = render(<HighlightLink home={home} away={away} match={match} />);
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    const href = a?.getAttribute('href') ?? '';
    // A search page, not a single curated clip — the official World Cup uploads
    // are rights-blocked in Malta, a search always resolves to a playable reel.
    expect(href.startsWith('https://www.youtube.com/results?search_query=')).toBe(true);
    const decoded = decodeURIComponent(href);
    expect(decoded).toContain('Brazil vs Croatia');
    expect(decoded).toContain('2026');
    // Own class — never the absolutely-positioned `.wc-highlight` overlay class.
    expect(a?.classList.contains('wc-watch-highlights')).toBe(true);
    expect(a?.classList.contains('wc-highlight')).toBe(false);
  });

  it('renders nothing until both teams are known', () => {
    const { container } = render(<HighlightLink home={undefined} away={away} match={match} />);
    expect(container.querySelector('a')).toBeNull();
  });
});
