import { clubRankTimeline, type ClubLeagueState } from '@dap/shared';
import { useMemo } from 'react';
import { useClubLeagueStore } from '../../state/clubLeagueStore.js';

const PALETTE = [
  '#6366f1',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#06b6d4',
  '#8b5cf6',
  '#84cc16',
  '#f97316',
  '#14b8a6',
];

/** A compact rank-over-time chart (rank 1 at the top) — one line per player,
 * yours highlighted. Inline SVG, no chart library. */
export function ClubTimeline({ club }: { club: ClubLeagueState }) {
  const meId = useClubLeagueStore((s) => s.meId);
  const { days, series } = useMemo(() => clubRankTimeline(club), [club]);

  if (days.length < 2) {
    return (
      <p className="muted small" style={{ margin: 0 }}>
        The rank chart appears once at least two match-days have been played.
      </p>
    );
  }

  const n = club.predictors.length;
  const W = 640;
  const H = 260;
  const padL = 28;
  const padR = 12;
  const padT = 14;
  const padB = 22;
  const x = (i: number) =>
    padL + (days.length === 1 ? 0 : (i / (days.length - 1)) * (W - padL - padR));
  const y = (rank: number) => padT + ((rank - 1) / Math.max(1, n - 1)) * (H - padT - padB);
  const colorOf = (i: number) => PALETTE[i % PALETTE.length]!;

  // Draw the viewer's line last (on top).
  const ordered = [...series].sort((a) => (a.predictorId === meId ? 1 : -1));

  return (
    <div className="stack" style={{ gap: '0.5rem' }}>
      <div className="club-chart-wrap">
        <svg
          className="club-chart"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Rank over time, one line per player"
          preserveAspectRatio="none"
        >
          {/* rank gridlines */}
          {Array.from({ length: n }, (_, r) => (
            <line
              key={r}
              x1={padL}
              x2={W - padR}
              y1={y(r + 1)}
              y2={y(r + 1)}
              className="club-chart-grid"
            />
          ))}
          {Array.from({ length: n }, (_, r) => (
            <text key={r} x={4} y={y(r + 1) + 4} className="club-chart-axis">
              {r + 1}
            </text>
          ))}
          {ordered.map((s) => {
            const idx = series.findIndex((z) => z.predictorId === s.predictorId);
            const isMe = s.predictorId === meId;
            const pts = s.points.map((p, i) => `${x(i)},${y(p.rank)}`).join(' ');
            return (
              <polyline
                key={s.predictorId}
                points={pts}
                fill="none"
                stroke={colorOf(idx)}
                strokeWidth={isMe ? 3.5 : 1.6}
                strokeOpacity={isMe || !meId ? 1 : 0.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      </div>
      <ul className="club-chart-legend">
        {series.map((s) => {
          const idx = series.findIndex((z) => z.predictorId === s.predictorId);
          return (
            <li key={s.predictorId} className={s.predictorId === meId ? 'is-me' : ''}>
              <span className="club-chart-dot" style={{ background: colorOf(idx) }} aria-hidden />
              {s.name}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
