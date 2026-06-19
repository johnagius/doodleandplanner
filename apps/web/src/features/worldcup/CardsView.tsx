import {
  WC_CARD_REACTIONS,
  cardBadgeFor,
  cardLeaderboard,
  cardReactionsFor,
  cardsWonBy,
  findPredictor,
  findTeam,
  playerCard,
  recentCardAwards,
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
  const setCardBadge = useWorldCupStore((s) => s.setCardBadge);
  const lb = cardLeaderboard(wc);
  const myCards = meId ? cardsWonBy(wc, meId) : [];
  const myBadge = meId ? cardBadgeFor(wc, meId) : null;
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

      <LatestPulls wc={wc} />

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
            .map((w) => ({ w, card: playerCard(w.player) }))
            .sort((a, b) => b.card.overall - a.card.overall)
            .map(({ w, card }) => {
              const isBadge = myBadge?.player.id === w.player.id;
              return (
                <div key={w.matchId} className="wc-card-cell">
                  <PlayerCardView card={card} wc={wc} />
                  <button
                    type="button"
                    className={`btn btn-sm wc-badge-toggle ${isBadge ? 'is-active' : ''}`}
                    onClick={() => void setCardBadge(isBadge ? null : w.player.id)}
                    aria-pressed={isBadge}
                  >
                    {isBadge ? '★ Your badge' : '☆ Set as badge'}
                  </button>
                </div>
              );
            })}
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

/** A live feed of everyone's most recent card pulls, newest first — the social
 * home for reacting to what your mates landed. */
function LatestPulls({ wc }: { wc: WorldCupState }) {
  const meId = useWorldCupStore((s) => s.meId);
  const reactCard = useWorldCupStore((s) => s.reactCard);
  const awards = recentCardAwards(wc, 10);
  if (awards.length === 0) return null;
  return (
    <div className="card stack">
      <div className="row spread">
        <h3 style={{ margin: 0 }}>✨ Latest pulls</h3>
        <span className="muted small">React to what your mates pulled</span>
      </div>
      <ul className="wc-pulls">
        {awards.map((a) => {
          const card = playerCard(a.player);
          const team = findTeam(wc, a.player.nat);
          const reactions = cardReactionsFor(wc, a.matchId, a.predictorId);
          return (
            <li key={`${a.matchId}|${a.predictorId}`} className="wc-pull">
              <span className={`wc-badge-chip tier-${card.tier}`}>
                <span className="wc-badge-chip-ovr">{card.overall}</span>
                <span aria-hidden>{team?.flag ?? '⚽'}</span>
              </span>
              <span className="wc-pull-who">
                <strong>{a.player.name}</strong>
                <span className="muted small">
                  {' '}
                  → {findPredictor(wc, a.predictorId)?.name ?? '?'}
                </span>
              </span>
              <span className="wc-pull-react">
                {WC_CARD_REACTIONS.map((e) => {
                  const ids = reactions[e] ?? [];
                  const mine = !!meId && ids.includes(meId);
                  return (
                    <button
                      key={e}
                      type="button"
                      className={`wc-react-btn ${mine ? 'is-mine' : ''}`}
                      onClick={() => {
                        if (meId) void reactCard(a.matchId, a.predictorId, e);
                      }}
                      disabled={!meId}
                      aria-pressed={mine}
                      aria-label={`React ${e}`}
                    >
                      {e}
                      {ids.length > 0 && <span className="wc-react-n"> {ids.length}</span>}
                    </button>
                  );
                })}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A compact "flex" chip for a chosen player-card — shown by a predictor's name
 * on the leaderboard. Tier-coloured, with the overall rating + nation flag. */
export function CardBadge({ card, wc }: { card: WcPlayerCard; wc: WorldCupState }) {
  const team = findTeam(wc, card.player.nat);
  return (
    <span
      className={`wc-badge-chip tier-${card.tier}`}
      title={`${card.player.name} · ${card.overall} ${card.player.pos}`}
    >
      <span className="wc-badge-chip-ovr">{card.overall}</span>
      <span aria-hidden>{team?.flag ?? '⚽'}</span>
    </span>
  );
}
