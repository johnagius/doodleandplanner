import type { WcNewsArticle } from '@dap/shared';
import { useEffect, useState } from 'react';

/**
 * Fetch World Cup headlines from the Worker (which proxies ESPN's keyless news
 * feed and caches ~10 min). Empty when no backend is configured or the feed is
 * unavailable — the Buzz strip then simply hides itself.
 */
export async function fetchWorldCupNews(): Promise<WcNewsArticle[]> {
  const base = import.meta.env.VITE_API_BASE?.trim();
  if (!base) return [];
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/football/news`);
    if (!res.ok) return [];
    const data = (await res.json()) as { articles?: WcNewsArticle[] };
    return Array.isArray(data.articles) ? data.articles : [];
  } catch {
    return [];
  }
}

export function useWorldCupNews(): { articles: WcNewsArticle[]; loading: boolean } {
  const [articles, setArticles] = useState<WcNewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void fetchWorldCupNews().then((a) => {
      if (active) {
        setArticles(a);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  return { articles, loading };
}
