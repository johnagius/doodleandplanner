/**
 * Real player market values from Transfermarkt. transfermarkt.com itself blocks
 * bots, so we go through the community `transfermarkt-api` (a hosted scraper)
 * server-side from the Worker, cache aggressively (values change rarely), and
 * fall back to nothing when a name doesn't resolve. The parsing is pure + tested.
 */

interface TmSearchResult {
  name?: string;
  marketValue?: number | null;
}

/**
 * First usable market value (in euros) from a transfermarkt-api `/players/search`
 * response, returned as **millions of euros** (1 dp), or null when absent.
 */
export function parseTmValueM(raw: unknown): number | null {
  const results = (raw as { results?: TmSearchResult[] } | null)?.results ?? [];
  const mv = results.find(
    (r) => typeof r.marketValue === 'number' && (r.marketValue ?? 0) > 0,
  )?.marketValue;
  if (typeof mv !== 'number') return null;
  return mv >= 1e8 ? Math.round(mv / 1e6) : Math.round((mv / 1e6) * 10) / 10;
}
