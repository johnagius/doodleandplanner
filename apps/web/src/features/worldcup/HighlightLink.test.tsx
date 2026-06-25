import type { WcMatch, WcTeam } from '@dap/shared';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HighlightLink } from './MatchCard.js';

const home: WcTeam = { id: 'h', name: 'Brazil', flag: '', group: 'A' };
const away: WcTeam = { id: 'a', name: 'Croatia', flag: '', group: 'A' };
const groupMatch = {
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
  it('deep-links a group match to its official FIFA report+highlights page', () => {
    const { container } = render(<HighlightLink home={home} away={away} match={groupMatch} />);
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe(
      'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/brazil-croatia-match-report-highlights',
    );
    expect(a?.getAttribute('title')).toContain('Brazil v Croatia');
    // Own class — never the absolutely-positioned `.wc-highlight` overlay class.
    expect(a?.classList.contains('wc-watch-highlights')).toBe(true);
    expect(a?.classList.contains('wc-highlight')).toBe(false);
  });

  it('falls back to the FIFA highlights hub for a knockout match', () => {
    const { container } = render(
      <HighlightLink home={home} away={away} match={{ ...groupMatch, stage: 'r32' }} />,
    );
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/highlights',
    );
  });
});
