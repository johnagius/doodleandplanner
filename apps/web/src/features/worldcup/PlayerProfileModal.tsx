import {
  findTeam,
  marketValueM,
  playerCard,
  tallyPlayerEvents,
  type WcPlayerCard,
  type WcPlayerPos,
  type WcSquadPlayer,
  type WorldCupState,
} from '@dap/shared';
import { Modal } from '../../components/Modal.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { usePlayerPhoto } from './playerPhoto.js';
import { usePlayerProfile } from './playerProfile.js';

const POS_LABEL: Record<WcPlayerPos, string> = {
  GK: 'Goalkeeper',
  DEF: 'Defender',
  MID: 'Midfielder',
  FWD: 'Forward',
};

const STAT_ROWS: Array<[string, keyof WcPlayerCard['stats']]> = [
  ['PAC', 'pace'],
  ['SHO', 'shooting'],
  ['PAS', 'passing'],
  ['DRI', 'dribbling'],
  ['DEF', 'defending'],
  ['PHY', 'physical'],
];

function ageFrom(born: string): number | null {
  const d = new Date(born);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 60 ? age : null;
}

/**
 * A player's profile: who/where (club, nationality, age, height, bio from
 * TheSportsDB), their real market value (Transfermarkt) and our ability ratings,
 * plus their actual World Cup tally aggregated from the match-event feed. Honest
 * about its sources; full domestic-season stat lines aren't in free data.
 */
export function PlayerProfileModal({
  player,
  wc,
  onClose,
}: {
  player: WcSquadPlayer;
  wc: WorldCupState;
  onClose: () => void;
}) {
  const team = findTeam(wc, player.nat);
  const photo = usePlayerPhoto(player.name);
  const { profile, loading } = usePlayerProfile(player.name);
  const matchEvents = useWorldCupStore((s) => s.matchEvents);
  const card = playerCard(player);
  const value = marketValueM(player.name);
  const wcStats = tallyPlayerEvents(Object.values(matchEvents).flat(), player.name);
  const hasWc = wcStats.goals + wcStats.assists + wcStats.yellow + wcStats.red > 0;
  const age = profile?.born ? ageFrom(profile.born) : null;
  const dash = (v: string | null | undefined) => v || (loading ? '…' : '—');

  return (
    <Modal open onClose={onClose} title={player.name}>
      <div className="wc-pp stack">
        <div className="wc-pp-head">
          <div className="wc-pp-photo">
            {photo ? <img src={photo} alt="" /> : <span aria-hidden>{team?.flag ?? '⚽'}</span>}
          </div>
          <div className="wc-pp-id">
            <div className="wc-pp-name">{player.name}</div>
            <div className="muted small">
              {team?.flag ?? ''} {team?.name ?? player.nat} ·{' '}
              {profile?.position || POS_LABEL[player.pos]}
            </div>
            {value != null && <div className="wc-pp-value">€{value}M market value</div>}
          </div>
          <div className="wc-pp-ovr" title="Our ability rating">
            {card.overall}
          </div>
        </div>

        <div className="wc-pp-facts">
          <span>
            <span className="muted small">Club</span>
            <strong>{dash(profile?.club)}</strong>
          </span>
          <span>
            <span className="muted small">Age</span>
            <strong>{age != null ? age : dash(null)}</strong>
          </span>
          <span>
            <span className="muted small">Height</span>
            <strong>{dash(profile?.height)}</strong>
          </span>
          <span>
            <span className="muted small">Nationality</span>
            <strong>{dash(profile?.nationality ?? team?.name)}</strong>
          </span>
        </div>

        {hasWc && (
          <div className="wc-pp-wc">
            <span className="muted small">World Cup so far</span>
            <span className="wc-pp-wc-line">
              ⚽ {wcStats.goals} · 🅰️ {wcStats.assists} · 🟨 {wcStats.yellow} · 🟥 {wcStats.red}
            </span>
          </div>
        )}

        <div className="wc-pp-ratings">
          {STAT_ROWS.map(([label, key]) => (
            <span key={key} className="wc-fifa-stat">
              <strong>{card.stats[key]}</strong> {label}
            </span>
          ))}
        </div>

        {profile?.description && (
          <p className="muted small wc-pp-bio">
            {profile.description.length > 320
              ? `${profile.description.slice(0, 319)}…`
              : profile.description}
          </p>
        )}

        <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>
          Club &amp; bio via TheSportsDB · value via Transfermarkt · World Cup tally from the live
          feed · ability ratings are our own.
        </p>
      </div>
    </Modal>
  );
}
