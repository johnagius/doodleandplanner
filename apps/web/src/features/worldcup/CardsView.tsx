import {
  cardLeaderboard,
  cardsWonBy,
  findTeam,
  playerCard,
  type WcPlayerCard,
  type WorldCupState,
} from '@dap/shared';
import { EmptyState } from '../../components/EmptyState.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { usePlayerPhoto } from './playerPhoto.js';

const MEDALS = ['🥇', '🥈', '🥉'];

/** The player-card collectible game: top a match's points to win a random WC
 * player, collect them, and climb the "most cards" table. */
export function CardsView({ wc }: { wc: WorldCupState }) {
  const meId = useWorldCupStore((s) => s.meId);
  const lb = cardLeaderboard(wc);
  const myCards = meId ? cardsWonBy(wc, meId) : [];
  const anyCards = lb.some((r) => r.cards > 0);

  return (
    <div className="stack">
      <div className="card stack">
        <div className="row spread">
          <h3 style={{ margin: 0 }}>🃏 Card collectors</h3>
          <span className="muted small">Top a match's points → a random player (never a dupe)</span>
        </div>
        {anyCards ? (
          <ol className="wc-cards-board">
            {lb.map((r, i) => (
              <li
                key={r.predictorId}
                className={`wc-cardrow ${r.predictorId === meId ? 'is-me' : ''}`}
              >
                <span className="wc-cardrow-rank">{MEDALS[i] ?? `${i + 1}`}</span>
                <span className="wc-cardrow-name">{r.name}</span>
                <span className="wc-cardrow-count">
                  🃏 {r.cards} card{r.cards === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted small">
            No cards won yet — the moment a match finishes, whoever scored the most points on it
            pulls a random player card. Skill to win the match, luck on who you get.
          </p>
        )}
      </div>

      <h3 style={{ margin: '0.25rem 0 0' }}>
        {meId ? `Your cards (${myCards.length})` : 'Your cards'}
      </h3>
      {!meId ? (
        <p className="muted small">Pick your name above to start your collection.</p>
      ) : myCards.length === 0 ? (
        <EmptyState
          icon="🃏"
          title="No cards yet"
          hint="Finish top of a match's points table and a random World Cup player drops into your collection."
        />
      ) : (
        <div className="wc-card-grid">
          {myCards
            .map((w) => ({ key: w.matchId, card: playerCard(w.player) }))
            .sort((a, b) => b.card.overall - a.card.overall)
            .map(({ key, card }) => (
              <PlayerCardView key={key} card={card} wc={wc} />
            ))}
        </div>
      )}
      <p className="muted small" style={{ textAlign: 'center' }}>
        1,249 squad players · every card globally unique · photos via Wikimedia & TheSportsDB ·
        ratings are our own (real FIFA data is proprietary).
      </p>
    </div>
  );
}

const STAT_ROWS: Array<[string, keyof WcPlayerCard['stats']]> = [
  ['PAC', 'pace'],
  ['SHO', 'shooting'],
  ['PAS', 'passing'],
  ['DRI', 'dribbling'],
  ['DEF', 'defending'],
  ['PHY', 'physical'],
];

/** A FIFA-style player card. Photo is layered on later; for now the nation flag
 * is the art. */
export function PlayerCardView({ card, wc }: { card: WcPlayerCard; wc: WorldCupState }) {
  const team = findTeam(wc, card.player.nat);
  const photo = usePlayerPhoto(card.player.name);
  return (
    <div className={`wc-fifa-card tier-${card.tier}`}>
      <div className="wc-fifa-head">
        <span className="wc-fifa-ovr">{card.overall}</span>
        <span className="wc-fifa-pos">{card.player.pos}</span>
        <span className="wc-fifa-flag" aria-hidden>
          {team?.flag ?? '⚽'}
        </span>
      </div>
      <div className="wc-fifa-photo" aria-hidden>
        {photo ? (
          <img src={photo} alt="" loading="lazy" />
        ) : (
          <span className="wc-fifa-photo-flag">{team?.flag ?? '⚽'}</span>
        )}
      </div>
      <div className="wc-fifa-name" title={card.player.name}>
        {card.player.name}
      </div>
      <div className="wc-fifa-nat">{team?.name ?? card.player.nat}</div>
      <div className="wc-fifa-stats">
        {STAT_ROWS.map(([label, key]) => (
          <span key={key} className="wc-fifa-stat">
            <strong>{card.stats[key]}</strong> {label}
          </span>
        ))}
      </div>
    </div>
  );
}
