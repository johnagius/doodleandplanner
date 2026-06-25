import type { WcMatch, WcTeam } from '@dap/shared';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Controllable stub for the network-backed highlight lookup.
let mockUrl: string | null = 'https://youtu.be/abc';
vi.mock('./highlights.js', () => ({
  useMatchHighlight: () => ({ url: mockUrl, loading: false }),
}));

import { HighlightLink } from './MatchCard.js';

const home: WcTeam = { id: 'h', name: 'Home', flag: '', group: 'A' };
const away: WcTeam = { id: 'a', name: 'Away', flag: '', group: 'A' };
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

afterEach(() => {
  mockUrl = 'https://youtu.be/abc';
});

describe('HighlightLink', () => {
  it('renders a real, clickable anchor under its own class', () => {
    const { container } = render(<HighlightLink home={home} away={away} match={match} />);
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a?.getAttribute('href')).toBe('https://youtu.be/abc');
    // Must use its own class — never the bare `.wc-highlight`, which belongs to
    // the absolutely-positioned, pointer-events:none moment-card overlay. Sharing
    // it dragged this link onto the teams and swallowed its clicks (taps fell
    // through to the team-name button, opening team info instead).
    expect(a?.classList.contains('wc-watch-highlights')).toBe(true);
    expect(a?.classList.contains('wc-highlight')).toBe(false);
  });

  it('renders nothing when there is no clip', () => {
    mockUrl = null;
    const { container } = render(<HighlightLink home={home} away={away} match={match} />);
    expect(container.querySelector('a')).toBeNull();
  });
});
