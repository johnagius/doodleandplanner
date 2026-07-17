import type { ClubSide } from '@dap/shared';

/** A compact team chip: a coloured badge with the short code + the club name. */
export function TeamChip({ side, align = 'left' }: { side: ClubSide; align?: 'left' | 'right' }) {
  const color = side.color ?? '#6b7280';
  return (
    <span className={`club-team club-team-${align}`}>
      <span className="club-badge" style={{ background: color }} aria-hidden>
        {side.short.slice(0, 3)}
      </span>
      <span className="club-team-name">{side.name}</span>
    </span>
  );
}
