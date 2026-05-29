import { suggestSlots } from '@dap/shared';
import { useState, type FormEvent } from 'react';
import { useToast } from '../../components/Toast.js';
import { defaultStartLocal, isoToLocalInput, optionsFromLocal } from '../../lib/datetime.js';
import { getBusyWithEvents } from '../../lib/google/calendar.js';
import { isGoogleConfigured } from '../../lib/google/config.js';
import { useGoogleStore } from '../../state/googleStore.js';
import { useRoomStore } from '../../state/roomStore.js';

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function CreatePollForm({ onDone }: { onDone: () => void }) {
  const room = useRoomStore((s) => s.state!.room);
  const defaultDuration = room.settings.defaultSlotMinutes;
  const addPoll = useRoomStore((s) => s.addPoll);
  const { email, token } = useGoogleStore();
  const { show } = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [allowMaybe, setAllowMaybe] = useState(true);
  const [duration, setDuration] = useState(defaultDuration);
  const [options, setOptions] = useState<string[]>([defaultStartLocal(1), defaultStartLocal(2)]);
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const canSuggest = isGoogleConfigured() && !!email;

  function setOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }
  function addOptionRow() {
    setOptions((prev) => [...prev, defaultStartLocal(prev.length + 1)]);
  }
  function removeOptionRow(i: number) {
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function suggestFreeTimes() {
    setSuggesting(true);
    setError(null);
    try {
      const accessToken = await token();
      const now = new Date();
      const windowStart = now.toISOString();
      const windowEnd = addDays(now, 10).toISOString();
      const busy = await getBusyWithEvents(accessToken, windowStart, windowEnd);
      const suggestions = suggestSlots({
        windowStart,
        windowEnd,
        durationMinutes: duration,
        stepMinutes: 30,
        workingHours: room.settings.workingHours,
        hourOf: (d) => d.getHours(),
        members: [{ memberId: 'me', busy }],
        minFree: 1,
        limit: 5,
      });
      if (suggestions.length === 0) {
        show('No free slots found in the next 10 days');
        return;
      }
      setOptions(suggestions.map((s) => isoToLocalInput(s.option.start)));
      show(`Filled in ${suggestions.length} times you’re free ✨`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calendar lookup failed');
    } finally {
      setSuggesting(false);
    }
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
        <div className="row spread row-wrap">
          <strong className="small">Time options</strong>
          {canSuggest && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={suggestFreeTimes}
              disabled={suggesting}
            >
              {suggesting ? 'Checking…' : '✨ Suggest free times'}
            </button>
          )}
        </div>
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
