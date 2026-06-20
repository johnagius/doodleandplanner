/**
 * The cinema's live commentary ticker — renders the synthesised play-by-play
 * from {@link buildCommentary}. Pure display over frozen live data.
 */
import type { WcMatch, WorldCupState } from '@dap/shared';
import { useMemo } from 'react';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { buildCommentary } from './wcCommentary.js';

export function CommentaryFeed({ wc, match }: { wc: WorldCupState; match: WcMatch }) {
  const live = useWorldCupStore((s) => s.live[match.id]);
  const events = useWorldCupStore((s) => s.matchEvents[match.id]);
  const lines = useMemo(() => buildCommentary(wc, match, live, events), [wc, match, live, events]);
  if (lines.length === 0) return null;
  return (
    <ul className="wc-commentary" aria-live="polite">
      {lines.map((l) => (
        <li key={l.id} className={`wc-comm wc-comm-${l.tone}`}>
          <span className="wc-comm-min">{l.minute}</span>
          <span className="wc-comm-icon" aria-hidden>
            {l.icon}
          </span>
          <span className="wc-comm-text">{l.text}</span>
        </li>
      ))}
    </ul>
  );
}
