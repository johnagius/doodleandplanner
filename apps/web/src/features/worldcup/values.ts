import { marketValueM } from '@dap/shared';
import { useEffect, useState } from 'react';

/**
 * Real Transfermarkt market values (in €M) for a set of player names. Most names
 * resolve **instantly** from the committed static DB in `@dap/shared`; only the
 * ones it doesn't carry are fetched from the Worker (which proxies the community
 * transfermarkt-api and caches hard). A name maps to a number (€M), or null when
 * no value is known. Empty for missing names while the network lookup is pending.
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

/**
 * Load market values for the given names. DB hits are filled synchronously on the
 * first render (no flicker, no dependence on the flaky upstream); anything not in
 * the DB is fetched in one batch and merged in. A name absent from the result is
 * still loading; present-but-null = no value found anywhere.
 */
export function usePlayerValues(names: string[]): Record<string, number | null> {
  const key = names.join('|');
  const [values, setValues] = useState<Record<string, number | null>>(() => dbValues(key));
  useEffect(() => {
    const ns = key ? key.split('|') : [];
    if (ns.length === 0) {
      setValues({});
      return;
    }
    // Seed with everything the static DB already knows.
    const seeded = dbValues(key);
    setValues(seeded);
    const missing = ns.filter((n) => seeded[n] === undefined);
    if (missing.length === 0) return;
    let active = true;
    void fetchPlayerValues(missing).then((live) => {
      if (active) setValues((prev) => ({ ...prev, ...live }));
    });
    return () => {
      active = false;
    };
  }, [key]);
  return values;
}

/** The subset of `names` (a "|"-joined key) the static DB can answer right now. */
function dbValues(key: string): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const n of key ? key.split('|') : []) {
    const m = marketValueM(n);
    if (m != null) out[n] = m;
  }
  return out;
}
