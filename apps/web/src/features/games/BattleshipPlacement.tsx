import {
  fleetComplete,
  remainingShipLengths,
  shipCellsFrom,
  type BattleshipGame,
} from '@dap/shared';
import { useState } from 'react';
import { useRoomStore } from '../../state/roomStore.js';

export function BattleshipPlacement({
  game,
  mySeat,
  color,
}: {
  game: BattleshipGame;
  mySeat: number;
  color: string;
}) {
  const place = useRoomStore((s) => s.bsPlaceShip);
  const remove = useRoomStore((s) => s.bsRemoveShip);
  const shuffle = useRoomStore((s) => s.bsShuffle);
  const clear = useRoomStore((s) => s.bsClear);
  const ready = useRoomStore((s) => s.bsReady);

  const [orient, setOrient] = useState<'h' | 'v'>('h');
  const [hover, setHover] = useState<number | null>(null);

  const size = game.size;
  const placed = new Set((game.fleets[mySeat] ?? []).flat());
  const remaining = remainingShipLengths(game, mySeat);
  const nextLen = remaining[0] ?? null;
  const complete = fleetComplete(game, mySeat);
  const iAmReady = game.ready[mySeat] ?? false;

  const preview =
    hover != null && nextLen != null ? shipCellsFrom(hover, nextLen, orient, size) : null;
  const previewSet = new Set(preview ?? []);
  const previewValid = !!preview && preview.every((c) => !placed.has(c));

  function onCell(i: number) {
    if (iAmReady) return;
    if (placed.has(i)) {
      void remove(game.id, i);
      return;
    }
    if (nextLen == null) return;
    const cells = shipCellsFrom(i, nextLen, orient, size);
    if (cells && cells.every((c) => !placed.has(c))) void place(game.id, cells);
  }

  if (iAmReady) {
    return (
      <div className="stack" style={{ gap: '0.6rem', alignItems: 'center' }}>
        <div className="game-status">Waiting for your opponent to be ready…</div>
        <button className="btn btn-ghost btn-sm" onClick={() => void clear(game.id)} disabled>
          Ready ✓
        </button>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: '0.75rem', alignItems: 'center' }}>
      <div className="game-status">
        {complete ? 'Fleet ready — hit Ready!' : `Place your ${nextLen}-cell ship`}
      </div>

      <div className="row row-wrap" style={{ gap: '0.4rem', justifyContent: 'center' }}>
        <button
          className="btn btn-sm"
          onClick={() => setOrient((o) => (o === 'h' ? 'v' : 'h'))}
          title="Rotate (or press to toggle)"
        >
          {orient === 'h' ? '↔ Horizontal' : '↕ Vertical'}
        </button>
        <button className="btn btn-sm" onClick={() => void shuffle(game.id)}>
          🎲 Shuffle
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => void clear(game.id)}>
          Clear
        </button>
        <button
          className="btn btn-sm btn-primary"
          disabled={!complete}
          onClick={() => void ready(game.id)}
        >
          Ready
        </button>
      </div>

      <div
        className="reversi-board"
        aria-label="Your fleet"
        style={{
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          background: '#0e3a5e',
          width: 'min(100%, 320px)',
        }}
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: size * size }, (_, i) => {
          const isPlaced = placed.has(i);
          const inPreview = previewSet.has(i);
          let bg = '#1f6699';
          if (isPlaced) bg = color;
          else if (inPreview) bg = previewValid ? 'rgba(34,197,94,0.7)' : 'rgba(220,38,38,0.7)';
          return (
            <button
              key={i}
              type="button"
              className="reversi-cell"
              style={{ background: bg }}
              aria-label={isPlaced ? `Remove ship at ${i + 1}` : `Place at ${i + 1}`}
              onMouseEnter={() => setHover(i)}
              onClick={() => onCell(i)}
            />
          );
        })}
      </div>

      <p className="muted small" style={{ margin: 0, textAlign: 'center' }}>
        Tap to place each ship; tap a ship to remove it. {remaining.length} ship
        {remaining.length === 1 ? '' : 's'} left.
      </p>
    </div>
  );
}
