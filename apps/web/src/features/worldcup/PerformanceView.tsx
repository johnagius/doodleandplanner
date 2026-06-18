import {
  WC_SCORE_LABEL,
  WC_STAGE_LABEL,
  achievements,
  colorForIndex,
  findMatch,
  findTeam,
  playerBreakdown,
  playerGameLog,
  playerStats,
  wcTimeline,
  type WcAchievement,
  type WcGameLogEntry,
  type WcScoreBreakdown,
  type WcScoreCategory,
  type WorldCupState,
} from '@dap/shared';
import { useMemo, useState, type CSSProperties } from 'react';
import { EmptyState } from '../../components/EmptyState.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { formatDay, formatDayLong } from './wcFormat.js';

const PTS_CLASS: Record<WcScoreCategory, string> = {
  exact: 'wc-pts-exact',
  goalDiff: 'wc-pts-diff',
  outcome: 'wc-pts-outcome',
  close: 'wc-pts-close',
  miss: 'wc-pts-miss',
};

// Order + labels for the accuracy breakdown bar/legend.
const CATS: Array<{ key: keyof WcScoreBreakdown; label: string }> = [
  { key: 'exact', label: 'Exact' },
  { key: 'goalDiff', label: 'Right margin' },
  { key: 'outcome', label: 'Right result' },
  { key: 'close', label: 'Close' },
  { key: 'miss', label: 'Missed' },
];

function accent(color: string): CSSProperties {
  return { ['--c']: color } as CSSProperties;
}

function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function Move({ n }: { n: number }) {
  if (n > 0) return <span className="wc-move up">▲{n}</span>;
  if (n < 0) return <span className="wc-move down">▼{-n}</span>;
  return (
    <span className="wc-move flat" aria-hidden>
      ·
    </span>
  );
}

/** A per-player deep dive: every guess they made, the points on each game, when
 * they topped a day, and their performance broken down by day and by accuracy. */
export function PerformanceView({ wc }: { wc: WorldCupState }) {
  const meId = useWorldCupStore((s) => s.meId);
  const colorById = useMemo(
    () => new Map(wc.predictors.map((p, i) => [p.id, colorForIndex(i)])),
    [wc.predictors],
  );
  const [picked, setPicked] = useState<string | null>(null);
  // Default to "me", falling back to the first predictor; honour an explicit pick.
  const selectedId =
    (picked && wc.predictors.some((p) => p.id === picked) ? picked : null) ??
    (meId && wc.predictors.some((p) => p.id === meId) ? meId : null) ??
    wc.predictors[0]?.id ??
    '';

  const t = useMemo(() => wcTimeline(wc), [wc]);
  const log = useMemo(() => playerGameLog(wc, selectedId), [wc, selectedId]);
  const stats = useMemo(() => playerStats(wc, selectedId), [wc, selectedId]);
  const breakdown = useMemo(() => playerBreakdown(wc, selectedId), [wc, selectedId]);
  const trophies = useMemo(() => achievements(wc, selectedId), [wc, selectedId]);
  const trophiesEarned = trophies.filter((a) => a.earned).length;
  const tlPlayer = t.players.find((p) => p.predictorId === selectedId) ?? null;
  const color = colorById.get(selectedId) ?? 'var(--primary)';
  const isMe = selectedId === meId;

  const resolved = log.filter((e) => e.result);
  const pending = log.filter((e) => !e.result);
  const avg = stats.scored ? stats.points / stats.scored : 0;

  // Per-day series for this player (resolved days), newest first for the feed.
  const tlRowByDay = new Map(
    t.days.map((d) => [d.day, d.rows.find((r) => r.predictorId === selectedId)]),
  );
  const dayBars = t.days.map((d) => {
    const row = tlRowByDay.get(d.day);
    return { day: d.day, points: row?.dayPoints ?? 0, won: row?.wonDay ?? false };
  });
  const maxDay = Math.max(1, ...dayBars.map((b) => b.points));

  // Group the resolved game log by day for the detailed breakdown.
  const byDay = new Map<string, WcGameLogEntry[]>();
  for (const e of resolved) {
    let arr = byDay.get(e.day);
    if (!arr) byDay.set(e.day, (arr = []));
    arr.push(e);
  }
  const daysDesc = [...byDay.keys()].sort().reverse();

  return (
    <div className="stack wc-perf">
      <div className="wc-perf-picker" role="tablist" aria-label="Choose a predictor">
        {wc.predictors.map((p, i) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={p.id === selectedId}
            className={`wc-perf-pill ${p.id === selectedId ? 'active' : ''}`}
            style={accent(colorForIndex(i))}
            onClick={() => setPicked(p.id)}
          >
            <span className="wc-tl-dot" aria-hidden />
            {p.name}
            {p.id === meId && <span className="muted small"> (you)</span>}
          </button>
        ))}
      </div>

      {log.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No picks yet"
          hint={`${tlPlayer?.name ?? 'This player'} hasn't made any predictions yet. Once they do, every guess and the points it earned show up here.`}
        />
      ) : (
        <>
          <section className="card wc-perf-summary" style={accent(color)}>
            <div className="wc-perf-id">
              <span className="wc-perf-avatar" aria-hidden>
                {(tlPlayer?.name ?? '?').slice(0, 1).toUpperCase()}
              </span>
              <div>
                <div className="wc-perf-name">{tlPlayer?.name}</div>
                <div className="muted small">
                  {stats.scored} game{stats.scored === 1 ? '' : 's'} scored
                  {pending.length > 0 && ` · ${pending.length} still to play`}
                </div>
              </div>
            </div>
            <div className="wc-perf-stats">
              <Stat value={stats.points} label="Points" big />
              <Stat value={tlPlayer ? ordinal(tlPlayer.rank) : '—'} label="Rank" />
              <Stat value={tlPlayer?.daysWon ?? 0} label="Days won" />
              <Stat value={stats.exact} label="Exact" />
              <Stat value={stats.scored ? avg.toFixed(1) : '—'} label="Avg / game" />
              <Stat value={`${trophiesEarned}/${trophies.length}`} label="Trophies" />
              {tlPlayer && tlPlayer.streak >= 2 && (
                <Stat value={`🔥${tlPlayer.streak}`} label="Day streak" />
              )}
            </div>
          </section>

          <TrophyCabinet trophies={trophies} earned={trophiesEarned} />

          {stats.scored > 0 && (
            <section className="card stack wc-perf-acc-card">
              <div className="row spread">
                <h3 style={{ margin: 0 }}>🎯 Accuracy</h3>
                <span className="muted small">{stats.scored} scored picks</span>
              </div>
              <div className="wc-perf-acc" aria-hidden>
                {CATS.map((c) =>
                  breakdown[c.key] > 0 ? (
                    <span
                      key={c.key}
                      className={`wc-perf-seg ${c.key}`}
                      style={{ flexGrow: breakdown[c.key] }}
                      title={`${c.label}: ${breakdown[c.key]}`}
                    />
                  ) : null,
                )}
              </div>
              <div className="wc-perf-acc-legend">
                {CATS.map((c) => (
                  <span key={c.key} className="wc-perf-acc-key">
                    <span className={`wc-perf-swatch ${c.key}`} aria-hidden />
                    {c.label} <strong>{breakdown[c.key]}</strong>
                  </span>
                ))}
              </div>
            </section>
          )}

          {dayBars.length > 0 && (
            <section className="card stack">
              <div className="row spread">
                <h3 style={{ margin: 0 }}>📊 Points by day</h3>
                <span className="muted small">👑 = won the day</span>
              </div>
              <div className="wc-perf-daybars-scroll">
                <div className="wc-perf-daybars" style={accent(color)}>
                  {dayBars.map((b) => (
                    <div
                      key={b.day}
                      className={`wc-perf-daybar ${b.won ? 'won' : ''}`}
                      title={`${formatDay(b.day)}: +${b.points}${b.won ? ' · won the day' : ''}`}
                    >
                      <span className="wc-perf-daybar-crown">{b.won ? '👑' : ''}</span>
                      <span className="wc-perf-daybar-val">{b.points}</span>
                      <span className="wc-perf-daybar-track">
                        <span
                          className="wc-perf-daybar-fill"
                          style={{ height: `${(b.points / maxDay) * 100}%` }}
                        />
                      </span>
                      <span className="wc-perf-daybar-day muted">
                        {formatDay(b.day).replace(/^\w+\s/, '')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section className="stack">
            <h3 style={{ margin: '0.25rem 0 0' }}>🧾 Every guess</h3>
            {daysDesc.length === 0 ? (
              <p className="muted small">No games scored yet for {tlPlayer?.name}.</p>
            ) : (
              daysDesc.map((day) => {
                const row = tlRowByDay.get(day);
                const entries = byDay.get(day)!;
                return (
                  <div key={day} className="card stack wc-perf-day">
                    <div className="row spread">
                      <strong>{formatDayLong(day)}</strong>
                      <span className="wc-perf-day-total" style={accent(color)}>
                        {row?.wonDay && <span title="Won the day">👑</span>} +{row?.dayPoints ?? 0}
                        {row && (
                          <span className="muted small">
                            {' '}
                            <Move n={row.movement} /> {ordinal(row.rank)}
                          </span>
                        )}
                      </span>
                    </div>
                    <ul className="wc-perf-games">
                      {entries.map((e) => (
                        <GameRow key={e.matchId} wc={wc} entry={e} isMe={isMe} />
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </section>

          {isMe && pending.length > 0 && (
            <section className="card stack">
              <h3 style={{ margin: 0 }}>⏳ Your upcoming picks</h3>
              <ul className="wc-perf-games">
                {pending.map((e) => (
                  <GameRow key={e.matchId} wc={wc} entry={e} isMe upcoming />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** The trophy cabinet: every achievement, earned ones lit by tier, locked ones
 * dimmed with a progress bar toward the target. Pure recognition — no points. */
function TrophyCabinet({ trophies, earned }: { trophies: WcAchievement[]; earned: number }) {
  return (
    <section className="card stack">
      <div className="row spread">
        <h3 style={{ margin: 0 }}>🏅 Trophy cabinet</h3>
        <span className="muted small">
          {earned} / {trophies.length} unlocked
        </span>
      </div>
      <ul className="wc-trophies">
        {trophies.map((tr) => {
          const pct = Math.min(100, Math.round((tr.have / tr.need) * 100));
          return (
            <li
              key={tr.id}
              className={`wc-trophy tier-${tr.tier} ${tr.earned ? 'earned' : 'locked'}`}
            >
              <span className="wc-trophy-emoji" aria-hidden>
                {tr.emoji}
              </span>
              <span className="wc-trophy-body">
                <span className="wc-trophy-label">{tr.label}</span>
                <span className="wc-trophy-desc muted small">{tr.desc}</span>
                {tr.earned ? (
                  <span className="wc-trophy-tag">✓ Unlocked</span>
                ) : tr.need > 1 ? (
                  <span
                    className="wc-trophy-prog"
                    title={`${Math.min(tr.have, tr.need)} / ${tr.need}`}
                  >
                    <span className="wc-trophy-prog-track">
                      <span className="wc-trophy-prog-fill" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="muted small">
                      {Math.min(tr.have, tr.need)}/{tr.need}
                    </span>
                  </span>
                ) : (
                  <span className="wc-trophy-tag muted">Locked</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Stat({ value, label, big }: { value: string | number; label: string; big?: boolean }) {
  return (
    <div className="wc-stat">
      <div className="wc-stat-value" style={big ? { color: 'var(--c)' } : undefined}>
        {value}
      </div>
      <div className="muted small">{label}</div>
    </div>
  );
}

/** One game: the two teams, the player's pick vs the actual score, and the
 * points it earned (coloured by category). */
function GameRow({
  wc,
  entry,
  isMe,
  upcoming,
}: {
  wc: WorldCupState;
  entry: WcGameLogEntry;
  isMe: boolean;
  upcoming?: boolean;
}) {
  const m = findMatch(wc, entry.matchId);
  const home = findTeam(wc, m?.homeId);
  const away = findTeam(wc, m?.awayId);
  const exact = entry.category === 'exact';
  const tag = m?.stage === 'group' && m.group ? `Group ${m.group}` : WC_STAGE_LABEL[entry.stage];
  return (
    <li className={`wc-perf-game ${exact ? 'is-exact' : ''}`}>
      <span className="wc-perf-game-main">
        <span className="wc-perf-game-stage muted small">{tag}</span>
        <span className="wc-perf-game-teams">
          <span className="wc-perf-team">
            {home?.flag} {home?.id ?? '?'}
          </span>
          <span className="wc-perf-score">
            {entry.result ? `${entry.result.home}–${entry.result.away}` : 'v'}
          </span>
          <span className="wc-perf-team">
            {away?.id ?? '?'} {away?.flag}
          </span>
        </span>
        <span className="muted small wc-perf-game-pick">
          {exact && <span aria-hidden>🎯 </span>}
          {isMe ? 'your pick' : 'pick'} {entry.pred.home}–{entry.pred.away}
        </span>
      </span>
      {upcoming ? (
        <span className="wc-perf-pts wc-pts-miss">picked</span>
      ) : (
        <span
          className={`wc-perf-pts ${entry.category ? PTS_CLASS[entry.category] : 'wc-pts-miss'}`}
          title={entry.category ? WC_SCORE_LABEL[entry.category] : undefined}
        >
          +{entry.points}
        </span>
      )}
    </li>
  );
}
