import { describe, expect, it } from 'vitest';
import { pickHighlight } from './highlights.js';

const ev = (
  strHomeTeam: string,
  strAwayTeam: string,
  strLeague: string,
  strVideo: string | null,
) => ({ strHomeTeam, strAwayTeam, strLeague, strVideo });

describe('pickHighlight', () => {
  it('finds the World Cup clip regardless of home/away orientation', () => {
    const events = [
      ev('Uzbekistan', 'Colombia', 'FIFA World Cup', 'https://youtu.be/abc'),
      ev('Mexico', 'South Africa', 'FIFA World Cup', 'https://youtu.be/xyz'),
    ];
    expect(pickHighlight(events, 'South Africa', 'Mexico')).toBe('https://youtu.be/xyz');
  });

  it('matches "United States" against a feed "USA" via loose containment', () => {
    const events = [ev('USA', 'Australia', 'FIFA World Cup', 'https://youtu.be/usa')];
    expect(pickHighlight(events, 'United States', 'Australia')).toBe('https://youtu.be/usa');
  });

  it('ignores empty videos, non-World-Cup leagues and the wrong teams', () => {
    expect(pickHighlight([ev('Mexico', 'South Africa', 'FIFA World Cup', '')], 'Mexico', 'South Africa')).toBeNull(); // prettier-ignore
    expect(pickHighlight([ev('Mexico', 'South Africa', 'Club Friendly', 'https://x')], 'Mexico', 'South Africa')).toBeNull(); // prettier-ignore
    expect(pickHighlight([ev('Brazil', 'Serbia', 'FIFA World Cup', 'https://x')], 'Mexico', 'South Africa')).toBeNull(); // prettier-ignore
  });
});
