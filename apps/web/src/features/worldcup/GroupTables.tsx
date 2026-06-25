import {
  findTeam,
  groupComplete,
  groupStandings,
  teamsOutOfContention,
  thirdPlacedRanking,
  type WorldCupState,
} from '@dap/shared';

/** How many third-placed teams reach the Round of 32 (2026 format). */
const BEST_THIRDS = 8;

/** Live standings for all twelve groups; top two (and the third place) flagged,
 * plus the cross-group race for the eight best third-placed teams. */
export function GroupTables({ wc }: { wc: WorldCupState }) {
  const groups = [...new Set(wc.teams.map((t) => t.group))].sort();
  return (
    <div className="stack">
      <ThirdPlaceRace wc={wc} />
      <div className="wc-groups-grid">
        {groups.map((g) => (
          <GroupTable key={g} wc={wc} group={g} />
        ))}
      </div>
    </div>
  );
}

/** The live "best third-placed teams" table: 8 of 12 qualify, ranked exactly as
 * qualification is decided (points → goal difference → goals for). Provisional —
 * recomputes from the current standings, so it tracks the cut as games play out. */
function ThirdPlaceRace({ wc }: { wc: WorldCupState }) {
  const thirds = thirdPlacedRanking(wc);
  const out = teamsOutOfContention(wc);
  const anyPlayed = wc.matches.some((m) => m.stage === 'group' && m.result);
  if (thirds.length === 0) return null;
  return (
    <div className="card wc-thirds">
      <div className="wc-group-head">
        <h3 className="card-title">🥉 Best third-placed teams</h3>
        <span className="badge badge-success">8 of 12 advance</span>
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
                const team = findTeam(wc, r.teamId);
                const qualifying = i < BEST_THIRDS;
                const eliminated = out.has(r.teamId);
                const cls = `${qualifying ? 'wc-third-in' : 'wc-third-out'}${
                  i === BEST_THIRDS ? ' wc-third-cut' : ''
                }`;
                return (
                  <tr key={r.teamId} className={cls}>
                    <td className="wc-td-pos">{i + 1}</td>
                    <td className="wc-td-team">
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
            top 8 reach the Round of 32. Provisional until every group is complete.
          </p>
        </>
      )}
    </div>
  );
}

function GroupTable({ wc, group }: { wc: WorldCupState; group: string }) {
  const rows = groupStandings(wc, group);
  const complete = groupComplete(wc, group);
  const anyPlayed = rows.some((r) => r.played > 0);

  return (
    <div className="card wc-group">
      <div className="wc-group-head">
        <h3 className="card-title">Group {group}</h3>
        {complete && <span className="badge badge-success">final</span>}
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
