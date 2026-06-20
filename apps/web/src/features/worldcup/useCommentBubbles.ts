/**
 * Live comment bubbles for the amphitheatre — when someone posts in this match's
 * chat, their words float up from their seat for a few seconds. Reads the match's
 * messages from the store (the same thread `MatchComments` shows), baselines the
 * first look so old chatter never replays, and TTL-expires each bubble. Pure
 * presentation; nothing persisted, scoring untouched.
 */
import { useEffect, useRef, useState } from 'react';
import { useWorldCupStore } from '../../state/worldCupStore.js';

export interface Bubble {
  id: string;
  authorId: string;
  name: string;
  text: string;
}

const TTL_MS = 6000;
const MAX = 6;

export function useCommentBubbles(matchId: string): Bubble[] {
  const messages = useWorldCupStore((s) => s.state?.messages);
  const predictors = useWorldCupStore((s) => s.state?.worldCup?.predictors);
  const [active, setActive] = useState<Bubble[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const lastMatch = useRef<string | null>(null);

  useEffect(() => {
    if (lastMatch.current !== matchId) {
      lastMatch.current = matchId;
      seen.current = null;
      setActive([]);
    }
    if (!messages) return;
    const mine = messages.filter(
      (m) => m.matchId === matchId && !!m.text && m.text.trim().length > 0,
    );
    if (seen.current === null) {
      // First look baselines silently — existing chatter doesn't pop.
      seen.current = new Set(mine.map((m) => m.id));
      return;
    }
    const fresh = mine.filter((m) => !seen.current!.has(m.id));
    if (fresh.length === 0) return;
    for (const m of fresh) seen.current.add(m.id);
    const add: Bubble[] = fresh.map((m) => {
      const text = m.text ?? '';
      return {
        id: m.id,
        authorId: m.authorId,
        name: predictors?.find((p) => p.id === m.authorId)?.name ?? 'Someone',
        text: text.length > 90 ? `${text.slice(0, 90)}…` : text,
      };
    });
    setActive((cur) => [...cur, ...add].slice(-MAX));
    for (const b of add) {
      window.setTimeout(() => setActive((cur) => cur.filter((x) => x.id !== b.id)), TTL_MS);
    }
  }, [messages, predictors, matchId]);

  return active;
}
