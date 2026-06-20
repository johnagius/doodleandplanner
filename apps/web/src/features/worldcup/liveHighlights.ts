/**
 * Card-moment detection for the Cinema's highlight cards — display-only, no
 * scoring impact. Goals are already owned by `useGoalEvents` (score-diff); this
 * watches `matchEvents` for *new* bookings (yellow/red) and fires once each, so
 * "other highlights as they happen" land on screen. Robust to the feed re-sending
 * the same events each poll: we track which we've already shown by a stable key,
 * and baseline the first sighting silently (opening mid-match never replays).
 */
import type { WcMatchEvent } from '@dap/shared';
import { useEffect, useRef } from 'react';
import { useWorldCupStore } from '../../state/worldCupStore.js';

export interface WcHighlight {
  kind: 'yellow' | 'red';
  /** A dismissal — a straight red or a second booking. */
  sentOff: boolean;
  /** The dismissal came via a second yellow (so the card can say so). */
  secondYellow: boolean;
  /** Players the team has left after this dismissal (11, then 10…), or null. */
  playersLeft: number | null;
  minute: string;
  teamTla: string;
  player: string;
}

function key(e: WcMatchEvent): string {
  return `${e.minute}|${e.teamTla}|${e.player}|${e.kind}`;
}

export function useMatchHighlights(matchId: string, onHighlight: (h: WcHighlight) => void): void {
  const events = useWorldCupStore((s) => s.matchEvents[matchId]);
  const seen = useRef<Set<string>>(new Set());
  const baselined = useRef(false);

  useEffect(() => {
    const cards = (events ?? []).filter((e) => e.kind === 'yellow' || e.kind === 'red');
    // Derive dismissal state from scratch each run (the feed re-sends events, so
    // counts must be computed, not accumulated): a second yellow is a sending-off,
    // and each team counts down 10, 9… A red that merely confirms a second yellow
    // we've already counted isn't a new card.
    const yellows = new Map<string, number>();
    const dismissed = new Set<string>();
    const teamOff = new Map<string, number>();
    const computed = cards.map((c) => {
      let sentOff = false;
      let secondYellow = false;
      if (c.kind === 'yellow') {
        const yc = (yellows.get(c.player) ?? 0) + 1;
        yellows.set(c.player, yc);
        if (yc >= 2 && !dismissed.has(c.player)) {
          sentOff = true;
          secondYellow = true;
        }
      } else if (!dismissed.has(c.player)) {
        sentOff = true; // straight red
      }
      let playersLeft: number | null = null;
      if (sentOff) {
        dismissed.add(c.player);
        const n = (teamOff.get(c.teamTla) ?? 0) + 1;
        teamOff.set(c.teamTla, n);
        playersLeft = 11 - n;
      }
      const redDup = c.kind === 'red' && !sentOff; // accompanies a 2nd yellow
      return { c, sentOff, secondYellow, playersLeft, redDup };
    });

    if (!baselined.current) {
      baselined.current = true;
      for (const { c } of computed) seen.current.add(key(c));
      return;
    }
    for (const { c, sentOff, secondYellow, playersLeft, redDup } of computed) {
      const k = key(c);
      if (seen.current.has(k)) continue;
      seen.current.add(k);
      if (redDup) continue;
      onHighlight({
        kind: c.kind as 'yellow' | 'red',
        sentOff,
        secondYellow,
        playersLeft,
        minute: c.minute,
        teamTla: c.teamTla,
        player: c.player,
      });
    }
  }, [events, onHighlight]);
}
