import type { WcMatchStatRow, WcMatchSummary } from '@dap/shared';
import { useEffect, useState } from 'react';

/**
 * Bar widths (0–100% per side) for a dueling stat row. Percentage stats
 * (possession, pass accuracy) show each side's own value, so 85% vs 78% reads
 * as two near-full bars rather than a 52/48 share; count stats show each side's
 * share of the two totals.
 */
export function statBarPercents(row: WcMatchStatRow): { home: number; away: number } {
  const h = row.home ?? 0;
  const a = row.away ?? 0;
  if (row.pct) {
    const clamp = (n: number) => Math.max(0, Math.min(100, n));
    return { home: clamp(h), away: clamp(a) };
  }
  const tot = h + a;
  if (tot <= 0) return { home: 0, away: 0 };
  return { home: (h / tot) * 100, away: (a / tot) * 100 };
}

/**
 * Fetch a match's detail (team stats, standout performers, referee, venue) from
 * the Worker, which mines it out of the same ESPN summary as the lineups — so no
 * extra key or rate limit. Empty until the game is underway (stats appear once
 * it kicks off) or when no backend is configured.
 */
export async function fetchMatchSummary(
  home: string,
  away: string,
): Promise<WcMatchSummary | null> {
  const base = import.meta.env.VITE_API_BASE?.trim();
  if (!base) return null;
  try {
    const url =
      `${base.replace(/\/$/, '')}/api/football/match` +
      `?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { summary?: WcMatchSummary | null };
    return data.summary ?? null;
  } catch {
    return null;
  }
}

export interface MatchSummaryState {
  loading: boolean;
  summary: WcMatchSummary | null;
}

/** Load a match's detail for a team pair, refetching if the teams change. */
export function useMatchSummary(home?: string, away?: string): MatchSummaryState {
  const [state, setState] = useState<MatchSummaryState>({
    loading: !!(home && away),
    summary: null,
  });
  useEffect(() => {
    if (!home || !away) {
      setState({ loading: false, summary: null });
      return;
    }
    let active = true;
    setState({ loading: true, summary: null });
    void fetchMatchSummary(home, away).then((summary) => {
      if (active) setState({ loading: false, summary });
    });
    return () => {
      active = false;
    };
  }, [home, away]);
  return state;
}
