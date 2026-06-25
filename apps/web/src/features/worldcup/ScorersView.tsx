import {
  findSquadPlayer,
  findTeam,
  tournamentScorers,
  type WcScorer,
  type WcSquadPlayer,
  type WorldCupState,
} from '@dap/shared';
import { useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { PlayerProfileModal } from './PlayerProfileModal.js';

const MEDALS = ['🥇', '🥈', '🥉'];

/** One scorer row — clickable into the player profile when we carry the player. */
function ScorerRow({
  scorer,
  rank,
  wc,
  onPlayer,
}: {
  scorer: WcScorer;
  rank: number;
  wc: WorldCupState;
  onPlayer: (p: WcSquadPlayer) => void;
}) {
  const team = findTeam(wc, scorer.teamTla);
  const squad = findSquadPlayer(scorer.name, scorer.teamTla);
  return (
    <tr>
      <td className="wc-gb-rank">{MEDALS[rank] ?? rank + 1}</td>
      <td className="wc-gb-name">
        <span aria-hidden>{team?.flag ?? '⚽'}</span>{' '}
        {squad ? (
          <button type="button" className="wc-leader-name is-link" onClick={() => onPlayer(squad)}>
            {scorer.name}
          </button>
        ) : (
          scorer.name
        )}
        <span className="muted small"> · {team?.id ?? scorer.teamTla}</span>
      </td>
      <td className="wc-gb-goals">{scorer.goals}</td>
    </tr>
  );
}

/** "Scorers" tab: the tournament Golden Boot race, aggregated from the live
 * goal/assist feed (the events we already fetch from ESPN). */
export function ScorersView({ wc }: { wc: WorldCupState }) {
  const matchEvents = useWorldCupStore((s) => s.matchEvents);
  const scorers = useMemo(
    () => tournamentScorers(Object.values(matchEvents).flat()),
    [matchEvents],
  );
  const [profilePlayer, setProfilePlayer] = useState<WcSquadPlayer | null>(null);

  if (scorers.length === 0) {
    return (
      <EmptyState
        icon="🥇"
        title="No goals yet"
        hint="The Golden Boot race fills in as the goals fly in — check back once the matches kick off."
      />
    );
  }

  return (
    <div className="wc-goldenboot">
      <div className="wc-statsview-head">
        <span className="wc-statsview-title">🥇 Golden Boot race</span>
      </div>
      <table className="wc-mini-table wc-gb-table">
        <thead>
          <tr>
            <th aria-label="Rank">#</th>
            <th className="wc-gb-name">Player</th>
            <th title="Goals">⚽</th>
          </tr>
        </thead>
        <tbody>
          {scorers.map((s, i) => (
            <ScorerRow
              key={`${s.name}-${s.teamTla}`}
              scorer={s}
              rank={i}
              wc={wc}
              onPlayer={setProfilePlayer}
            />
          ))}
        </tbody>
      </table>
      <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>
        Goals from the live feed · penalties count, own goals don't · tap a name for their profile.
      </p>
      {profilePlayer && (
        <PlayerProfileModal player={profilePlayer} wc={wc} onClose={() => setProfilePlayer(null)} />
      )}
    </div>
  );
}
