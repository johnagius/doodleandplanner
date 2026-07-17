import {
  clubLeaderboardWithMovement,
  clubPlayedCount,
  clubRivalry,
  type ClubLeagueState,
  type ClubResult,
} from '@dap/shared';
import { EmptyState } from '../../components/EmptyState.js';
import { useClubLeagueStore } from '../../state/clubLeagueStore.js';
import { liveScoresFromStore } from './liveScores.js';

const MEDALS = ['🥇', '🥈', '🥉'];

function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function Movement({ n }: { n: number }) {
  if (n > 0)
    return (
      <span className="club-move up" title={`Up ${n}`}>
        ▲{n}
      </span>
    );
  if (n < 0)
    return (
      <span className="club-move down" title={`Down ${-n}`}>
        ▼{-n}
      </span>
    );
  return null;
}

/** The overall season table — cumulative points, folding live games in "as it
 * stands" with movement arrows and a where-you-stand line (who pips who). */
export function ClubTable({ club }: { club: ClubLeagueState }) {
  const meId = useClubLeagueStore((s) => s.meId);
  const live = useClubLeagueStore((s) => s.live);
  const liveScores: Record<string, ClubResult> = liveScoresFromStore(club, live);
  const liveCount = Object.keys(liveScores).length;
  const rows = clubLeaderboardWithMovement(club, liveCount ? liveScores : undefined);
  const played = clubPlayedCount(club);
  const top = rows[0]?.points ?? 0;
  const rival = meId ? clubRivalry(club, meId, liveCount ? liveScores : undefined) : null;

  if (played === 0 && liveCount === 0) {
    return (
      <EmptyState
        icon="🏆"
        title="No results yet"
        hint="As soon as the first game is played, points land here and the season table comes to life."
      />
    );
  }

  return (
    <div className="stack">
      {liveCount > 0 && (
        <div className="banner club-live-banner">
          🔴 Live standings — includes {liveCount} in-play game{liveCount === 1 ? '' : 's'} as it
          stands
        </div>
      )}
      {rival && (
        <div className="banner club-rivalry">
          {rival.rank === 1 ? '👑' : '🎯'} You’re <strong>{ordinal(rival.rank)}</strong> of{' '}
          {rival.of}
          {rival.ahead && (
            <>
              {' '}
              —{' '}
              {rival.ahead.gap === 0
                ? `level with ${rival.ahead.name}`
                : `${rival.ahead.gap} behind ${rival.ahead.name}`}
            </>
          )}
          {rival.behind &&
            (rival.behind.gap === 0
              ? ` · level with ${rival.behind.name}`
              : ` · ${rival.behind.gap} ahead of ${rival.behind.name}`)}
        </div>
      )}
      <p className="muted small" style={{ margin: 0 }}>
        {played} fixture{played === 1 ? '' : 's'} scored · overall season standings.
      </p>
      <ol className="club-table">
        {rows.map((r, i) => (
          <li
            key={r.predictorId}
            className={`club-row ${r.predictorId === meId ? 'is-me' : ''} ${
              i === 0 && r.points > 0 ? 'is-leader' : ''
            }`}
          >
            <span className="club-rank">
              {MEDALS[i] ?? i + 1}
              <Movement n={r.movement} />
            </span>
            <span className="club-row-name">{r.name}</span>
            <span className="club-row-stats muted small">
              {r.resultsRight} results · {r.marketsRight} markets right
            </span>
            <span className="club-row-bar" aria-hidden>
              <span style={{ width: `${top ? (r.points / top) * 100 : 0}%` }} />
            </span>
            <span className="club-row-pts">{r.points}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
