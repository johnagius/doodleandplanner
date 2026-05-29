import { useState, type FormEvent } from 'react';
import { defaultStartLocal, optionsFromLocal } from '../../lib/datetime.js';
import { useRoomStore } from '../../state/roomStore.js';

export function CreatePollForm({ onDone }: { onDone: () => void }) {
  const defaultDuration = useRoomStore((s) => s.state!.room.settings.defaultSlotMinutes);
  const addPoll = useRoomStore((s) => s.addPoll);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [allowMaybe, setAllowMaybe] = useState(true);
  const [duration, setDuration] = useState(defaultDuration);
  const [options, setOptions] = useState<string[]>([defaultStartLocal(1), defaultStartLocal(2)]);
  const [error, setError] = useState<string | null>(null);

  function setOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }
  function addOptionRow() {
    setOptions((prev) => [...prev, defaultStartLocal(prev.length + 1)]);
  }
  function removeOptionRow(i: number) {
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const built = optionsFromLocal(options, duration);
    if (!title.trim()) return setError('Give your poll a title');
    if (built.length === 0) return setError('Add at least one time option');
    await addPoll({ title, description: description || undefined, options: built, allowMaybe });
    onDone();
  }

  return (
    <form className="card stack" onSubmit={submit} aria-label="Create poll">
      <label className="field">
        Poll title
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="When shall we meet?"
          autoFocus
        />
      </label>
      <label className="field">
        Description <span className="muted small">(optional)</span>
        <input
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <div className="row row-wrap" style={{ gap: '1rem' }}>
        <label className="field">
          Slot length
          <select
            className="select"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            <option value={30}>30 min</option>
            <option value={60}>1 hour</option>
            <option value={90}>1.5 hours</option>
            <option value={120}>2 hours</option>
            <option value={180}>3 hours</option>
            <option value={240}>Half day</option>
          </select>
        </label>
        <label className="row" style={{ gap: '0.4rem', alignSelf: 'flex-end' }}>
          <input
            type="checkbox"
            checked={allowMaybe}
            onChange={(e) => setAllowMaybe(e.target.checked)}
          />
          Allow “maybe” votes
        </label>
      </div>

      <div className="stack" style={{ gap: '0.5rem' }}>
        <strong className="small">Time options</strong>
        {options.map((opt, i) => (
          <div className="row" key={i}>
            <input
              className="input grow"
              type="datetime-local"
              value={opt}
              onChange={(e) => setOption(i, e.target.value)}
              aria-label={`Option ${i + 1}`}
            />
            {options.length > 1 && (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => removeOptionRow(i)}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-sm" onClick={addOptionRow}>
          + Add another time
        </button>
      </div>

      {error && <div className="banner banner-danger">{error}</div>}
      <div className="row spread">
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Create poll
        </button>
      </div>
    </form>
  );
}
