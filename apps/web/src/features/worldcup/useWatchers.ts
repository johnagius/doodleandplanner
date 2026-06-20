/**
 * Live "who's watching this match right now" presence for the Match Room.
 * Heartbeats my own presence on the shared channel, collects others', prunes by
 * TTL, and announces a leave on unmount. Ephemeral — never persisted, no scoring
 * impact. Excludes my own id (the local BroadcastChannel can echo in-process).
 */
import { useEffect, useState } from 'react';
import { getRepository } from '../../lib/storage/index.js';
import { WORLD_CUP_SLUG } from './worldCupRoom.js';
import { isWatchLeave, isWatching, watchLeave, watching } from './wcWatching.js';

const HEARTBEAT_MS = 4000;
const TTL_MS = 11_000;

export interface Watcher {
  memberId: string;
  name: string | null;
  at: number;
}

export function useWatchers(
  matchId: string,
  me: { id: string; name: string | null } | null,
): Watcher[] {
  const [others, setOthers] = useState<Record<string, Watcher>>({});

  // A stable ephemeral id for anonymous watchers, per mount.
  const meId = me?.id ?? null;
  const meName = me?.name ?? null;

  useEffect(() => {
    const repo = getRepository();
    const myId = meId ?? `anon-${Math.random().toString(36).slice(2, 9)}`;
    let alive = true;

    const beat = () => repo.publishPresence?.(WORLD_CUP_SLUG, watching(matchId, myId, meName));
    beat();
    const hb = window.setInterval(beat, HEARTBEAT_MS);

    const prune = () =>
      setOthers((m) => {
        const now = Date.now();
        const next: Record<string, Watcher> = {};
        for (const [k, w] of Object.entries(m)) if (now - w.at < TTL_MS) next[k] = w;
        return next;
      });
    const pr = window.setInterval(prune, HEARTBEAT_MS);

    const unsub = repo.subscribePresence?.(WORLD_CUP_SLUG, (payload) => {
      if (!alive) return;
      if (isWatching(payload) && payload.matchId === matchId && payload.memberId !== myId) {
        setOthers((m) => ({
          ...m,
          [payload.memberId]: { memberId: payload.memberId, name: payload.name, at: Date.now() },
        }));
      } else if (isWatchLeave(payload) && payload.matchId === matchId) {
        setOthers((m) => {
          if (!(payload.memberId in m)) return m;
          const next = { ...m };
          delete next[payload.memberId];
          return next;
        });
      }
    });

    return () => {
      alive = false;
      window.clearInterval(hb);
      window.clearInterval(pr);
      unsub?.();
      repo.publishPresence?.(WORLD_CUP_SLUG, watchLeave(matchId, myId));
    };
  }, [matchId, meId, meName]);

  return Object.values(others).sort((a, b) => a.memberId.localeCompare(b.memberId));
}
