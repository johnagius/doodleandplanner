import {
  findTeam,
  formationOf,
  pitchRow,
  placeLineup,
  tallyPlayerEvents,
  type WcLineup,
  type WcMatch,
  type WcPitchRow,
  type WcPlacedPlayer,
  type WcTeam,
  type WorldCupState,
} from '@dap/shared';
import { useState } from 'react';
import { Modal } from '../../components/Modal.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { useLineups } from './lineups.js';
import { usePlayerPhoto } from './playerPhoto.js';
import { usePlayerValues } from './values.js';

const POS_LABEL: Record<WcPitchRow, string> = {
  GK: 'Goalkeeper',
  DEF: 'Defender',
  DM: 'Defensive midfielder',
  MID: 'Midfielder',
  AM: 'Attacking midfielder',
  FWD: 'Forward',
};

/** Last name (or full name if single token) — keeps tokens compact. */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1]! : name;
}

/** €M label, e.g. "€80M" or "€1.5M"; "…" while loading, "—" when unknown. */
function valueLabel(m: number | null | undefined): string {
  if (m === undefined) return '…';
  if (m === null) return '—';
  return m >= 100 ? `€${Math.round(m)}M` : `€${m}M`;
}

/** One player token: their face when we can find a photo, else a numbered shirt,
 * with our ability rating badged on top, and name + real market value beneath.
 * Tap it for the player panel. */
function LineupToken({
  placed,
  value,
  onOpen,
}: {
  placed: WcPlacedPlayer;
  value: number | null | undefined;
  onOpen: () => void;
}) {
  const photo = usePlayerPhoto(placed.player.name);
  const tier = placed.rating >= 84 ? 'gold' : placed.rating >= 75 ? 'silver' : 'bronze';
  return (
    <button
      type="button"
      className="wc-lp-token"
      style={{ left: `${placed.x * 100}%`, top: `${placed.y * 100}%` }}
      onClick={onOpen}
      aria-label={`${placed.player.name} — details`}
    >
      <span className="wc-lp-shirtwrap">
        <span className={`wc-lp-shirt tier-${tier} ${photo ? 'has-photo' : ''}`}>
          {photo ? (
            <img src={photo} alt="" loading="lazy" />
          ) : (
            <span className="wc-lp-num">{placed.player.jersey ?? ''}</span>
          )}
        </span>
        <span className="wc-lp-rating">{(placed.rating / 10).toFixed(1)}</span>
      </span>
      <span className="wc-lp-name" title={placed.player.name}>
        {shortName(placed.player.name)}
      </span>
      <span className="wc-lp-val">{valueLabel(value)}</span>
    </button>
  );
}

/** Tap-through panel for one player: photo, position, real value, our rating,
 * and their World Cup goals / assists / cards so far. */
function PlayerPanel({
  placed,
  value,
  team,
  onClose,
}: {
  placed: WcPlacedPlayer;
  value: number | null | undefined;
  team: WcTeam | undefined;
  onClose: () => void;
}) {
  const photo = usePlayerPhoto(placed.player.name);
  const matchEvents = useWorldCupStore((s) => s.matchEvents);
  const tally = tallyPlayerEvents(Object.values(matchEvents).flat(), placed.player.name);
  return (
    <Modal open onClose={onClose} title={placed.player.name}>
      <div className="stack wc-pp" style={{ gap: '0.85rem' }}>
        <div className="wc-pp-head">
          <span className={`wc-pp-photo ${photo ? '' : 'is-flag'}`} aria-hidden>
            {photo ? <img src={photo} alt="" /> : (team?.flag ?? '⚽')}
          </span>
          <div className="stack" style={{ gap: '0.15rem' }}>
            <span className="wc-pp-pos">
              {team?.flag} {POS_LABEL[pitchRow(placed.player.pos)]}
              {placed.player.jersey != null && ` · #${placed.player.jersey}`}
            </span>
            <span className="muted small">{team?.name ?? team?.id}</span>
          </div>
        </div>
        <div className="wc-stat-grid">
          <Stat label="Value" value={valueLabel(value)} />
          <Stat label="Rating" value={`${(placed.rating / 10).toFixed(1)}`} />
          <Stat label="Goals" value={tally.goals} />
          <Stat label="Assists" value={tally.assists} />
        </div>
        <div className="row" style={{ gap: '0.6rem', justifyContent: 'center' }}>
          <span className="badge">🟨 {tally.yellow}</span>
          <span className="badge">🟥 {tally.red}</span>
        </div>
        <p className="muted small" style={{ margin: 0, textAlign: 'center' }}>
          Value: Transfermarkt · goals/assists/cards: this World Cup. Rating is our own estimate.
        </p>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="wc-stat">
      <div className="wc-stat-value">{value}</div>
      <div className="muted small">{label}</div>
    </div>
  );
}

/** The angled half-pitch with the starting XI drawn in their positions, each
 * with our ability rating + their real Transfermarkt market value. */
function Pitch({ wc, lineup }: { wc: WorldCupState; lineup: WcLineup }) {
  const placed = placeLineup(lineup);
  const formation = formationOf(lineup.players);
  const team = findTeam(wc, lineup.teamTla);
  const names = lineup.players.filter((p) => p.starter).map((p) => p.name);
  const values = usePlayerValues(names);
  const loading = Object.keys(values).length === 0;
  const total = names.reduce((sum, n) => sum + (typeof values[n] === 'number' ? values[n]! : 0), 0);
  const [open, setOpen] = useState<WcPlacedPlayer | null>(null);
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
          {placed.map((p) => (
            <LineupToken
              key={p.player.name + p.player.jersey}
              placed={p}
              value={values[p.player.name]}
              onOpen={() => setOpen(p)}
            />
          ))}
        </div>
      </div>
      <div className="wc-lp-total">
        {loading ? (
          <span className="muted">Loading market values…</span>
        ) : (
          <>
            Total XI value ≈ <strong>€{Math.round(total)}M</strong>{' '}
            <span className="muted">· Transfermarkt · tap a player</span>
          </>
        )}
      </div>
      {open && (
        <PlayerPanel
          placed={open}
          value={values[open.player.name]}
          team={team}
          onClose={() => setOpen(null)}
        />
      )}
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
    </div>
  );
}
