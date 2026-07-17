import type { ClubLeagueState } from '@dap/shared';
import { useState } from 'react';
import { useClubLeagueStore } from '../../state/clubLeagueStore.js';
import { hasSession } from '../worldcup/wcAuthClient.js';

/** Pick who you are — every player shown as a one-tap chip. A claimed name (its
 * owner locked it with their email) shows 🔒 until you log in as them. */
export function IdentityBar({
  club,
  onClaim,
}: {
  club: ClubLeagueState;
  onClaim: (id: string) => void;
}) {
  const meId = useClubLeagueStore((s) => s.meId);
  const select = useClubLeagueStore((s) => s.selectPredictor);
  const addName = useClubLeagueStore((s) => s.addName);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const mine = club.predictors.find((p) => p.id === meId);

  const pick = (id: string, claimed: boolean) => {
    // Choosing a claimed name you haven't unlocked on this device opens the login.
    if (claimed && !hasSession(id)) {
      onClaim(id);
      return;
    }
    select(id);
  };

  return (
    <div className="club-identity">
      <span className="muted small">You are:</span>
      <div className="club-name-chips">
        {club.predictors.map((p) => {
          const isMe = p.id === meId;
          const locked = !!p.claimed && !hasSession(p.id);
          return (
            <button
              key={p.id}
              type="button"
              className={`club-name-chip ${isMe ? 'is-me' : ''}`}
              aria-pressed={isMe}
              onClick={() => pick(p.id, !!p.claimed)}
              title={
                p.claimed
                  ? isMe
                    ? `Logged in as ${p.name}`
                    : `${p.name} is locked — tap to log in`
                  : `Play as ${p.name}`
              }
            >
              {locked ? '🔒 ' : isMe ? '✓ ' : ''}
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
      {mine && (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => onClaim(mine.id)}
          title="Protect your name with your email so only you can edit your picks"
        >
          {mine.claimed && hasSession(mine.id)
            ? '🔓 Account'
            : mine.claimed
              ? '🔒 Log in'
              : '🔒 Lock my name'}
        </button>
      )}
    </div>
  );
}
