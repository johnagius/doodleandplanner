import type { ClubSide } from '@dap/shared';
import { useState } from 'react';

/** A compact team chip: the official club crest (falling back to a coloured code
 * badge if the image can't load) plus the club name. */
export function TeamChip({ side, align = 'left' }: { side: ClubSide; align?: 'left' | 'right' }) {
  const [broken, setBroken] = useState(false);
  const color = side.color ?? '#6b7280';
  const showCrest = side.crest && !broken;
  return (
    <span className={`club-team club-team-${align}`}>
      {showCrest ? (
        <img
          className="club-crest"
          src={side.crest}
          alt=""
          loading="lazy"
          width={26}
          height={26}
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="club-badge" style={{ background: color }} aria-hidden>
          {side.short.slice(0, 3)}
        </span>
      )}
      <span className="club-team-name">{side.name}</span>
    </span>
  );
}
