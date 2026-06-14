import { colorForIndex, wcTimeline, type WcTimeline, type WorldCupState } from '@dap/shared';
import { useMemo, type CSSProperties } from 'react';
import { EmptyState } from '../../components/EmptyState.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { formatDay, formatDayLong } from './wcFormat.js';

const MEDALS = ['🥇', '🥈', '🥉'];

/** "1st", "2nd", "3rd", "4th"… */
function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** Set the per-row accent colour as a CSS variable. */
function accent(color: string): CSSProperties {
  return { ['--c']: color } as CSSProperties;
}

/** Rank movement arrow, reusing the leaderboard's up/down/flat styles. */
function Move({ n }: { n: number }) {
  if (n > 0) return <span className="wc-move up">▲{n}</span>;
  if (n < 0) return <span className="wc-move down">▼{-n}</span>;
  return (
    <span className="wc-move flat" aria-hidden>
      ·
    </span>
  );
}

/**
 * The race told day by day: a headline, a "days won" crown board, an animated
 * rank-over-time bump chart, and a vertical feed of every match day.
 */
export function TimelineView({ wc }: { wc: WorldCupState }) {
  const meId = useWorldCupStore((s) => s.meId);
  const t = useMemo(() => wcTimeline(wc), [wc]);
  const colorById = useMemo(
    () => new Map(wc.predictors.map((p, i) => [p.id, colorForIndex(i)])),
    [wc.predictors],
  );
  const colour = (id: string) => colorById.get(id) ?? 'var(--primary)';

  if (t.days.length === 0) {
    return (
      <EmptyState
        icon="📈"
        title="The race hasn't started"
        hint="Once the first full-time result lands, this timeline charts who won each day and how the standings swing — day by day."
      />
    );
  }

  const latest = t.days[t.days.length - 1]!;
  const leader = latest.rows[0]!;
  const latestWinners = latest.winners
    .map((id) => latest.rows.find((r) => r.predictorId === id)?.name ?? id)
    .join(' & ');

  return (
    <div className="stack wc-tl">
      <div className="wc-tl-headline">
        <div className="wc-tl-hl is-leader" style={accent(colour(leader.predictorId))}>
          <span className="wc-tl-hl-emoji" aria-hidden>
            👑
          </span>
          <div className="wc-tl-hl-text">
            <span className="wc-tl-hl-label">Overall leader</span>
            <span className="wc-tl-hl-name">{leader.name}</span>
            <span className="wc-tl-hl-sub">
              {leader.total} pts · leads {t.days.length} day{t.days.length === 1 ? '' : 's'} in
            </span>
          </div>
        </div>
        <div
          className="wc-tl-hl"
          style={accent(latest.winners[0] ? colour(latest.winners[0]) : 'var(--muted)')}
        >
          <span className="wc-tl-hl-emoji" aria-hidden>
            📅
          </span>
          <div className="wc-tl-hl-text">
            <span className="wc-tl-hl-label">{formatDay(latest.day)} — day winner</span>
            <span className="wc-tl-hl-name">{latestWinners || '—'}</span>
            <span className="wc-tl-hl-sub">
              {latest.topPoints > 0 ? `+${latest.topPoints} on the day` : 'no points scored'}
            </span>
          </div>
        </div>
      </div>

      <CrownBoard t={t} colorById={colorById} meId={meId} />
      <RankBumpChart
        t={t}
        colorById={colorById}
        meId={meId}
        predictorIds={wc.predictors.map((p) => p.id)}
      />
      <DayFeed t={t} colorById={colorById} meId={meId} />

      <p className="muted small" style={{ textAlign: 'center' }}>
        Standings here count match points day by day — the champion-pick bonus is shown on the
        Leaderboard.
      </p>
    </div>
  );
}

/** "Days won" board — most match days topped, with streaks. */
function CrownBoard({
  t,
  colorById,
  meId,
}: {
  t: WcTimeline;
  colorById: Map<string, string>;
  meId: string | null;
}) {
  const maxWins = Math.max(1, ...t.players.map((p) => p.daysWon));
  return (
    <section className="card stack wc-tl-crowns">
      <div className="row spread">
        <h3 style={{ margin: 0 }}>👑 Days won</h3>
        <span className="muted small">Top scorer of each match day</span>
      </div>
      <ol className="wc-tl-crownlist">
        {t.players.map((p, i) => (
          <li
            key={p.predictorId}
            className={`wc-tl-crownrow ${p.predictorId === meId ? 'is-me' : ''}`}
            style={accent(colorById.get(p.predictorId) ?? 'var(--primary)')}
          >
            <span className="wc-tl-crank">{MEDALS[i] ?? i + 1}</span>
            <span className="wc-tl-cname">
              <span className="wc-tl-dot" aria-hidden />
              {p.name}
              {p.streak >= 2 && (
                <span className="wc-tl-streak" title={`${p.streak}-day winning streak`}>
                  🔥{p.streak}
                </span>
              )}
            </span>
            <span className="wc-tl-cbar" aria-hidden>
              <span style={{ width: `${(p.daysWon / maxWins) * 100}%` }} />
            </span>
            <span className="wc-tl-cwins">{p.daysWon === 0 ? '—' : `👑 ${p.daysWon}`}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Animated rank-over-time bump chart: one line per predictor, gold ring on the
 * days they won. Pure SVG with a normalised pathLength draw-in. */
function RankBumpChart({
  t,
  colorById,
  predictorIds,
  meId,
}: {
  t: WcTimeline;
  colorById: Map<string, string>;
  predictorIds: string[];
  meId: string | null;
}) {
  const days = t.days;
  const n = days.length;
  const m = predictorIds.length;
  const nameOf = new Map(t.players.map((p) => [p.predictorId, p.name]));

  const padL = 34;
  const padR = 108;
  const padT = 24;
  const padB = 34;
  const stepX = 66;
  const rowH = 44;
  const innerW = Math.max(stepX, (n - 1) * stepX);
  const innerH = Math.max(rowH, (m - 1) * rowH);
  const W = padL + innerW + padR;
  const H = padT + innerH + padB;

  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (rank: number) => padT + (m === 1 ? innerH / 2 : ((rank - 1) / (m - 1)) * innerH);
  const rankOf = (i: number, id: string) =>
    days[i]!.rows.find((r) => r.predictorId === id)?.rank ?? m;

  return (
    <section className="card wc-tl-chart">
      <div className="row spread" style={{ marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0 }}>📈 Standings over time</h3>
        <span className="muted small">Rank by match points · gold ring = won the day</span>
      </div>
      <div className="wc-bump-scroll">
        <svg
          className="wc-bump"
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          role="img"
          aria-label="Chart of each predictor's rank over time"
        >
          {/* Rank gridlines + axis labels (1 = top). */}
          {Array.from({ length: m }, (_, r) => (
            <g key={`grid-${r}`}>
              <line
                className="wc-bump-grid"
                x1={padL}
                y1={y(r + 1)}
                x2={padL + innerW}
                y2={y(r + 1)}
              />
              <text className="wc-bump-axis" x={padL - 8} y={y(r + 1)} textAnchor="end">
                {r + 1}
              </text>
            </g>
          ))}
          {/* Day labels along the foot. */}
          {days.map((d, i) => (
            <text
              key={`date-${d.day}`}
              className="wc-bump-date"
              x={x(i)}
              y={H - 10}
              textAnchor="middle"
            >
              {formatDay(d.day).replace(/^\w+\s/, '')}
            </text>
          ))}
          {/* One series per predictor. */}
          {predictorIds.map((id) => {
            const c = colorById.get(id) ?? 'var(--primary)';
            const path = days.map((_, i) => `${x(i)},${y(rankOf(i, id))}`).join(' L');
            return (
              <g key={id}>
                {n > 1 && (
                  <path
                    className="wc-bump-line"
                    d={`M${path}`}
                    pathLength={1}
                    fill="none"
                    stroke={c}
                    strokeWidth={meId === id ? 4.5 : 3}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
                {days.map((day, i) => {
                  const won = day.winners.includes(id);
                  return (
                    <circle
                      key={`${id}-${i}`}
                      className="wc-bump-node"
                      cx={x(i)}
                      cy={y(rankOf(i, id))}
                      r={won ? 6.5 : 4}
                      fill={c}
                      stroke={won ? '#f5b301' : 'var(--surface)'}
                      strokeWidth={won ? 2.5 : 1.5}
                    >
                      <title>
                        {nameOf.get(id)} — {formatDay(day.day)}: {ordinal(rankOf(i, id))}
                        {won ? ' · won the day' : ''}
                      </title>
                    </circle>
                  );
                })}
                <text
                  className={`wc-bump-name ${meId === id ? 'is-me' : ''}`}
                  x={x(n - 1) + 12}
                  y={y(rankOf(n - 1, id))}
                  fill={c}
                >
                  {nameOf.get(id)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

/** Vertical day-by-day feed, newest first: who won, everyone's haul, and who
 * leads after the day. */
function DayFeed({
  t,
  colorById,
  meId,
}: {
  t: WcTimeline;
  colorById: Map<string, string>;
  meId: string | null;
}) {
  const maxDayPoints = Math.max(1, ...t.days.map((d) => d.topPoints));
  const daysDesc = [...t.days].reverse();
  return (
    <section className="stack">
      <div className="row spread">
        <h3 style={{ margin: 0 }}>🗓️ Day by day</h3>
        <span className="muted small">Latest first</span>
      </div>
      <ol className="wc-tl-feed">
        {daysDesc.map((day) => {
          const leader = day.rows[0]!;
          const winnerNames = day.winners
            .map((id) => day.rows.find((r) => r.predictorId === id)?.name ?? id)
            .join(' & ');
          return (
            <li key={day.day} className="wc-tl-item">
              <span
                className={`wc-tl-node-mark ${day.winners.length ? 'won' : ''}`}
                style={accent(
                  day.winners[0]
                    ? (colorById.get(day.winners[0]) ?? 'var(--muted)')
                    : 'var(--muted)',
                )}
                aria-hidden
              >
                {day.winners.length ? '👑' : '·'}
              </span>
              <div className="card stack wc-tl-card">
                <div className="row spread">
                  <strong>{formatDayLong(day.day)}</strong>
                  <span className="muted small">
                    {day.matches} match{day.matches === 1 ? '' : 'es'}
                  </span>
                </div>

                {day.winners.length > 0 ? (
                  <div className="wc-tl-winner">
                    <span className="wc-tl-winner-tag">Day winner</span>
                    <span className="wc-tl-winner-name">{winnerNames}</span>
                    <span className="wc-tl-winner-pts">+{day.topPoints}</span>
                  </div>
                ) : (
                  <div className="muted small">No points scored on this day.</div>
                )}

                <ul className="wc-tl-bars">
                  {[...day.rows]
                    .sort((a, b) => b.dayPoints - a.dayPoints || a.rank - b.rank)
                    .map((r) => (
                      <li
                        key={r.predictorId}
                        className={`wc-tl-bar ${r.predictorId === meId ? 'is-me' : ''} ${
                          r.wonDay ? 'won' : ''
                        }`}
                        style={accent(colorById.get(r.predictorId) ?? 'var(--primary)')}
                      >
                        <span className="wc-tl-bar-name">
                          <span className="wc-tl-dot" aria-hidden />
                          {r.name}
                        </span>
                        <span className="wc-tl-bar-track" aria-hidden>
                          <span style={{ width: `${(r.dayPoints / maxDayPoints) * 100}%` }} />
                        </span>
                        <span className="wc-tl-bar-val">
                          {r.dayPoints > 0 ? `+${r.dayPoints}` : '0'}
                        </span>
                        <span className="wc-tl-bar-move">
                          <Move n={r.movement} />
                          <span className="muted">{ordinal(r.rank)}</span>
                        </span>
                      </li>
                    ))}
                </ul>

                <div className="wc-tl-after muted small">
                  After this day —{' '}
                  <strong style={{ color: colorById.get(leader.predictorId) }}>
                    {leader.name}
                  </strong>{' '}
                  leads on {leader.total}.
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
