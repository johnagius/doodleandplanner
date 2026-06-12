import {
  badgesFor,
  dayChampion,
  findMatch,
  findTeam,
  headToHead,
  leaderboardWithMovement,
  playedCount,
  playerForm,
  playerStats,
  type WcScoreCategory,
  type WorldCupState,
} from '@dap/shared';
import { useState } from 'react';
import { EmptyState } from '../../components/EmptyState.js';
import { Modal } from '../../components/Modal.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { formatDayLong } from './wcFormat.js';

const MEDALS = ['🥇', '🥈', '🥉'];

const FORM_CLASS: Record<WcScoreCategory, string> = {
  exact: 'wc-pts-exact',
  goalDiff: 'wc-pts-diff',
  outcome: 'wc-pts-outcome',
  close: 'wc-pts-close',
  miss: 'wc-pts-miss',
};

/** Compact match label using three-letter team codes, e.g. "MEX v RSA". */
function matchLabel(wc: WorldCupState, matchId: string): string {
  const m = findMatch(wc, matchId);
  if (!m) return matchId;
  return `${findTeam(wc, m.homeId)?.id ?? '?'} v ${findTeam(wc, m.awayId)?.id ?? '?'}`;
}

function Movement({ n }: { n: number }) {
  if (n > 0)
    return (
      <span className="wc-move up" title={`Up ${n}`}>
        ▲{n}
      </span>
    );
  if (n < 0)
    return (
      <span className="wc-move down" title={`Down ${-n}`}>
        ▼{-n}
      </span>
    );
  return (
    <span className="wc-move flat" aria-hidden>
      ·
    </span>
  );
}

function FormDots({ form }: { form: WcScoreCategory[] }) {
  if (form.length === 0) return null;
  return (
    <span className="wc-form" aria-label="Recent form">
      {form.map((c, i) => (
        <span key={i} className={`wc-form-dot ${FORM_CLASS[c]}`} />
      ))}
    </span>
  );
}

/** Standings of the predictors themselves — who's winning the sweepstake. */
export function Leaderboard({ wc }: { wc: WorldCupState }) {
  const meId = useWorldCupStore((s) => s.meId);
  const rows = leaderboardWithMovement(wc);
  const played = playedCount(wc);
  const topScore = rows[0]?.points ?? 0;
  const champ = dayChampion(wc);
  const [openId, setOpenId] = useState<string | null>(null);

  if (played === 0) {
    return (
      <EmptyState
        icon="🏆"
        title="No results yet"
        hint="As soon as the first full-time score lands (auto-filled from the live feed), points appear here and the table comes to life."
      />
    );
  }

  return (
    <div className="stack">
      {champ && (
        <div className="banner wc-daychamp">
          🗓️ {formatDayLong(champ.day)} — top scorer <strong>{champ.name}</strong> (+{champ.points})
        </div>
      )}
      <p className="muted small">
        {played} match{played === 1 ? '' : 'es'} scored · tap a player for their stats.
      </p>
      <ol className="wc-leaderboard">
        {rows.map((r, i) => {
          const badges = badgesFor(wc, r.predictorId);
          return (
            <li key={r.predictorId}>
              <button
                type="button"
                className={`wc-leader-row ${r.predictorId === meId ? 'is-me' : ''} ${
                  i === 0 && r.points > 0 ? 'is-leader' : ''
                }`}
                onClick={() => setOpenId(r.predictorId)}
              >
                <span className="wc-leader-rank">
                  {MEDALS[i] ?? i + 1}
                  <Movement n={r.movement} />
                </span>
                <span className="wc-leader-name">
                  {r.name}
                  {badges.map((b) => (
                    <span key={b.id} className="wc-badge" title={b.label} aria-label={b.label}>
                      {b.emoji}
                    </span>
                  ))}
                </span>
                <span className="wc-leader-stats muted small">
                  <FormDots form={playerForm(wc, r.predictorId)} />
                  {r.exact} exact · {r.correctResults} right · {r.scored} picks
                </span>
                <span className="wc-leader-bar" aria-hidden>
                  <span style={{ width: `${topScore ? (r.points / topScore) * 100 : 0}%` }} />
                </span>
                <span className="wc-leader-pts">{r.points}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {openId && <PlayerModal wc={wc} predictorId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function PlayerModal({
  wc,
  predictorId,
  onClose,
}: {
  wc: WorldCupState;
  predictorId: string;
  onClose: () => void;
}) {
  const me = wc.predictors.find((p) => p.id === predictorId);
  const stats = playerStats(wc, predictorId);
  const badges = badgesFor(wc, predictorId);
  const others = wc.predictors.filter((p) => p.id !== predictorId);
  const [vsId, setVsId] = useState(() => others[0]?.id ?? '');
  const vs = wc.predictors.find((p) => p.id === vsId);
  const h2h = vsId ? headToHead(wc, predictorId, vsId) : null;

  return (
    <Modal open onClose={onClose} title={me?.name ?? 'Player'}>
      <div className="stack" style={{ gap: '0.85rem' }}>
        {badges.length > 0 && (
          <div className="row row-wrap" style={{ gap: '0.3rem' }}>
            {badges.map((b) => (
              <span key={b.id} className="badge">
                {b.emoji} {b.label}
              </span>
            ))}
          </div>
        )}

        <div className="wc-stat-grid">
          <Stat label="Points" value={stats.points} />
          <Stat label="Exact" value={stats.exact} />
          <Stat label="Right result" value={stats.correctResults} />
          <Stat label="Picks scored" value={stats.scored} />
        </div>

        {stats.best && (
          <p className="small" style={{ margin: 0 }}>
            ⭐ Best pick: <strong>{matchLabel(wc, stats.best.matchId)}</strong> (+
            {stats.best.points})
          </p>
        )}

        {others.length > 0 && h2h && vs && (
          <div className="stack" style={{ gap: '0.4rem' }}>
            <label className="field" style={{ gap: '0.25rem' }}>
              Compare with
              <select className="select" value={vsId} onChange={(e) => setVsId(e.target.value)}>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="wc-h2h-total">
              <strong>{me?.name}</strong> {h2h.aTotal} – {h2h.bTotal} <strong>{vs.name}</strong>
            </div>
            {h2h.rows.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                No shared scored matches yet.
              </p>
            ) : (
              <ul className="wc-h2h">
                {h2h.rows.map((row) => (
                  <li key={row.matchId} className="wc-h2h-row">
                    <span className={row.aPoints >= row.bPoints ? 'wc-h2h-win' : ''}>
                      {row.aPoints}
                    </span>
                    <span className="muted small">{matchLabel(wc, row.matchId)}</span>
                    <span className={row.bPoints >= row.aPoints ? 'wc-h2h-win' : ''}>
                      {row.bPoints}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="wc-stat">
      <div className="wc-stat-value">{value}</div>
      <div className="muted small">{label}</div>
    </div>
  );
}
