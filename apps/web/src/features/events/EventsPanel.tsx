import { formatSlot, toGoogleEvent, type PlannedEvent } from '@dap/shared';
import { useState, type FormEvent } from 'react';
import { useToast } from '../../components/Toast.js';
import { insertCalendarEvent } from '../../lib/google/calendar.js';
import { isGoogleConfigured } from '../../lib/google/config.js';
import { useGoogleStore } from '../../state/googleStore.js';
import { useRoomStore } from '../../state/roomStore.js';
import { defaultStartLocal, localInputToISO } from '../../lib/datetime.js';
import { downloadICS } from '../../lib/ics.js';
import { GoogleCalendarCard } from '../calendar/GoogleCalendarCard.js';

export function EventsPanel() {
  const events = useRoomStore((s) => s.state!.events);
  const { addEvent, deleteEvent } = useRoomStore();
  const [adding, setAdding] = useState(false);

  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));

  return (
    <div className="stack">
      <GoogleCalendarCard />

      <div className="row spread">
        <h2 className="card-title" style={{ margin: 0 }}>
          The plan
        </h2>
        <button className="btn btn-primary" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Close' : '+ Add event'}
        </button>
      </div>

      {adding && (
        <AddEventForm
          onAdd={async (input) => {
            await addEvent(input);
            setAdding(false);
          }}
        />
      )}

      {sorted.length === 0 && !adding ? (
        <div className="empty">
          Nothing locked in yet. Decide a poll and “Add to plan”, or add an event manually 🗓️
        </div>
      ) : (
        <div className="stack">
          {sorted.map((event) => (
            <EventCard key={event.id} event={event} onDelete={() => deleteEvent(event.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function AddEventForm({
  onAdd,
}: {
  onAdd: (input: {
    title: string;
    start: string;
    end: string;
    location?: string;
    description?: string;
  }) => void;
}) {
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(defaultStartLocal(1, 18));
  const [end, setEnd] = useState(defaultStartLocal(1, 20));
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError('Add a title');
    const startISO = localInputToISO(start);
    const endISO = localInputToISO(end);
    if (new Date(endISO) <= new Date(startISO)) return setError('End must be after start');
    onAdd({
      title,
      start: startISO,
      end: endISO,
      location: location || undefined,
      description: description || undefined,
    });
  }

  return (
    <form className="card stack" onSubmit={submit} aria-label="Add event">
      <label className="field">
        Title
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </label>
      <div className="row row-wrap">
        <label className="field grow">
          Starts
          <input
            className="input"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="field grow">
          Ends
          <input
            className="input"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>
      <label className="field">
        Location <span className="muted small">(optional)</span>
        <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
      </label>
      <label className="field">
        Notes <span className="muted small">(optional)</span>
        <textarea
          className="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      {error && <div className="banner banner-danger">{error}</div>}
      <button className="btn btn-primary" type="submit">
        Add to plan
      </button>
    </form>
  );
}

function EventCard({ event, onDelete }: { event: PlannedEvent; onDelete: () => void }) {
  const email = useGoogleStore((s) => s.email);
  const getToken = useGoogleStore((s) => s.token);
  const attachGoogleId = useRoomStore((s) => s.attachGoogleId);
  const { show } = useToast();
  const [pushing, setPushing] = useState(false);

  const canPush = isGoogleConfigured() && email && !event.googleEventId;

  async function pushToGoogle() {
    setPushing(true);
    try {
      const token = await getToken();
      const { id } = await insertCalendarEvent(token, toGoogleEvent(event));
      await attachGoogleId(event.id, id);
      show('Added to your Google Calendar 📅');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not add to Google Calendar');
    } finally {
      setPushing(false);
    }
  }

  return (
    <div className="card row spread row-wrap" style={{ gap: '0.75rem' }}>
      <div>
        <div className="row" style={{ gap: '0.5rem' }}>
          <strong>{event.title}</strong>
          {event.googleEventId && <span className="badge badge-success">📅 in Google</span>}
        </div>
        <div className="muted small">{formatSlot(event.start, event.end)}</div>
        {event.location && <div className="small">📍 {event.location}</div>}
        {event.description && <div className="muted small">{event.description}</div>}
      </div>
      <div className="row">
        {canPush && (
          <button className="btn btn-sm" onClick={pushToGoogle} disabled={pushing}>
            {pushing ? 'Adding…' : '📅 Add to Google'}
          </button>
        )}
        <button className="btn btn-sm" onClick={() => downloadICS(event)} title="Download .ics">
          ⬇ .ics
        </button>
        <button className="btn btn-sm btn-danger" onClick={onDelete}>
          Remove
        </button>
      </div>
    </div>
  );
}
