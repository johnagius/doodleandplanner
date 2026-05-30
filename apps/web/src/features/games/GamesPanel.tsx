import { GAME_CATALOG, gameMeta, type GameType } from '@dap/shared';
import { useState } from 'react';
import { useRoomStore } from '../../state/roomStore.js';
import { GameView } from './GameView.js';

export function GamesPanel() {
  const state = useRoomStore((s) => s.state)!;
  const meId = useRoomStore((s) => s.meId);
  const createGame = useRoomStore((s) => s.createGame);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const games = [...(state.games ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const selected = games.find((g) => g.id === selectedId);

  async function start(type: GameType) {
    const id = await createGame(type);
    if (id) setSelectedId(id);
  }

  if (selected) {
    return <GameView game={selected} onBack={() => setSelectedId(null)} />;
  }

  if (!meId) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Join the room to play games with everyone.
        </p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <div className="card stack" style={{ gap: '0.75rem' }}>
        <h3 style={{ margin: 0 }}>🎮 Start a game</h3>
        <div className="game-catalog">
          {GAME_CATALOG.map((g) => (
            <button key={g.type} className="game-pick" onClick={() => void start(g.type)}>
              <span className="game-pick-icon" aria-hidden>
                {g.icon}
              </span>
              <span className="game-pick-name">{g.name}</span>
              <span className="muted small">{g.blurb}</span>
              <span className="badge">
                {g.minPlayers === g.maxPlayers
                  ? `${g.minPlayers} players`
                  : `${g.minPlayers}–${g.maxPlayers} players`}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="stack" style={{ gap: '0.6rem' }}>
        <h3 style={{ margin: 0 }}>Active games</h3>
        {games.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              No games yet. Start one above and invite the room to join!
            </p>
          </div>
        ) : (
          <div className="game-list">
            {games.map((g) => {
              const meta = gameMeta(g.type);
              const mine = g.seats.some((s) => s.memberId === meId);
              const label =
                g.status === 'lobby'
                  ? `Lobby · ${g.seats.length}/${meta.maxPlayers}`
                  : g.status === 'playing'
                    ? 'In progress'
                    : 'Finished';
              return (
                <button key={g.id} className="game-list-item" onClick={() => setSelectedId(g.id)}>
                  <span className="game-pick-icon" aria-hidden>
                    {meta.icon}
                  </span>
                  <span className="stack" style={{ gap: 2, minWidth: 0, alignItems: 'flex-start' }}>
                    <span style={{ fontWeight: 700 }}>{meta.name}</span>
                    <span className="muted small">
                      {label}
                      {mine ? ' · you’re in' : ''}
                    </span>
                  </span>
                  <span className="badge badge-primary">
                    {g.status === 'lobby' ? 'Open' : g.status === 'playing' ? 'Play' : 'View'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
