import { leaderboard, playedCount, type WorldCupState } from '@dap/shared';
import { EmptyState } from '../../components/EmptyState.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';

const MEDALS = ['🥇', '🥈', '🥉'];

/** Standings of the predictors themselves — who's winning the office sweepstake. */
export function Leaderboard({ wc }: { wc: WorldCupState }) {
  const meId = useWorldCupStore((s) => s.meId);
  const rows = leaderboard(wc);
  const played = playedCount(wc);
  const topScore = rows[0]?.points ?? 0;

  if (played === 0) {
    return (
      <EmptyState
        icon="🏆"
        title="No results yet"
        hint="Once the organiser enters the first full-time score, points appear here and the table comes to life."
      />
    );
  }

  return (
    <div className="stack">
      <p className="muted small">
        {played} match{played === 1 ? '' : 'es'} scored so far.
      </p>
      <ol className="wc-leaderboard">
        {rows.map((r, i) => (
          <li
            key={r.predictorId}
            className={`wc-leader-row ${r.predictorId === meId ? 'is-me' : ''} ${
              i === 0 && r.points > 0 ? 'is-leader' : ''
            }`}
          >
            <span className="wc-leader-rank">{MEDALS[i] ?? i + 1}</span>
            <span className="wc-leader-name">{r.name}</span>
            <span className="wc-leader-stats muted small">
              {r.exact} exact · {r.correctResults} right · {r.scored} picks
            </span>
            <span className="wc-leader-bar" aria-hidden>
              <span style={{ width: `${topScore ? (r.points / topScore) * 100 : 0}%` }} />
            </span>
            <span className="wc-leader-pts">{r.points}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
