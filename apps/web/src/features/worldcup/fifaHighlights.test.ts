import { describe, expect, it } from 'vitest';

import { FIFA_HIGHLIGHTS_HUB, fifaHighlightsUrl, fifaSlug } from './fifaHighlights.js';

describe('fifaSlug', () => {
  it('slugifies plain names', () => {
    expect(fifaSlug('Mexico')).toBe('mexico');
    expect(fifaSlug('New Zealand')).toBe('new-zealand');
  });

  it('strips accents', () => {
    expect(fifaSlug('Türkiye')).toBe('turkiye');
    expect(fifaSlug('Curaçao')).toBe('curacao');
    expect(fifaSlug("Côte d'Ivoire")).toBe('cote-d-ivoire');
  });

  it('uses FIFA spelling where it differs from ours', () => {
    expect(fifaSlug('South Korea')).toBe('korea-republic');
    expect(fifaSlug('United States')).toBe('usa');
    expect(fifaSlug('Iran')).toBe('ir-iran');
    expect(fifaSlug('Cape Verde')).toBe('cabo-verde');
    expect(fifaSlug('DR Congo')).toBe('congo-dr');
    expect(fifaSlug('Bosnia and Herzegovina')).toBe('bosnia-herzegovina');
  });
});

describe('fifaHighlightsUrl', () => {
  it('deep-links a group match by home–away slug (matches FIFA real URLs)', () => {
    expect(fifaHighlightsUrl('Czechia', 'Mexico', true)).toBe(
      'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/czechia-mexico-match-report-highlights',
    );
    // A fixture mixing accents and a FIFA-specific spelling.
    expect(fifaHighlightsUrl('United States', 'Türkiye', true)).toContain(
      '/articles/usa-turkiye-match-report-highlights',
    );
  });

  it('falls back to the hub for knockouts or unknown teams', () => {
    expect(fifaHighlightsUrl('Spain', 'France', false)).toBe(FIFA_HIGHLIGHTS_HUB);
    expect(fifaHighlightsUrl(undefined, 'France', true)).toBe(FIFA_HIGHLIGHTS_HUB);
  });
});
