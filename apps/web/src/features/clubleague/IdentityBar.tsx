import type { ClubLeagueState } from '@dap/shared';
import { useState } from 'react';
import { useClubLeagueStore } from '../../state/clubLeagueStore.js';
import { hasSession } from '../worldcup/wcAuthClient.js';

/** Pick who you are — every player shown as a one-tap chip. Once you log in as a
 * claimed name on this device, the device is **bound to you**: the other players
 * grey out so nobody can peek at their picks or account. Log out to switch. */
export function IdentityBar({
  club,
  onClaim,
}: {
  club: ClubLeagueState;
  onClaim: (id: string) => void;
}) {
  const meId = useClubLeagueStore((s) => s.meId);
  const select = useClubLeagueStore((s) => s.selectPredictor);
  const logout = useClubLeagueStore((s) => s.logout);
  const addName = useClubLeagueStore((s) => s.addName);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const mine = club.predictors.find((p) => p.id === meId);

  // "Logged in" = the selected name is claimed and this device holds its session.
  // While logged in the device is private to that one player.
  const lockedIn = !!mine?.claimed && hasSession(mine.id);

  const pick = (id: string, claimed: boolean) => {
    if (lockedIn) return; // bound to one player — must log out to switch
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
          // When logged in, everyone who isn't me is locked away on this device.
          const disabled = lockedIn && !isMe;
          const locked = disabled || (!!p.claimed && !hasSession(p.id));
          return (
            <button
              key={p.id}
              type="button"
              className={`club-name-chip ${isMe ? 'is-me' : ''} ${disabled ? 'is-disabled' : ''}`}
              aria-pressed={isMe}
              disabled={disabled}
              onClick={() => pick(p.id, !!p.claimed)}
              title={
                disabled
                  ? `${p.name} can only be used on their own device`
                  : p.claimed
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
        {!lockedIn &&
          (adding ? (
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
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setAdding(false)}
              >
                ✕
              </button>
            </form>
          ) : (
            <button type="button" className="club-name-chip is-add" onClick={() => setAdding(true)}>
              + Add
            </button>
          ))}
      </div>

      {lockedIn ? (
        <div className="row" style={{ gap: '0.4rem', alignItems: 'center' }}>
          <span className="badge badge-success" title="Private to you on this device">
            🔒 Private to you
          </span>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              if (
                window.confirm(
                  'Log out of this device? You’ll need your email code to log back in.',
                )
              ) {
                logout();
              }
            }}
          >
            Log out
          </button>
        </div>
      ) : (
        mine && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => onClaim(mine.id)}
            title="Protect your name with your email so only you can edit your picks"
          >
            {mine.claimed ? '🔒 Log in' : '🔒 Lock my name'}
          </button>
        )
      )}
    </div>
  );
}
