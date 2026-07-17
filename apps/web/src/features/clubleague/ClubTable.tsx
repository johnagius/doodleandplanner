import { clubPlayedCount, rankedLeaderboard, type ClubLeagueState } from '@dap/shared';
import { EmptyState } from '../../components/EmptyState.js';
import { useClubLeagueStore } from '../../state/clubLeagueStore.js';

const MEDALS = ['🥇', '🥈', '🥉'];

/** The overall season table — cumulative points across every resulted fixture. */
export function ClubTable({ club }: { club: ClubLeagueState }) {
  const meId = useClubLeagueStore((s) => s.meId);
  const rows = rankedLeaderboard(club);
  const played = clubPlayedCount(club);
  const top = rows[0]?.points ?? 0;

  if (played === 0) {
    return (
      <EmptyState
        icon="🏆"
        title="No results yet"
        hint="Once the organiser enters the first full-time score, points land here and the season table comes to life."
      />
    );
  }

  return (
    <div className="stack">
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
            <span className="club-rank">{MEDALS[i] ?? i + 1}</span>
            <span className="club-row-name">{r.name}</span>
            <span className="club-row-stats muted small">
              {r.resultsRight} results · {r.marketsRight} markets
              {r.bankersHit > 0 && ` · ⭐${r.bankersHit}`}
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
