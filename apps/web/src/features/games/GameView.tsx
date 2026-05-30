import {
  findMember,
  gameMeta,
  gameStatusText,
  isMyTurn,
  seatOf,
  type GameSession,
  type Member,
} from '@dap/shared';
import { Avatar } from '../../components/Avatar.js';
import { useRoomStore } from '../../state/roomStore.js';
import { Connect4Board, DotsBoard, ReversiBoard, TicTacToeBoard } from './boards.js';

export function GameView({ game, onBack }: { game: GameSession; onBack: () => void }) {
  const room = useRoomStore((s) => s.state)!.room;
  const meId = useRoomStore((s) => s.meId);
  const joinGame = useRoomStore((s) => s.joinGame);
  const leaveGame = useRoomStore((s) => s.leaveGame);
  const startGame = useRoomStore((s) => s.startGame);
  const playMove = useRoomStore((s) => s.playMove);
  const rematchGame = useRoomStore((s) => s.rematchGame);
  const deleteGame = useRoomStore((s) => s.deleteGame);

  const meta = gameMeta(game.type);
  const memberFor = (seat: number): Member | undefined => {
    const s = game.seats.find((x) => x.seat === seat);
    return s ? findMember(room, s.memberId) : undefined;
  };
  const nameOf = (memberId: string) => findMember(room, memberId)?.name ?? 'Someone';

  const mySeat = meId ? seatOf(game, meId) : -1;
  const seated = mySeat >= 0;
  const myTurn = !!meId && isMyTurn(game, meId);
  const canMove = myTurn;

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <div className="row spread row-wrap" style={{ gap: '0.5rem' }}>
        <button className="btn btn-sm btn-ghost" onClick={onBack}>
          ← All games
        </button>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => {
            if (confirm('Delete this game for everyone?')) {
              void deleteGame(game.id);
              onBack();
            }
          }}
        >
          Delete
        </button>
      </div>

      <div className="card stack" style={{ gap: '0.85rem', alignItems: 'center' }}>
        <div className="row" style={{ gap: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem' }} aria-hidden>
            {meta.icon}
          </span>
          <h3 style={{ margin: 0 }}>{meta.name}</h3>
        </div>

        <div className={`game-status ${game.status === 'playing' && myTurn ? 'your-turn' : ''}`}>
          {gameStatusText(game, nameOf)}
          {game.status === 'playing' && myTurn && ' — your move!'}
        </div>

        {/* Seats / scoreboard */}
        <div className="row row-wrap" style={{ gap: '0.6rem', justifyContent: 'center' }}>
          {game.seats.map((s) => {
            const m = findMember(room, s.memberId);
            const isTurn = game.status === 'playing' && game.turn === s.seat;
            const score =
              game.type === 'dots'
                ? (game.scores[s.seat] ?? 0)
                : game.type === 'reversi'
                  ? game.cells.filter((c) => c === s.seat).length
                  : undefined;
            return (
              <div key={s.seat} className={`game-seat ${isTurn ? 'active' : ''}`}>
                {m && <Avatar member={m} size={26} />}
                <span className="small">{m?.name ?? 'Player'}</span>
                {score !== undefined && <span className="badge badge-primary">{score}</span>}
              </div>
            );
          })}
        </div>

        {/* Board */}
        {game.status !== 'lobby' && (
          <div className="game-board-wrap">
            {game.type === 'tictactoe' && (
              <TicTacToeBoard
                game={game}
                canMove={canMove}
                memberFor={memberFor}
                onCell={(index) => void playMove(game.id, { kind: 'cell', index })}
              />
            )}
            {game.type === 'connect4' && (
              <Connect4Board
                game={game}
                canMove={canMove}
                memberFor={memberFor}
                onDrop={(col) => void playMove(game.id, { kind: 'drop', col })}
              />
            )}
            {game.type === 'reversi' && (
              <ReversiBoard
                game={game}
                canMove={canMove}
                memberFor={memberFor}
                onCell={(index) => void playMove(game.id, { kind: 'cell', index })}
              />
            )}
            {game.type === 'dots' && (
              <DotsBoard
                game={game}
                canMove={canMove}
                memberFor={memberFor}
                onEdge={(orient, index) => void playMove(game.id, { kind: 'edge', orient, index })}
              />
            )}
          </div>
        )}

        {/* Controls */}
        <div className="row row-wrap" style={{ gap: '0.5rem', justifyContent: 'center' }}>
          {game.status === 'lobby' && !seated && game.seats.length < meta.maxPlayers && (
            <button className="btn btn-primary" onClick={() => void joinGame(game.id)}>
              Take a seat
            </button>
          )}
          {game.status === 'lobby' && seated && (
            <button className="btn btn-ghost" onClick={() => void leaveGame(game.id)}>
              Leave
            </button>
          )}
          {game.status === 'lobby' && seated && game.seats.length >= meta.minPlayers && (
            <button className="btn btn-primary" onClick={() => void startGame(game.id)}>
              Start game
            </button>
          )}
          {game.status === 'finished' && (
            <button className="btn btn-primary" onClick={() => void rematchGame(game.id)}>
              Rematch
            </button>
          )}
        </div>

        {game.status === 'lobby' && game.seats.length < meta.minPlayers && (
          <p className="muted small" style={{ margin: 0 }}>
            Need at least {meta.minPlayers} players to start. Share the room link to get friends in!
          </p>
        )}
      </div>
    </div>
  );
}
