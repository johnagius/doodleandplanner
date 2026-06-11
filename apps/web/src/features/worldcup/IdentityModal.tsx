import { type WorldCupState } from '@dap/shared';
import { useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal.js';
import { useToast } from '../../components/Toast.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';

/**
 * First-run "who are you?" prompt: pick a name, confirm it's you, and it's
 * remembered on this device. Shown until a predictor is chosen.
 */
export function IdentityModal({
  open,
  onClose,
  wc,
}: {
  open: boolean;
  onClose: () => void;
  wc: WorldCupState;
}) {
  const { selectPredictor, addName } = useWorldCupStore();
  const { show } = useToast();
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  function close() {
    setPending(null);
    setAdding(false);
    setName('');
    onClose();
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await addName(trimmed); // auto-selects the new predictor → modal closes
    const err = useWorldCupStore.getState().error;
    if (err) show(err);
  }

  return (
    <Modal open={open} onClose={close} title={pending ? 'Just checking…' : "Who's predicting?"}>
      {pending ? (
        <div className="stack wc-identity">
          <p className="muted" style={{ margin: 0 }}>
            Are you <strong>{pending.name}</strong>?
          </p>
          <div className="row" style={{ gap: '0.5rem' }}>
            <button className="btn btn-primary" onClick={() => selectPredictor(pending.id)}>
              Yes, this is me
            </button>
            <button className="btn btn-ghost" onClick={() => setPending(null)}>
              No, go back
            </button>
          </div>
        </div>
      ) : (
        <div className="stack wc-identity">
          <p className="muted" style={{ margin: 0 }}>
            Tap your name to start predicting — we’ll remember it on this device.
          </p>
          <div className="wc-identity-grid">
            {wc.predictors.map((p) => (
              <button
                key={p.id}
                type="button"
                className="wc-identity-name"
                onClick={() => setPending({ id: p.id, name: p.name })}
              >
                {p.name}
              </button>
            ))}
          </div>
          {adding ? (
            <form className="row" style={{ gap: '0.4rem' }} onSubmit={add}>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                aria-label="Your name"
                autoFocus
                maxLength={24}
              />
              <button className="btn btn-primary" type="submit" disabled={!name.trim()}>
                Add
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => setAdding(true)}
            >
              + Add your name
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
