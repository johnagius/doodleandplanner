/**
 * Build the link for "▶️ Watch highlights" on a finished match.
 *
 * FIFA publishes a per-match report+highlights article at a predictable slug:
 * `.../articles/<home>-<away>-match-report-highlights` in home–away order, e.g.
 * `czechia-mexico-match-report-highlights`. That page is free and global, so —
 * unlike the FIFA/YouTube clips (rights-blocked in Malta, where TVM holds the
 * rights) or US-only Tubi/Fox — it isn't geo-locked.
 *
 * We deep-link group games, where the slug pattern is confirmed, and fall back to
 * the highlights hub for knockouts (slug not yet verifiable) or when a team isn't
 * known. Slugs are a plain slugify of the team name, with a small map for the
 * handful FIFA spells differently (verified against its team pages).
 */
const BASE = 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026';

/** FIFA's official, free, global highlights hub. */
export const FIFA_HIGHLIGHTS_HUB = `${BASE}/highlights`;

/** App team name → FIFA URL slug, only where FIFA differs from a plain slug. */
const FIFA_TEAM_SLUG: Record<string, string> = {
  'South Korea': 'korea-republic',
  'United States': 'usa',
  Iran: 'ir-iran',
  'Cape Verde': 'cabo-verde',
  'DR Congo': 'congo-dr',
  'Bosnia and Herzegovina': 'bosnia-herzegovina',
};

/** FIFA's URL slug for a team name: accent-stripped, lower-kebab — e.g.
 * "Côte d'Ivoire" → "cote-d-ivoire", "Türkiye" → "turkiye". */
export function fifaSlug(name: string): string {
  return (
    FIFA_TEAM_SLUG[name] ??
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // drop combining accents
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') // any run of non-alphanumerics → one hyphen
      .replace(/^-+|-+$/g, '')
  );
}

export function fifaHighlightsUrl(
  homeName: string | undefined,
  awayName: string | undefined,
  isGroupStage: boolean,
): string {
  if (isGroupStage && homeName && awayName) {
    return `${BASE}/articles/${fifaSlug(homeName)}-${fifaSlug(awayName)}-match-report-highlights`;
  }
  return FIFA_HIGHLIGHTS_HUB;
}
