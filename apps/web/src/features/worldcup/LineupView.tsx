import {
  findTeam,
  formationOf,
  placeLineup,
  teamValueM,
  type WcLineup,
  type WcMatch,
  type WorldCupState,
} from '@dap/shared';
import { useState } from 'react';
import { useLineups } from './lineups.js';

/** Last name (or full name if single token) — keeps tokens compact. */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1]! : name;
}

function valueLabel(m: number): string {
  return m >= 100 ? `€${Math.round(m)}M` : `€${m}M`;
}

/** The angled half-pitch with the starting XI drawn in their positions, each
 * with our ability rating + an estimated market value. */
function Pitch({ wc, lineup }: { wc: WorldCupState; lineup: WcLineup }) {
  const placed = placeLineup(lineup);
  const formation = formationOf(lineup.players);
  const total = teamValueM(lineup);
  const team = findTeam(wc, lineup.teamTla);
  return (
    <div className="wc-lp">
      <div className="row spread wc-lp-head">
        <span className="wc-lp-team">
          {team?.flag} {team?.name ?? lineup.teamTla}
        </span>
        <span className="badge">{formation}</span>
      </div>
      <div className="wc-lp-wrap">
        <div className="wc-lp-pitch">
          <div className="wc-lp-box" aria-hidden />
          <div className="wc-lp-arc" aria-hidden />
          {placed.map((p) => {
            const tier = p.rating >= 84 ? 'gold' : p.rating >= 75 ? 'silver' : 'bronze';
            return (
              <div
                key={p.player.name + p.player.jersey}
                className="wc-lp-token"
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              >
                <span className={`wc-lp-shirt tier-${tier}`}>
                  <span className="wc-lp-num">{p.player.jersey ?? ''}</span>
                  <span className="wc-lp-rating">{p.rating}</span>
                </span>
                <span className="wc-lp-name" title={p.player.name}>
                  {shortName(p.player.name)}
                </span>
                <span className="wc-lp-val">{valueLabel(p.valueM)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="wc-lp-total">
        Total XI value ≈ <strong>{valueLabel(total)}</strong> <span className="muted">(est.)</span>
      </div>
    </div>
  );
}

/** Lineups tab: pick a side and see its formation drawn on an angled pitch. */
export function LineupView({ wc, match }: { wc: WorldCupState; match: WcMatch }) {
  const { loading, lineups } = useLineups(match.homeId, match.awayId);
  const home = findTeam(wc, match.homeId);
  const away = findTeam(wc, match.awayId);
  // Default to whichever side has a lineup (home first).
  const [side, setSide] = useState<'home' | 'away'>('home');
  const effective = side === 'home' ? (lineups.home ? 'home' : 'away') : side;
  const selected = effective === 'home' ? lineups.home : lineups.away;

  if (loading) {
    return <p className="muted small wc-lp-note">Loading lineups…</p>;
  }
  if (!lineups.home && !lineups.away) {
    return (
      <p className="muted small wc-lp-note">
        👥 Lineups drop about an hour before kickoff — check back closer to the game.
      </p>
    );
  }
  return (
    <div className="stack">
      <div className="wc-lp-toggle" role="tablist" aria-label="Choose a team">
        <button
          role="tab"
          aria-selected={effective === 'home'}
          className={`wc-lp-side ${effective === 'home' ? 'active' : ''}`}
          onClick={() => setSide('home')}
        >
          {home?.flag} {home?.id ?? 'Home'}
        </button>
        <button
          role="tab"
          aria-selected={effective === 'away'}
          className={`wc-lp-side ${effective === 'away' ? 'active' : ''}`}
          onClick={() => setSide('away')}
        >
          {away?.flag} {away?.id ?? 'Away'}
        </button>
      </div>
      {selected ? (
        <Pitch wc={wc} lineup={selected} />
      ) : (
        <p className="muted small wc-lp-note">That side's lineup isn't out yet.</p>
      )}
      <p className="muted small" style={{ textAlign: 'center' }}>
        Lineup + positions from ESPN · ratings & values are our own estimate.
      </p>
    </div>
  );
}
