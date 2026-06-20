/**
 * The big-screen broadcast — everything that happens in the room, on the screen,
 * scrolling to the newest. Merges synthesised commentary (goals, cards,
 * table-flips, KO/HT/FT) with the room chat AND a rotating "broadcast" of ambient
 * lines (win prob, our leaderboard, the group table, match info, flavour) that a
 * small director injects on a timer — but only when it's quiet, so a fresh goal
 * or message owns the moment. Ordered by wall-clock; auto-follows the latest.
 * Pure display over frozen data.
 */
import type { WcMatch, WorldCupState } from '@dap/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { useLiveLeaderboard } from './liveStandings.js';
import { buildBroadcast, type BroadcastTone } from './wcBroadcast.js';
import { buildCommentary } from './wcCommentary.js';

interface FeedItem {
  id: string;
  ts: number;
  icon: string;
  tone: 'goal' | 'card' | 'flip' | 'status' | 'chat' | BroadcastTone;
  who: string | null;
  text: string;
}

const BROADCAST_EVERY = 6000; // ms between ambient broadcast lines
const QUIET_MS = 14_000; // hold ambient back this long after a real beat

function msgTime(createdAt: unknown): number {
  if (typeof createdAt === 'number') return createdAt;
  if (typeof createdAt === 'string') {
    const t = Date.parse(createdAt);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

export function CinemaFeed({ wc, match }: { wc: WorldCupState; match: WcMatch }) {
  const live = useWorldCupStore((s) => s.live[match.id]);
  const events = useWorldCupStore((s) => s.matchEvents[match.id]);
  const messages = useWorldCupStore((s) => s.state?.messages);
  const standings = useLiveLeaderboard(wc);

  // The "real" feed: live commentary + buddy chat, on the wall-clock.
  const real = useMemo<FeedItem[]>(() => {
    const koMs = Date.parse(match.kickoff) || Date.now();
    const out: FeedItem[] = buildCommentary(wc, match, live, events).map((l) => ({
      id: `c:${l.id}`,
      ts: koMs + Math.max(-1, Math.min(130, l.sort)) * 60_000,
      icon: l.icon,
      tone: l.tone,
      who: null,
      text: l.text,
    }));
    for (const m of messages ?? []) {
      if (m.matchId !== match.id || !m.text || !m.text.trim()) continue;
      const who = wc.predictors.find((p) => p.id === m.authorId)?.name ?? 'Someone';
      out.push({
        id: `m:${m.id}`,
        ts: msgTime(m.createdAt),
        icon: '💬',
        tone: 'chat',
        who,
        text: m.text,
      });
    }
    return out.sort((a, b) => a.ts - b.ts);
  }, [wc, match, live, events, messages]);

  const lastRealTsRef = useRef(0);
  lastRealTsRef.current = real.length ? real[real.length - 1]!.ts : 0;
  const hasRealRef = useRef(real.length > 0);
  hasRealRef.current = real.length > 0;

  // Rotating ambient broadcast — kept fresh in a ref so the timer reads the
  // latest pool without restarting on every data tick.
  const pool = useMemo(
    () => buildBroadcast(wc, match, live, standings),
    [wc, match, live, standings],
  );
  const poolRef = useRef(pool);
  poolRef.current = pool;
  const tick = useRef(0);
  const [ambient, setAmbient] = useState<FeedItem[]>([]);

  useEffect(() => {
    tick.current = 0;
    // Pre-match (no live commentary yet) seeds a few lines so the screen reads
    // full on open; a live match lets the commentary carry it.
    if (!hasRealRef.current) {
      const seedItems = poolRef.current.slice(0, 4);
      setAmbient(
        seedItems.map((it, k) => ({
          id: `b:${it.id}:seed${k}`,
          ts: Date.now() - (seedItems.length - k) * 30_000,
          icon: it.icon,
          tone: it.tone,
          who: null,
          text: it.text,
        })),
      );
      tick.current = seedItems.length;
    } else {
      setAmbient([]);
    }
    const emit = () => {
      const items = poolRef.current;
      if (items.length === 0) return;
      // Yield to live play/chat: only fill in when nothing fresh landed lately.
      if (Date.now() - lastRealTsRef.current < QUIET_MS) return;
      const it = items[tick.current % items.length]!;
      tick.current += 1;
      setAmbient((prev) => [
        ...prev.slice(-8),
        {
          id: `b:${it.id}:${Date.now()}`,
          ts: Date.now(),
          icon: it.icon,
          tone: it.tone,
          who: null,
          text: it.text,
        },
      ]);
    };
    const id = window.setInterval(emit, BROADCAST_EVERY);
    return () => window.clearInterval(id);
  }, [match.id]);

  const items = useMemo<FeedItem[]>(
    () => [...real, ...ambient].sort((a, b) => a.ts - b.ts),
    [real, ambient],
  );

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight; // follow the newest
  }, [items.length]);

  if (items.length === 0) {
    return (
      <p className="wc-feed-empty muted small">The broadcast lights up as the match unfolds…</p>
    );
  }

  return (
    <div className="wc-feed" ref={ref} aria-live="polite">
      {items.map((it) => (
        <div key={it.id} className={`wc-feed-item wc-feed-${it.tone}`}>
          <span className="wc-feed-icon" aria-hidden>
            {it.icon}
          </span>
          <span className="wc-feed-text">
            {it.who && <strong className="wc-feed-who">{it.who}: </strong>}
            {it.text}
          </span>
        </div>
      ))}
    </div>
  );
}
