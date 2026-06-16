import { type WorldCupState } from '@dap/shared';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useToast } from '../../components/Toast.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { Avatar } from './Avatar.js';

/** Pick who you are. The owner can add more names; you can set a profile photo. */
export function PredictorBar({ wc }: { wc: WorldCupState }) {
  const meId = useWorldCupStore((s) => s.meId);
  const admin = useWorldCupStore((s) => s.admin);
  const { selectPredictor, addName, removeName, setAvatar } = useWorldCupStore();
  const { show } = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await addName(trimmed);
    const err = useWorldCupStore.getState().error;
    if (err) {
      show(err);
    } else {
      setName('');
      setAdding(false);
    }
  }

  async function onPickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await setAvatar(file);
      const err = useWorldCupStore.getState().error;
      show(err ?? 'Profile photo updated ✓');
    } catch {
      show('Could not upload that photo.');
    }
  }

  return (
    <div className="wc-predictor-bar">
      <span className="wc-predictor-label">You are</span>
      <div className="wc-predictor-chips">
        {wc.predictors.map((p) => (
          <span key={p.id} className="wc-predictor-wrap">
            <button
              type="button"
              className={`wc-predictor-chip ${p.id === meId ? 'selected' : ''}`}
              onClick={() => selectPredictor(p.id)}
              aria-pressed={p.id === meId}
            >
              <Avatar predictor={p} size={20} />
              <span>{p.name}</span>
            </button>
            {admin && wc.predictors.length > 1 && (
              <button
                type="button"
                className="wc-predictor-x"
                title={`Remove ${p.name} and their predictions`}
                aria-label={`Remove ${p.name}`}
                onClick={() => {
                  if (confirm(`Remove ${p.name} and all their predictions?`)) void removeName(p.id);
                }}
              >
                ×
              </button>
            )}
          </span>
        ))}

        {adding ? (
          <form className="wc-add-form" onSubmit={submit}>
            <input
              className="input wc-add-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New name"
              aria-label="New predictor name"
              autoFocus
              maxLength={24}
            />
            <button className="btn btn-sm btn-primary" type="submit" disabled={!name.trim()}>
              Add
            </button>
            <button
              className="btn btn-sm btn-ghost"
              type="button"
              onClick={() => {
                setAdding(false);
                setName('');
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="wc-predictor-chip wc-add-chip"
            onClick={() => setAdding(true)}
          >
            + Add name
          </button>
        )}
      </div>

      {meId && (
        <button
          type="button"
          className="btn btn-sm btn-ghost wc-photo-btn"
          onClick={() => fileRef.current?.click()}
          title="Set your profile photo"
        >
          📷 Photo
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void onPickPhoto(e)}
          />
        </button>
      )}
    </div>
  );
}
