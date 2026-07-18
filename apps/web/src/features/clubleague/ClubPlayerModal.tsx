import {
  findClubPredictor,
  findCompetition,
  findPrediction,
  marketsForResult,
  orderedFixtures,
  scoreClubPrediction,
  type ClubLeagueState,
} from '@dap/shared';
import { Modal } from '../../components/Modal.js';

/** A player's season history: their resulted picks fixture-by-fixture with points,
 * plus headline totals. Read-only — opened from any leaderboard/reveal row. */
export function ClubPlayerModal({
  club,
  predictorId,
  onClose,
}: {
  club: ClubLeagueState;
  predictorId: string | null;
  onClose: () => void;
}) {
  const player = findClubPredictor(club, predictorId ?? undefined);
  const rows = predictorId
    ? orderedFixtures(club)
        .filter((f) => f.result && findPrediction(club, f.id, predictorId))
        .map((f) => {
          const pred = findPrediction(club, f.id, predictorId)!;
          const score = scoreClubPrediction(pred, f.result!);
          return { f, pred, score };
        })
        .reverse() // most recent first
    : [];
  const total = rows.reduce((n, r) => n + r.score.points, 0);
  const marketsRight = rows.reduce(
    (n, r) =>
      n +
      (r.score.hits.result ? 1 : 0) +
      (r.score.hits.totals ? 1 : 0) +
      (r.score.hits.btts ? 1 : 0),
    0,
  );

  return (
    <Modal open={!!predictorId} onClose={onClose} title={player ? `📊 ${player.name}` : 'Player'}>
      <div className="stack" style={{ gap: '0.6rem' }}>
        <div className="club-stat-grid">
          <div className="club-stat">
            <div className="club-stat-value">{total}</div>
            <div className="muted small">Points</div>
          </div>
          <div className="club-stat">
            <div className="club-stat-value">{rows.length}</div>
            <div className="muted small">Games scored</div>
          </div>
          <div className="club-stat">
            <div className="club-stat-value">{marketsRight}</div>
            <div className="muted small">Markets right</div>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            No scored predictions yet.
          </p>
        ) : (
          <ul className="club-history">
            {rows.map(({ f, pred, score }) => {
              const settled = marketsForResult(f.result!);
              const comp = findCompetition(club, f.competitionId);
              const pill = (label: string, hit: boolean) => (
                <span className={`club-pill ${hit ? 'is-hit' : 'is-miss'}`}>
                  {label} {hit ? '✓' : '✗'}
                </span>
              );
              return (
                <li key={f.id} className="club-history-row">
                  <div className="club-history-teams">
                    <span>
                      {f.home.short} {f.result!.home}–{f.result!.away} {f.away.short}
                    </span>
                    <span className="muted small">{comp?.short ?? ''}</span>
                  </div>
                  <div className="club-pills">
                    {pred.outcome && pill(pred.outcome, pred.outcome === settled.outcome)}
                    {pred.totals &&
                      pill(
                        pred.totals === 'over' ? 'O2.5' : 'U2.5',
                        pred.totals === settled.totals,
                      )}
                    {pred.btts &&
                      pill(`BTTS ${pred.btts === 'yes' ? 'Y' : 'N'}`, pred.btts === settled.btts)}
                    {pred.combinator && <span className="club-combi-tag">🎯</span>}
                  </div>
                  <span className={`club-ticket-pts ${score.points > 0 ? 'is-hit' : 'is-miss'}`}>
                    +{score.points}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
