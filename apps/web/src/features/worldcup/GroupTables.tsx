import {
  findMatch,
  findTeam,
  groupComplete,
  groupStandings,
  teamsOutOfContention,
  thirdPlacedRanking,
  withProvisionalResults,
  type WorldCupState,
} from '@dap/shared';
import { useMemo } from 'react';
import { useWorldCupStore } from '../../state/worldCupStore.js';

/** How many third-placed teams reach the Round of 32 (2026 format). */
const BEST_THIRDS = 8;

/** Live standings for all twelve groups + the cross-group best-thirds race. While
 * matches are on, in-play scores are folded in as provisional results so the
 * tables (and the qualification cut) update live. */
export function GroupTables({ wc }: { wc: WorldCupState }) {
  const live = useWorldCupStore((s) => s.live);
  const groups = useMemo(() => [...new Set(wc.teams.map((t) => t.group))].sort(), [wc]);

  // In-play scores → provisional results. Recomputes as the feed ticks.
  const liveScores = useMemo(() => {
    const out: Record<string, { home: number; away: number }> = {};
    for (const [id, info] of Object.entries(live)) {
      if (
        (info.status === 'IN_PLAY' || info.status === 'PAUSED') &&
        info.home != null &&
        info.away != null
      ) {
        out[id] = { home: info.home, away: info.away };
      }
    }
    return out;
  }, [live]);
  const liveWc = useMemo(() => withProvisionalResults(wc, liveScores), [wc, liveScores]);
  const liveGroups = useMemo(() => {
    const s = new Set<string>();
    for (const id of Object.keys(liveScores)) {
      const g = findMatch(wc, id)?.group;
      if (g) s.add(g);
    }
    return s;
  }, [wc, liveScores]);

  return (
    <div className="stack">
      <ThirdPlaceRace wc={wc} liveWc={liveWc} liveGroups={liveGroups} />
      <div className="wc-groups-grid">
        {groups.map((g) => (
          <GroupTable
            key={g}
            wc={liveWc}
            group={g}
            complete={groupComplete(wc, g)}
            live={liveGroups.has(g)}
          />
        ))}
      </div>
    </div>
  );
}

/** The live "best third-placed teams" table: 8 of 12 qualify, ranked exactly as
 * qualification is decided (points → goal difference → goals for). Ranking folds
 * in live scores; the ❌ "eliminated" flag stays on confirmed results only. */
function ThirdPlaceRace({
  wc,
  liveWc,
  liveGroups,
}: {
  wc: WorldCupState;
  liveWc: WorldCupState;
  liveGroups: Set<string>;
}) {
  const thirds = thirdPlacedRanking(liveWc);
  const out = teamsOutOfContention(wc);
  const anyPlayed = liveWc.matches.some((m) => m.stage === 'group' && m.result);
  if (thirds.length === 0) return null;
  const liveActive = liveGroups.size > 0;
  return (
    <div className="card wc-thirds">
      <div className="wc-group-head">
        <h3 className="card-title">🥉 Best third-placed teams</h3>
        {liveActive ? (
          <span className="badge wc-live-badge">🔴 LIVE</span>
        ) : (
          <span className="badge badge-success">8 of 12 advance</span>
        )}
      </div>
      {!anyPlayed ? (
        <p className="muted small wc-group-empty">Fills in once the group games kick off.</p>
      ) : (
        <>
          <table className="wc-table wc-thirds-table">
            <thead>
              <tr>
                <th className="wc-th-pos" aria-label="Rank">
                  #
                </th>
                <th className="wc-th-team">Team</th>
                <th title="Group">Grp</th>
                <th>P</th>
                <th>GD</th>
                <th>Pts</th>
                <th aria-label="Qualification status"> </th>
              </tr>
            </thead>
            <tbody>
              {thirds.map((r, i) => {
                const team = findTeam(liveWc, r.teamId);
                const qualifying = i < BEST_THIRDS;
                const eliminated = out.has(r.teamId);
                const isLive = team ? liveGroups.has(team.group) : false;
                const cls = `${qualifying ? 'wc-third-in' : 'wc-third-out'}${
                  i === BEST_THIRDS ? ' wc-third-cut' : ''
                }`;
                return (
                  <tr key={r.teamId} className={cls}>
                    <td className="wc-td-pos">{i + 1}</td>
                    <td className="wc-td-team">
                      {isLive && (
                        <span className="wc-live-dot" title="Live now" aria-hidden>
                          🔴
                        </span>
                      )}
                      <span aria-hidden>{team?.flag}</span> <span>{team?.name}</span>
                    </td>
                    <td>{team?.group}</td>
                    <td>{r.played}</td>
                    <td>{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</td>
                    <td className="wc-td-pts">{r.points}</td>
                    <td
                      title={
                        eliminated
                          ? 'Eliminated'
                          : qualifying
                            ? 'Qualifying as it stands'
                            : 'Below the cut'
                      }
                    >
                      {eliminated ? '❌' : qualifying ? '✅' : '⚪'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted small wc-group-empty">
            Ranked by points, then goal difference, then goals scored. The dashed line is the cut —
            top 8 reach the Round of 32.{' '}
            {liveActive ? 'Includes in-play scores.' : 'Provisional until every group is complete.'}
          </p>
        </>
      )}
    </div>
  );
}

function GroupTable({
  wc,
  group,
  complete,
  live,
}: {
  wc: WorldCupState;
  group: string;
  complete: boolean;
  live: boolean;
}) {
  const rows = groupStandings(wc, group);
  const anyPlayed = rows.some((r) => r.played > 0);

  return (
    <div className="card wc-group">
      <div className="wc-group-head">
        <h3 className="card-title">Group {group}</h3>
        {live ? (
          <span className="badge wc-live-badge">🔴 LIVE</span>
        ) : complete ? (
          <span className="badge badge-success">final</span>
        ) : null}
      </div>
      <table className="wc-table">
        <thead>
          <tr>
            <th className="wc-th-pos" aria-label="Position">
              #
            </th>
            <th className="wc-th-team">Team</th>
            <th>P</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>GD</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const team = findTeam(wc, r.teamId);
            const zone = i < 2 ? 'qualify' : i === 2 ? 'third' : '';
            return (
              <tr key={r.teamId} className={`wc-row-${zone}`}>
                <td className="wc-td-pos">{i + 1}</td>
                <td className="wc-td-team">
                  <span aria-hidden>{team?.flag}</span> <span>{team?.name}</span>
                </td>
                <td>{r.played}</td>
                <td>{r.won}</td>
                <td>{r.drawn}</td>
                <td>{r.lost}</td>
                <td>{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</td>
                <td className="wc-td-pts">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!anyPlayed && <p className="muted small wc-group-empty">No results yet.</p>}
    </div>
  );
}
