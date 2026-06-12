import {
  championBonusFor,
  championTeam,
  findTeam,
  isChampionLocked,
  type WorldCupState,
} from '@dap/shared';
import { useToast } from '../../components/Toast.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { useNow } from './useNow.js';

/** "Predict the winner": pick the team you think lifts the trophy. Picks lock
 * when the knockouts begin and bank points as your team's run goes deeper. */
export function ChampionPicker({ wc }: { wc: WorldCupState }) {
  const meId = useWorldCupStore((s) => s.meId);
  const { pickChampion, clearChampion } = useWorldCupStore();
  const { show } = useToast();
  const now = useNow();
  const locked = isChampionLocked(wc, new Date(now));
  const picks = wc.championPicks ?? {};
  const myPick = meId ? picks[meId] : undefined;
  const champion = championTeam(wc);
  const groups = [...new Set(wc.teams.map((t) => t.group))].sort();

  async function choose(teamId: string) {
    try {
      if (teamId) await pickChampion(teamId);
      else await clearChampion();
      show(teamId ? 'Champion saved 🏆' : 'Champion cleared');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not save champion');
    }
  }

  // Reveal everyone's pick once locked; before that, only your own shows.
  const entries = wc.predictors
    .map((p) => ({ p, teamId: picks[p.id] }))
    .filter((e): e is { p: (typeof wc.predictors)[number]; teamId: string } => !!e.teamId)
    .filter((e) => locked || e.p.id === meId);
  const hiddenCount = Object.keys(picks).length - entries.length;

  return (
    <div className="card wc-champion">
      <div className="wc-champion-head">
        <span className="wc-champion-title">🏆 Predict the winner</span>
        <span className="muted small">Champion 30 · Finalist 12 · Semis 6 · Quarters 3</span>
      </div>

      {!locked && meId && (
        <div className="row" style={{ gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="muted small" htmlFor="wc-champ-select">
            Your winner:
          </label>
          <select
            id="wc-champ-select"
            className="select wc-champion-select"
            value={myPick ?? ''}
            onChange={(e) => void choose(e.target.value)}
          >
            <option value="">— pick a team —</option>
            {groups.map((g) => (
              <optgroup key={g} label={`Group ${g}`}>
                {wc.teams
                  .filter((t) => t.group === g)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.flag} {t.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}
      {!locked && !meId && (
        <p className="muted small">Pick your name above to choose your champion.</p>
      )}
      {locked && <p className="muted small">🔒 Picks locked — the knockouts are under way.</p>}

      {(entries.length > 0 || hiddenCount > 0) && (
        <div className="wc-champion-picks">
          {entries.map(({ p, teamId }) => {
            const team = findTeam(wc, teamId);
            const bonus = championBonusFor(wc, teamId);
            const isChamp = !!champion && teamId === champion;
            return (
              <span
                key={p.id}
                className={`wc-champion-chip ${p.id === meId ? 'is-me' : ''} ${
                  isChamp ? 'is-won' : ''
                }`}
              >
                <span className="wc-champion-name">{p.name}</span>
                <span className="wc-champion-team">
                  <span aria-hidden>{team?.flag}</span> {team?.name ?? teamId}
                </span>
                {isChamp && (
                  <span aria-hidden title="Called it!">
                    👑
                  </span>
                )}
                {bonus > 0 && <span className="wc-champion-pts">+{bonus}</span>}
              </span>
            );
          })}
          {hiddenCount > 0 && (
            <span className="wc-champion-chip wc-pick-hidden">
              🔒 {hiddenCount} more · revealed at the knockouts
            </span>
          )}
        </div>
      )}
    </div>
  );
}
