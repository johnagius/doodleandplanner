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
    if (!baselined.current) {
      baselined.current = true;
      for (const c of cards) seen.current.add(key(c));
      return;
    }
    for (const c of cards) {
      const k = key(c);
      if (seen.current.has(k)) continue;
      seen.current.add(k);
      onHighlight({
        kind: c.kind as 'yellow' | 'red',
        minute: c.minute,
        teamTla: c.teamTla,
        player: c.player,
      });
    }
  }, [events, onHighlight]);
}
