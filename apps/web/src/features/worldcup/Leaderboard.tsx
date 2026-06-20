import {
  badgesFor,
  cardBadgeFor,
  dayChampion,
  findMatch,
  findPredictor,
  findTeam,
  formTable,
  headToHead,
  leaderboardWithMovement,
  playedCount,
  playerCard,
  playerForm,
  playerStats,
  rivalry,
  roundAwards,
  type WcScoreCategory,
  type WorldCupState,
} from '@dap/shared';
import { useState } from 'react';
import { EmptyState } from '../../components/EmptyState.js';
import { Modal } from '../../components/Modal.js';
import { useToast } from '../../components/Toast.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { Avatar } from './Avatar.js';
import { CardBadge } from './CardsView.js';
import { liveScoresFromLive } from './liveStandings.js';
import { renderWcShareCard, shareWcCard } from './shareCard.js';
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

export function Movement({ n }: { n: number }) {
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
  const live = useWorldCupStore((s) => s.live);
  const [openId, setOpenId] = useState<string | null>(null);
  const { show } = useToast();

  // Fold in-play games into the table "as it stands" (final results take over
  // once they land). Scores can lag on the free feed — we flag that. Shared with
  // the Match Room's live board so the two never drift.
  const liveScores = liveScoresFromLive(wc, live);
  const liveCount = Object.keys(liveScores).length;
  const rows = leaderboardWithMovement(wc, liveCount ? liveScores : undefined);
  const played = playedCount(wc);
  const topScore = rows[0]?.points ?? 0;
  const champ = dayChampion(wc);
  const myRow = meId ? rows.find((r) => r.predictorId === meId) : undefined;

  async function shareMyCard() {
    if (!myRow) return;
    const rankLabel = `${ordinal(myRow.rank)} of ${rows.length}`;
    const gap = topScore - myRow.points;
    const subtitle =
      myRow.rank === 1
        ? 'Top of the table 👑'
        : gap === 0
          ? 'Level with the lead'
          : `${gap} point${gap === 1 ? '' : 's'} off the lead`;
    try {
      const blob = await renderWcShareCard({
        title: wc.title,
        name: myRow.name,
        medal: MEDALS[myRow.rank - 1] ?? `#${myRow.rank}`,
        rankLabel,
        points: myRow.points,
        exact: myRow.exact,
        correctResults: myRow.correctResults,
        scored: myRow.scored,
        subtitle,
        url: 'doodleandplanner.pages.dev/world-cup',
      });
      const res = await shareWcCard(
        blob,
        `${myRow.name}: ${myRow.points} pts (${rankLabel}) — World Cup 2026 Predictions`,
        wc.title,
      );
      if (res === 'downloaded') show('Card saved — share it anywhere 📸');
    } catch {
      show('Could not create the card');
    }
  }

  if (played === 0 && liveCount === 0) {
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
      {liveCount > 0 && (
        <div className="banner wc-live-banner">
          🔴 Live standings — includes {liveCount} in-play game{liveCount === 1 ? '' : 's'} as it
          stands (the free feed can lag the real score)
        </div>
      )}
      {champ && (
        <div className="banner wc-daychamp">
          🗓️ {formatDayLong(champ.day)} — top scorer <strong>{champ.name}</strong> (+{champ.points})
        </div>
      )}
      {meId && <RivalryLine wc={wc} meId={meId} liveScores={liveCount ? liveScores : undefined} />}
      <div className="row spread" style={{ alignItems: 'center', gap: '0.5rem' }}>
        <p className="muted small" style={{ margin: 0 }}>
          {played} match{played === 1 ? '' : 'es'} scored · tap a player for their stats.
        </p>
        {myRow && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void shareMyCard()}
            title="Share an image of your standings"
          >
            📸 Share my card
          </button>
        )}
      </div>
      <ol className="wc-leaderboard">
        {rows.map((r, i) => {
          const badges = badgesFor(wc, r.predictorId);
          const cardBadge = cardBadgeFor(wc, r.predictorId);
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
                  <Avatar predictor={findPredictor(wc, r.predictorId)} size={32} />
                  {r.name}
                  {cardBadge && <CardBadge card={playerCard(cardBadge.player)} wc={wc} />}
                  {badges.map((b) => (
                    <span key={b.id} className="wc-badge" title={b.label} aria-label={b.label}>
                      {b.emoji}
                    </span>
                  ))}
                </span>
                <span className="wc-leader-stats muted small">
                  <FormDots form={playerForm(wc, r.predictorId)} />
                  {r.exact} exact · {r.correctResults} right · {r.scored} picks
                  {r.bonus > 0 && <span className="wc-leader-bonus"> · 🏆 +{r.bonus}</span>}
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

      <FormView wc={wc} meId={meId} />

      <RoundHonours wc={wc} />

      {openId && <PlayerModal wc={wc} predictorId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/** Join predictor ids into "Alice & Bob" for an award line. */
function namesOf(wc: WorldCupState, ids: string[]): string {
  return ids.map((id) => findPredictor(wc, id)?.name ?? '?').join(' & ');
}

/** "1st", "2nd", "3rd", "4th"… */
function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** A motivating "where you stand" line for the current player: your rank plus
 * the gap to the rival just above (to catch) and just below (to hold off). */
function RivalryLine({
  wc,
  meId,
  liveScores,
}: {
  wc: WorldCupState;
  meId: string;
  liveScores?: Record<string, { home: number; away: number }>;
}) {
  const r = rivalry(wc, meId, liveScores ? { liveScores } : undefined);
  if (!r) return null;
  const parts: string[] = [];
  if (r.ahead) {
    parts.push(
      r.ahead.gap === 0
        ? `level with ${r.ahead.name} above`
        : `${r.ahead.gap} behind ${r.ahead.name}`,
    );
  }
  if (r.behind) {
    parts.push(
      r.behind.gap === 0
        ? `level with ${r.behind.name} below`
        : `${r.behind.gap} ahead of ${r.behind.name}`,
    );
  }
  return (
    <div className="banner wc-rivalry">
      {r.rank === 1 ? '👑' : '🎯'} You’re <strong>{ordinal(r.rank)}</strong> of {r.of}
      {parts.length > 0 && <> — {parts.join(' · ')}</>}
    </div>
  );
}

function TrendArrow({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up')
    return (
      <span className="wc-trend up" title="Heating up — above their average">
        ▲
      </span>
    );
  if (trend === 'down')
    return (
      <span className="wc-trend down" title="Cooling off — below their average">
        ▼
      </span>
    );
  return null;
}

/** A "who's hot" table: predictors ranked by points over their last 5 results —
 * recent momentum, separate from the all-time standings. */
function FormView({ wc, meId }: { wc: WorldCupState; meId: string | null }) {
  const rows = formTable(wc, 5).filter((r) => r.games > 0);
  if (rows.length === 0) return null;
  return (
    <div className="card stack wc-form-card">
      <div className="row spread">
        <h3 style={{ margin: 0 }}>🔥 In form</h3>
        <span className="muted small">Points over the last 5 results</span>
      </div>
      <ol className="wc-form-table">
        {rows.map((r, i) => (
          <li
            key={r.predictorId}
            className={`wc-form-row ${r.predictorId === meId ? 'is-me' : ''}`}
          >
            <span className="wc-form-rank muted">{i + 1}</span>
            <span className="wc-form-name">
              {r.name}
              <TrendArrow trend={r.trend} />
            </span>
            <FormDots form={r.form} />
            <span className="wc-form-pts">+{r.points}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** An honours board: Player of the Round 🏅 and Wooden Spoon 🥄 for every
 * completed round (group matchdays then each knockout stage), newest first. */
function RoundHonours({ wc }: { wc: WorldCupState }) {
  const awards = roundAwards(wc);
  if (awards.length === 0) return null;
  return (
    <div className="card stack wc-honours">
      <div className="row spread">
        <h3 style={{ margin: 0 }}>🏅 Round honours</h3>
        <span className="muted small">Top & bottom of each completed round</span>
      </div>
      <ul className="wc-honours-list">
        {awards.map((a, i) => (
          <li key={a.key} className={`wc-honour ${i === 0 ? 'is-latest' : ''}`}>
            <span className="wc-honour-round">{a.label}</span>
            <span className="wc-honour-awards">
              {a.winners.length > 0 ? (
                <span className="wc-honour-potr" title="Player of the Round">
                  🏅 {namesOf(wc, a.winners)} <span className="muted small">+{a.topPoints}</span>
                </span>
              ) : (
                <span className="muted small">No points scored</span>
              )}
              {a.spoon.length > 0 && (
                <span className="wc-honour-spoon" title="Wooden Spoon — fewest points">
                  🥄 {namesOf(wc, a.spoon)} <span className="muted small">+{a.lowPoints}</span>
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
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
