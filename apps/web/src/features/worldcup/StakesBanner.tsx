/**
 * The personal-stakes line for a match — "you're 2nd of 5, 4 behind Ann; if it
 * ends now you climb to 1st (+5)". A prominent banner in the Match Room and a
 * compact one-liner on the fixture card. Pure display over {@link liveStakes};
 * scoring untouched.
 */
import type { WcMatch, WorldCupState } from '@dap/shared';
import { useMemo } from 'react';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { liveStakes } from './wcStakes.js';

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function StakesBanner({
  wc,
  meId,
  match,
  compact,
}: {
  wc: WorldCupState;
  meId: string | null;
  match: WcMatch;
  compact?: boolean;
}) {
  const live = useWorldCupStore((s) => s.live[match.id]);
  const stakes = useMemo(
    () => (meId ? liveStakes(wc, meId, match.id, live) : null),
    [wc, meId, match.id, live],
  );
  if (!stakes) return null;
  const { rank, of, nemesis, ifStands } = stakes;

  const nemesisText = nemesis
    ? nemesis.gap === 0
      ? `level with ${nemesis.name}`
      : nemesis.direction === 'chase'
        ? `${nemesis.gap} behind ${nemesis.name}`
        : `${nemesis.gap} ahead of ${nemesis.name}`
    : null;

  const ifText = ifStands
    ? ifStands.delta > 0
      ? `climb to ${ordinal(ifStands.toRank)}`
      : ifStands.delta < 0
        ? `slip to ${ordinal(ifStands.toRank)}`
        : ifStands.gain > 0
          ? `hold ${ordinal(ifStands.toRank)}`
          : null
    : null;

  return (
    <div
      className={`banner wc-stakes ${compact ? 'wc-stakes-line' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="wc-stakes-rank">
        {rank === 1 ? '👑' : '🎯'} You're <strong>{ordinal(rank)}</strong> of {of}
      </span>
      {nemesisText && <span className="wc-stakes-nemesis"> — {nemesisText}</span>}
      {ifText && (
        <span className="wc-stakes-if">
          {' '}
          · if it ends now you <strong>{ifText}</strong>
          {ifStands && ifStands.gain > 0 ? ` (+${ifStands.gain})` : ''}
        </span>
      )}
    </div>
  );
}
