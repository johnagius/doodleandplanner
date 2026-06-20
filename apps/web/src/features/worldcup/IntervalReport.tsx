/**
 * The Cinema's Half-Time / Full-Time card — a broadcast-style recap that takes
 * over the big screen at the break: the scoreline, who scored on each side, and a
 * few headline stats (possession, shots, on target) with dueling bars. Stats come
 * from the same ESPN summary as the lineups, so they fill in once a backend is
 * wired; without one it's a clean score + scorers card. Dismissible (× to watch
 * the room), and it clears itself when the second half gets going. Pure display.
 */
import { findTeam, type WcMatch, type WorldCupState } from '@dap/shared';
import { useEffect, useMemo, useState } from 'react';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import {
  buildIntervalReport,
  goalLabel,
  statValue,
  type IntervalGoal,
  type IntervalPhase,
  type IntervalStat,
} from './intervalReport.js';
import { useMatchSummary } from './matchSummary.js';
import { legibleScoreColor } from './wcFormat.js';

export function IntervalReport({ wc, match }: { wc: WorldCupState; match: WcMatch }) {
  const live = useWorldCupStore((s) => s.live[match.id]);
  const events = useWorldCupStore((s) => s.matchEvents[match.id]);
  const home = findTeam(wc, match.homeId);
  const away = findTeam(wc, match.awayId);
  const { summary } = useMatchSummary(home?.id, away?.id);
  const homeAccent = legibleScoreColor(live?.homeColor);
  const awayAccent = legibleScoreColor(live?.awayColor);

  const data = useMemo(
    () => buildIntervalReport(wc, match, live, events, summary),
    [wc, match, live, events, summary],
  );
  const phase = data?.phase ?? null;

  // Reappear for the next break, but stay gone once dismissed for this one.
  const [dismissed, setDismissed] = useState<IntervalPhase | null>(null);
  useEffect(() => {
    if (!phase) setDismissed(null);
  }, [phase]);

  if (!data || dismissed === data.phase) return null;
  const goalless = data.home.goals.length === 0 && data.away.goals.length === 0;

  return (
    <div className={`wc-interval is-${data.phase}`} role="status" aria-live="polite">
      <div className="wc-interval-card">
        <button
          type="button"
          className="wc-interval-x"
          onClick={() => setDismissed(data.phase)}
          aria-label="Dismiss the report"
        >
          ✕
        </button>
        <div className="wc-interval-label">
          {data.phase === 'ft' ? '🏁' : '⏸'} {data.label}
        </div>

        <div className="wc-interval-score">
          <span className="wc-interval-team">
            <span className="wc-interval-flag" aria-hidden>
              {data.home.flag}
            </span>
            <span className="wc-interval-name">{data.home.name}</span>
          </span>
          <span className="wc-interval-nums">
            <b style={homeAccent ? { color: homeAccent } : undefined}>{data.home.score}</b>
            <i>–</i>
            <b style={awayAccent ? { color: awayAccent } : undefined}>{data.away.score}</b>
          </span>
          <span className="wc-interval-team wc-interval-team-r">
            <span className="wc-interval-flag" aria-hidden>
              {data.away.flag}
            </span>
            <span className="wc-interval-name">{data.away.name}</span>
          </span>
        </div>

        {goalless ? (
          <p className="wc-interval-goalless">
            {data.phase === 'ft' ? 'Goalless draw' : 'Still goalless'}
          </p>
        ) : (
          <div className="wc-interval-scorers">
            <ScorerList goals={data.home.goals} />
            <span className="wc-interval-ball" aria-hidden>
              ⚽
            </span>
            <ScorerList goals={data.away.goals} right />
          </div>
        )}

        {data.stats.length > 0 && (
          <div className="wc-interval-stats">
            {data.stats.map((s) => (
              <StatRow key={s.label} stat={s} homeAccent={homeAccent} awayAccent={awayAccent} />
            ))}
          </div>
        )}

        <div className="wc-interval-foot">
          {data.phase === 'ft' ? 'That’s full time' : 'Back underway shortly'} · tap ✕ to watch the
          room
        </div>
      </div>
    </div>
  );
}

function ScorerList({ goals, right }: { goals: IntervalGoal[]; right?: boolean }) {
  return (
    <ul className={`wc-interval-side ${right ? 'wc-interval-side-r' : ''}`}>
      {goals.map((g, i) => (
        <li key={`${g.player}-${g.minute}-${i}`}>{goalLabel(g)}</li>
      ))}
    </ul>
  );
}

function StatRow({
  stat,
  homeAccent,
  awayAccent,
}: {
  stat: IntervalStat;
  homeAccent?: string;
  awayAccent?: string;
}) {
  return (
    <div className="wc-interval-stat">
      <span className="wc-interval-stat-v">{statValue(stat, 'home')}</span>
      <span className="wc-interval-stat-label">{stat.label}</span>
      <span className="wc-interval-stat-v wc-interval-stat-v-r">{statValue(stat, 'away')}</span>
      <div className="wc-interval-bar">
        <span
          className="wc-interval-bar-h"
          style={{ width: `${stat.homePct}%`, ...(homeAccent ? { background: homeAccent } : {}) }}
        />
        <span
          className="wc-interval-bar-a"
          style={{ width: `${stat.awayPct}%`, ...(awayAccent ? { background: awayAccent } : {}) }}
        />
      </div>
    </div>
  );
}
