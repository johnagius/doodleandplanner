/**
 * The standings as they stand right now, animating row reorders with a FLIP
 * slide so you watch places change as goals go in. Pure display — rows come
 * straight from the shared live-folded leaderboard; no new ranking math.
 */
import { findPredictor, type WorldCupState } from '@dap/shared';
import { useLayoutEffect, useRef } from 'react';
import { Avatar } from './Avatar.js';
import { Movement } from './Leaderboard.js';
import { useLiveLeaderboard } from './liveStandings.js';

const MEDALS = ['🥇', '🥈', '🥉'];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function LiveBoard({ wc, meId }: { wc: WorldCupState; meId: string | null }) {
  const rows = useLiveLeaderboard(wc);
  const listRef = useRef<HTMLOListElement>(null);
  const prevTops = useRef<Map<string, number>>(new Map());

  // FLIP: after each reorder, slide every row from where it just was to its new
  // spot. Skipped under reduced-motion and where the Web Animations API is absent
  // (e.g. jsdom in tests).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const items = Array.from(list.children) as HTMLElement[];
    const newTops = new Map<string, number>();
    for (const el of items) {
      const id = el.dataset.pid;
      if (id) newTops.set(id, el.getBoundingClientRect().top);
    }
    if (!prefersReducedMotion()) {
      for (const el of items) {
        const id = el.dataset.pid;
        if (!id || typeof el.animate !== 'function') continue;
        const prev = prevTops.current.get(id);
        const next = newTops.get(id);
        if (prev != null && next != null && Math.abs(prev - next) > 1) {
          el.animate(
            [{ transform: `translateY(${prev - next}px)` }, { transform: 'translateY(0)' }],
            { duration: 420, easing: 'cubic-bezier(.2,.7,.3,1)' },
          );
        }
      }
    }
    prevTops.current = newTops;
  }, [rows]);

  const top = rows[0]?.points ?? 0;
  return (
    <ol className="wc-room-board" ref={listRef} aria-live="polite" aria-label="Live standings">
      {rows.map((r, i) => (
        <li
          key={r.predictorId}
          data-pid={r.predictorId}
          className={`wc-room-row ${r.predictorId === meId ? 'is-me' : ''} ${
            i === 0 && r.points > 0 ? 'is-leader' : ''
          }`}
        >
          <span className="wc-room-rank">
            <span className="wc-room-pos">{MEDALS[i] ?? i + 1}</span>
            <Movement n={r.movement} />
          </span>
          <span className="wc-room-name">
            <Avatar predictor={findPredictor(wc, r.predictorId)} size={26} />
            <span className="wc-room-pname">{r.name}</span>
          </span>
          <span className="wc-room-bar" aria-hidden>
            <span style={{ width: `${top ? (r.points / top) * 100 : 0}%` }} />
          </span>
          <span className="wc-room-pts">{r.points}</span>
        </li>
      ))}
    </ol>
  );
}
