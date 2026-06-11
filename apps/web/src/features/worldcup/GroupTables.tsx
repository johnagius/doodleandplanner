import { findTeam, groupComplete, groupStandings, type WorldCupState } from '@dap/shared';

/** Live standings for all twelve groups; top two (and the third place) flagged. */
export function GroupTables({ wc }: { wc: WorldCupState }) {
  const groups = [...new Set(wc.teams.map((t) => t.group))].sort();
  return (
    <div className="wc-groups-grid">
      {groups.map((g) => (
        <GroupTable key={g} wc={wc} group={g} />
      ))}
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
