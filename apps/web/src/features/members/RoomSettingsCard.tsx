import { useState, type FormEvent } from 'react';
import { useToast } from '../../components/Toast.js';
import { useRoomStore } from '../../state/roomStore.js';

const DURATIONS = [30, 60, 90, 120, 180, 240];

/** Owner-only room settings: name, description, default slot length, working
 * hours (which feed the smart slot finder), and open-join. */
export function RoomSettingsCard() {
  const room = useRoomStore((s) => s.state!.room);
  const meId = useRoomStore((s) => s.meId)!;
  const updateRoom = useRoomStore((s) => s.updateRoom);
  const { show } = useToast();

  const isOwner = room.createdBy === meId;

  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description ?? '');
  const [slot, setSlot] = useState(room.settings.defaultSlotMinutes);
  const [startHour, setStartHour] = useState(room.settings.workingHours.startHour);
  const [endHour, setEndHour] = useState(room.settings.workingHours.endHour);
  const [openJoin, setOpenJoin] = useState(room.settings.openJoin);
  const [error, setError] = useState<string | null>(null);

  if (!isOwner) return null;

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Room name is required');
    if (endHour <= startHour) return setError('End hour must be after start hour');
    await updateRoom({
      name,
      description,
      settings: {
        defaultSlotMinutes: slot,
        workingHours: { startHour, endHour },
        openJoin,
      },
    });
    show('Room settings saved ✓');
  }

  return (
    <form className="card stack" onSubmit={save} aria-label="Room settings">
      <h3 className="card-title">⚙️ Room settings</h3>
      <label className="field">
        Room name
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
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
          Default slot length
          <select
            className="select"
            value={slot}
            onChange={(e) => setSlot(Number(e.target.value))}
            aria-label="Default slot length"
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d >= 60 ? `${d / 60}h` : `${d}m`}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Earliest hour
          <input
            className="input"
            type="number"
            min={0}
            max={23}
            value={startHour}
            onChange={(e) => setStartHour(Number(e.target.value))}
            aria-label="Earliest hour"
            style={{ width: 90 }}
          />
        </label>
        <label className="field">
          Latest hour
          <input
            className="input"
            type="number"
            min={1}
            max={24}
            value={endHour}
            onChange={(e) => setEndHour(Number(e.target.value))}
            aria-label="Latest hour"
            style={{ width: 90 }}
          />
        </label>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Working hours guide the “suggest times” calendar finder.
      </p>

      <label className="row" style={{ gap: '0.5rem' }}>
        <input type="checkbox" checked={openJoin} onChange={(e) => setOpenJoin(e.target.checked)} />
        Anyone with the link can join
      </label>

      {error && <div className="banner banner-danger">{error}</div>}
      <button className="btn btn-primary" type="submit">
        Save settings
      </button>
    </form>
  );
}
