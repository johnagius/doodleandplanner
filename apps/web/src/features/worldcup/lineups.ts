import type { WcLineup, WcLineups } from '@dap/shared';
import { useEffect, useState } from 'react';

/**
 * Fetch the two starting XIs for a match (by team code) from the Worker, which
 * resolves the ESPN event and parses its summary. Empty until ~1h before
 * kickoff (when ESPN posts lineups) or when no backend is configured.
 */
export async function fetchLineups(home: string, away: string): Promise<WcLineups> {
  const base = import.meta.env.VITE_API_BASE?.trim();
  if (!base) return { home: null, away: null };
  try {
    const url =
      `${base.replace(/\/$/, '')}/api/football/lineups` +
      `?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`;
    const res = await fetch(url);
    if (!res.ok) return { home: null, away: null };
    const data = (await res.json()) as { home?: WcLineup | null; away?: WcLineup | null };
    return { home: data.home ?? null, away: data.away ?? null };
  } catch {
    return { home: null, away: null };
  }
}

export interface LineupsState {
  loading: boolean;
  lineups: WcLineups;
}

/** Load both lineups for a team pair, refetching if the teams change. */
export function useLineups(home?: string, away?: string): LineupsState {
  const [state, setState] = useState<LineupsState>({
    loading: !!(home && away),
    lineups: { home: null, away: null },
  });
  useEffect(() => {
    if (!home || !away) {
      setState({ loading: false, lineups: { home: null, away: null } });
      return;
    }
    let active = true;
    setState({ loading: true, lineups: { home: null, away: null } });
    void fetchLineups(home, away).then((lineups) => {
      if (active) setState({ loading: false, lineups });
    });
    return () => {
      active = false;
    };
  }, [home, away]);
  return state;
}
