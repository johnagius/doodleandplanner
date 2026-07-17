import type { ClubLeagueState } from '@dap/shared';
import { useState } from 'react';
import { useClubLeagueStore } from '../../state/clubLeagueStore.js';

/** Pick who you are (persisted on this device) so your picks are attributed. */
export function IdentityBar({ club }: { club: ClubLeagueState }) {
  const meId = useClubLeagueStore((s) => s.meId);
  const select = useClubLeagueStore((s) => s.selectPredictor);
  const addName = useClubLeagueStore((s) => s.addName);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const me = club.predictors.find((p) => p.id === meId);

  return (
    <div className="club-identity">
      <span className="muted small">You are:</span>
      <select
        className="select club-identity-select"
        value={meId ?? ''}
        onChange={(e) => select(e.target.value || null)}
      >
        <option value="">— pick your name —</option>
        {club.predictors.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
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
          />
          <button type="submit" className="btn btn-sm btn-primary">
            Add
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAdding(false)}>
            ✕
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAdding(true)}>
          + Add name
        </button>
      )}
      {me && <span className="badge badge-success">Predicting as {me.name}</span>}
    </div>
  );
}
