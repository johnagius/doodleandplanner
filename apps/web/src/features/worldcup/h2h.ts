import type { WcTeamH2H } from '@dap/shared';
import { useEffect, useState } from 'react';

/**
 * Fetch historical head-to-head between two teams (by their three-letter codes,
 * which double as our team ids) from the Worker proxy. Returns null when no
 * backend is configured or the feed has nothing — callers show an empty state.
 */
export async function fetchHeadToHead(homeTla: string, awayTla: string): Promise<WcTeamH2H | null> {
  const base = import.meta.env.VITE_API_BASE?.trim();
  if (!base) return null;
  try {
    const url =
      `${base.replace(/\/$/, '')}/api/football/h2h` +
      `?home=${encodeURIComponent(homeTla)}&away=${encodeURIComponent(awayTla)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { h2h?: WcTeamH2H | null };
    return data.h2h ?? null;
  } catch {
    return null;
  }
}

export interface H2HState {
  loading: boolean;
  h2h: WcTeamH2H | null;
}

/** Load head-to-head for a team pair, refetching if the teams change. */
export function useHeadToHead(homeTla?: string, awayTla?: string): H2HState {
  const [state, setState] = useState<H2HState>({ loading: !!(homeTla && awayTla), h2h: null });
  useEffect(() => {
    if (!homeTla || !awayTla) {
      setState({ loading: false, h2h: null });
      return;
    }
    let active = true;
    setState({ loading: true, h2h: null });
    void fetchHeadToHead(homeTla, awayTla).then((h2h) => {
      if (active) setState({ loading: false, h2h });
    });
    return () => {
      active = false;
    };
  }, [homeTla, awayTla]);
  return state;
}
