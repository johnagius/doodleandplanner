import {
  WC_ARCADE_GAMES,
  arcadeBest,
  arcadeLeaderboard,
  type WcArcadeGame,
  type WorldCupState,
} from '@dap/shared';
import { useState } from 'react';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { ARCADE_CONFIGS, ShotGame } from './arcade/ShotGame.js';

const MEDALS = ['🥇', '🥈', '🥉'];

/** The arcade hub: three time-killer mini-games with synced, room-wide high
 * scores (kept entirely separate from the prediction points). */
export function ArcadeView({ wc }: { wc: WorldCupState }) {
  const meId = useWorldCupStore((s) => s.meId);
  const [active, setActive] = useState<WcArcadeGame | null>(null);

  if (active) {
    return (
      <div className="stack">
        <ShotGame config={ARCADE_CONFIGS[active]} onExit={() => setActive(null)} />
        <ArcadeBoard wc={wc} game={active} meId={meId} />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card stack">
        <h3 style={{ margin: 0 }}>🎮 Arcade</h3>
        <p className="muted small" style={{ margin: 0 }}>
          Quick games for killing time before kickoff. Best scores are saved per player and shared
          with the room — they don’t touch your prediction points.
        </p>
        {!meId && <div className="banner">Pick your name above to save your scores.</div>}
      </div>

      <div className="wc-arcade-grid">
        {WC_ARCADE_GAMES.map((g) => {
          const top = arcadeLeaderboard(wc, g.key)[0];
          const mine = arcadeBest(wc, g.key, meId);
          return (
            <button
              key={g.key}
              type="button"
              className="card wc-arcade-card"
              onClick={() => setActive(g.key)}
            >
              <span className="wc-arcade-emoji" aria-hidden>
                {g.emoji}
              </span>
              <span className="wc-arcade-name">{g.name}</span>
              <span className="muted small wc-arcade-tag">{g.tagline}</span>
              <span className="wc-arcade-stats small">
                <span>🏆 {top ? `${top.name} · ${top.best}` : '—'}</span>
                <span>You: {mine || 0}</span>
              </span>
              <span className="wc-arcade-play">Play →</span>
            </button>
          );
        })}
      </div>

      {WC_ARCADE_GAMES.map((g) => (
        <ArcadeBoard key={g.key} wc={wc} game={g.key} meId={meId} />
      ))}
    </div>
  );
}

function ArcadeBoard({
  wc,
  game,
  meId,
}: {
  wc: WorldCupState;
  game: WcArcadeGame;
  meId: string | null;
}) {
  const meta = WC_ARCADE_GAMES.find((g) => g.key === game)!;
  const lb = arcadeLeaderboard(wc, game);
  if (lb.length === 0) return null;
  return (
    <div className="card stack">
      <h4 style={{ margin: 0 }}>
        {meta.emoji} {meta.name} — high scores
      </h4>
      <ol className="wc-arcade-board">
        {lb.slice(0, 8).map((r, i) => (
          <li key={r.predictorId} className={r.predictorId === meId ? 'is-me' : ''}>
            <span className="wc-arcade-rank">{MEDALS[i] ?? `${i + 1}`}</span>
            <span className="wc-arcade-bname">{r.name}</span>
            <span className="wc-arcade-best">{r.best}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
