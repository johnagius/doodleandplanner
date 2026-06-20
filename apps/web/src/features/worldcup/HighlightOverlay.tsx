/**
 * On-screen highlight cards for the "other" live moments — bookings (yellow/red)
 * as they happen. Goals get their own bigger treatment in {@link GoalOverlay};
 * this is the lighter card for cards, tinted the offending team's colour and
 * auto-dismissed. Pure display over the frozen events feed; scoring untouched.
 */
import { findTeam, type WcMatch, type WorldCupState } from '@dap/shared';
import { useCallback, useRef, useState } from 'react';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { useMatchHighlights, type WcHighlight } from './liveHighlights.js';
import { legibleScoreColor } from './wcFormat.js';

interface Card {
  id: number;
  icon: string;
  title: string;
  sub: string;
  color: string | undefined;
  red: boolean;
}

export function HighlightOverlay({ wc, match }: { wc: WorldCupState; match: WcMatch }) {
  const live = useWorldCupStore((s) => s.live[match.id]);
  const liveRef = useRef(live);
  liveRef.current = live;

  const [card, setCard] = useState<Card | null>(null);
  const idRef = useRef(0);

  const onHighlight = useCallback(
    (h: WcHighlight) => {
      const team = findTeam(wc, h.teamTla)?.name ?? h.teamTla;
      const color = legibleScoreColor(
        h.teamTla === match.homeId ? liveRef.current?.homeColor : liveRef.current?.awayColor,
      );
      const red = h.kind === 'red';
      idRef.current += 1;
      const id = idRef.current;
      setCard({
        id,
        icon: red ? '🟥' : '🟨',
        title: red ? 'Red card!' : 'Booking',
        sub: `${h.minute} · ${h.player}${red ? ' — down to ten' : ''} · ${team}`,
        color,
        red,
      });
      window.setTimeout(() => setCard((c) => (c && c.id === id ? null : c)), 3500);
    },
    [wc, match.homeId, match.awayId],
  );

  useMatchHighlights(match.id, onHighlight);

  if (!card) return null;
  return (
    <div className={`wc-highlight ${card.red ? 'is-red' : ''}`} role="status" aria-live="polite">
      <span className="wc-highlight-icon" style={card.color ? { color: card.color } : undefined}>
        {card.icon}
      </span>
      <span className="wc-highlight-body">
        <strong className="wc-highlight-title">{card.title}</strong>
        <span className="wc-highlight-sub">{card.sub}</span>
      </span>
    </div>
  );
}
