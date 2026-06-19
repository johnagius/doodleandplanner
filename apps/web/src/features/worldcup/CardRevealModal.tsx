import { playerCard, type WcWonCard, type WorldCupState } from '@dap/shared';
import { Modal } from '../../components/Modal.js';
import { PlayerCardView } from './CardsView.js';

/**
 * Pack-opening reveal: the instant the current player newly tops a match's
 * points and pulls a card, it flips in here with a shine before joining their
 * collection. Purely celebratory — the cards stay derived from results; this
 * just turns a silent grid update into a moment.
 */
export function CardRevealModal({
  cards,
  wc,
  onClose,
}: {
  cards: WcWonCard[];
  wc: WorldCupState;
  onClose: () => void;
}) {
  if (cards.length === 0) return null;
  const many = cards.length > 1;
  return (
    <Modal open onClose={onClose} title={many ? `🃏 ${cards.length} new cards!` : '🃏 New card!'}>
      <div className="wc-card-reveal stack">
        <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>
          You topped the points — {many ? 'these players drop' : 'this player drops'} into your
          collection.
        </p>
        <div className="wc-card-grid wc-card-reveal-grid">
          {cards.map((w) => (
            <div key={`${w.matchId}|${w.player.id}`} className="wc-card-reveal-item">
              <PlayerCardView card={playerCard(w.player)} wc={wc} />
            </div>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Add to collection ✨
          </button>
        </div>
      </div>
    </Modal>
  );
}
