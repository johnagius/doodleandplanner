import type { ClubLeagueState } from '@dap/shared';
import { useState } from 'react';
import { useClubLeagueStore } from '../../state/clubLeagueStore.js';

/** Pick who you are — every player shown as a one-tap chip. */
export function IdentityBar({ club }: { club: ClubLeagueState }) {
  const meId = useClubLeagueStore((s) => s.meId);
  const select = useClubLeagueStore((s) => s.selectPredictor);
  const addName = useClubLeagueStore((s) => s.addName);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  return (
    <div className="club-identity">
      <span className="muted small">You are:</span>
      <div className="club-name-chips">
        {club.predictors.map((p) => {
          const isMe = p.id === meId;
          return (
            <button
              key={p.id}
              type="button"
              className={`club-name-chip ${isMe ? 'is-me' : ''}`}
              aria-pressed={isMe}
              onClick={() => select(p.id)}
              title={`Play as ${p.name}`}
            >
              {isMe ? '✓ ' : ''}
              {p.name}
            </button>
          );
        })}
        {adding ? (
          <form
            className="row"
            style={{ gap: '0.3rem' }}
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) {
                void addName(name.trim());
                setName('');
                setAdding(false);
              }
            }}
          >
            <input
              className="input"
              autoFocus
              placeholder="New name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ maxWidth: '9rem' }}
            />
            <button type="submit" className="btn btn-sm btn-primary">
              Add
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAdding(false)}>
              ✕
            </button>
          </form>
        ) : (
          <button type="button" className="club-name-chip is-add" onClick={() => setAdding(true)}>
            + Add
          </button>
        )}
      </div>
    </div>
  );
}
