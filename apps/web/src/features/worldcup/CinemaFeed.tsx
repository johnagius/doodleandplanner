/**
 * The big-screen live feed — everything that happens in the room, on the screen,
 * scrolling to the newest. Merges the synthesised commentary (goals, cards,
 * sweepstake table-flips, kick-off/HT/FT) with the room chat into one timeline,
 * ordered by wall-clock (commentary events are placed at kickoff + their match
 * minute), and auto-follows the latest. Pure display over frozen live data.
 */
import type { WcMatch, WorldCupState } from '@dap/shared';
import { useEffect, useMemo, useRef } from 'react';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { buildCommentary } from './wcCommentary.js';

interface FeedItem {
  id: string;
  ts: number;
  icon: string;
  tone: 'goal' | 'card' | 'flip' | 'status' | 'chat';
  who: string | null;
  text: string;
}

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

  const items = useMemo<FeedItem[]>(() => {
    const koMs = Date.parse(match.kickoff) || Date.now();
    const out: FeedItem[] = buildCommentary(wc, match, live, events).map((l) => ({
      id: `c:${l.id}`,
      // Place each beat on the wall-clock: kickoff + its match minute (KO/HT/FT
      // clamped) so it interleaves naturally with chat.
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

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight; // follow the newest
  }, [items.length]);

  if (items.length === 0) {
    return <p className="wc-feed-empty muted small">The feed lights up as the match unfolds…</p>;
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
