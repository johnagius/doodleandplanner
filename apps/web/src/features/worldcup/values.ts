import { useEffect, useState } from 'react';

/**
 * Real Transfermarkt market values (in €M) for a set of player names, fetched in
 * one batch from the Worker (which proxies the community transfermarkt-api and
 * caches hard). Empty when no backend is configured. A name maps to a number
 * (€M), or null when Transfermarkt has no value for it.
 */
export async function fetchPlayerValues(names: string[]): Promise<Record<string, number | null>> {
  const base = import.meta.env.VITE_API_BASE?.trim();
  if (!base || names.length === 0) return {};
  try {
    const url =
      `${base.replace(/\/$/, '')}/api/football/values` +
      `?names=${encodeURIComponent(names.join('|'))}`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const data = (await res.json()) as { values?: Record<string, number | null> };
    return data.values ?? {};
  } catch {
    return {};
  }
}

/** Load market values for the given names, refetching when the set changes. A
 * name absent from the result is still loading; present-but-null = no value. */
export function usePlayerValues(names: string[]): Record<string, number | null> {
  const key = names.join('|');
  const [values, setValues] = useState<Record<string, number | null>>({});
  useEffect(() => {
    const ns = key ? key.split('|') : [];
    if (ns.length === 0) {
      setValues({});
      return;
    }
    let active = true;
    void fetchPlayerValues(ns).then((v) => {
      if (active) setValues(v);
    });
    return () => {
      active = false;
    };
  }, [key]);
  return values;
}
