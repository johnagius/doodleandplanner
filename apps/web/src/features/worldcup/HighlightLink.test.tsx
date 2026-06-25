import type { WcTeam } from '@dap/shared';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HighlightLink } from './MatchCard.js';

const home: WcTeam = { id: 'h', name: 'Brazil', flag: '', group: 'A' };
const away: WcTeam = { id: 'a', name: 'Croatia', flag: '', group: 'A' };

describe('HighlightLink', () => {
  it("links to FIFA's official, global highlights hub (not a geo-blocked clip)", () => {
    const { container } = render(<HighlightLink home={home} away={away} />);
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    // Official FIFA hub — free and global, so never rights-blocked in Malta.
    expect(a?.getAttribute('href')).toBe(
      'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/highlights',
    );
    // The hub isn't per-match, so the tooltip names the fixture to find.
    expect(a?.getAttribute('title')).toContain('Brazil v Croatia');
    // Own class — never the absolutely-positioned `.wc-highlight` overlay class.
    expect(a?.classList.contains('wc-watch-highlights')).toBe(true);
    expect(a?.classList.contains('wc-highlight')).toBe(false);
  });

  it('still renders the hub link before both teams are known', () => {
    const { container } = render(<HighlightLink />);
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toContain('fifa.com');
    expect(a?.getAttribute('title')).toBe('Official FIFA highlights');
  });
});
