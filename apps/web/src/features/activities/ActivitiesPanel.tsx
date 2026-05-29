import {
  findMember,
  formatSlot,
  itineraryEnd,
  itineraryMinutes,
  planItinerary,
  rankActivities,
  type Activity,
} from '@dap/shared';
import { useState, type FormEvent } from 'react';
import { Avatar } from '../../components/Avatar.js';
import { EmptyState } from '../../components/EmptyState.js';
import { defaultStartLocal, isoToLocalInput, localInputToISO } from '../../lib/datetime.js';
import { useRoomStore } from '../../state/roomStore.js';

export function ActivitiesPanel() {
  const state = useRoomStore((s) => s.state)!;
  const meId = useRoomStore((s) => s.meId)!;
  const { addActivity, toggleActivityInterest, removeActivity, scheduleActivityAt } =
    useRoomStore();

  const ranked = rankActivities(state.activities);

  return (
    <div className="stack">
      <AddActivityForm onAdd={(input) => addActivity(input)} />

      {ranked.length === 0 ? (
        <EmptyState
          icon="🎉"
          title="No ideas yet"
          hint="Propose things to do — everyone votes with interest, and you can build a running order for the day."
        />
      ) : (
        <>
          <div className="grid grid-2">
            {ranked.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                interestedMembers={activity.interested
                  .map((id) => findMember(state.room, id))
                  .filter(Boolean)
                  .map((m) => ({ name: m!.name, color: m!.color }))}
                proposer={findMember(state.room, activity.proposedBy)?.name}
                mineInterested={activity.interested.includes(meId)}
                canDelete={activity.proposedBy === meId || state.room.createdBy === meId}
                onToggle={() => toggleActivityInterest(activity.id)}
                onRemove={() => removeActivity(activity.id)}
                onSchedule={(iso) => scheduleActivityAt(activity.id, iso)}
              />
            ))}
          </div>
          <ItineraryCard />
        </>
      )}
    </div>
  );
}

function AddActivityForm({
  onAdd,
}: {
  onAdd: (input: { title: string; description?: string; durationMinutes?: number }) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(60);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ title, description: description || undefined, durationMinutes: duration });
    setTitle('');
    setDescription('');
    setDuration(60);
  }

  return (
    <form className="card stack" onSubmit={submit} aria-label="Propose an activity">
      <div className="row row-wrap">
        <input
          className="input grow"
          placeholder="Propose an activity (e.g. Kayaking)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Activity title"
        />
        <label className="row small" style={{ gap: 6 }}>
          for
          <select
            className="select"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            aria-label="Activity duration"
          >
            <option value={30}>30 min</option>
            <option value={60}>1 hour</option>
            <option value={90}>1.5 hours</option>
            <option value={120}>2 hours</option>
            <option value={180}>3 hours</option>
          </select>
        </label>
        <button className="btn btn-primary" type="submit">
          Propose
        </button>
      </div>
      <input
        className="input"
        placeholder="Add a detail (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        aria-label="Activity description"
      />
    </form>
  );
}

function ActivityCard({
  activity,
  interestedMembers,
  proposer,
  mineInterested,
  canDelete,
  onToggle,
  onRemove,
  onSchedule,
}: {
  activity: Activity;
  interestedMembers: { name: string; color: string }[];
  proposer?: string;
  mineInterested: boolean;
  canDelete: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onSchedule: (iso: string | undefined) => void;
}) {
  const [pinning, setPinning] = useState(false);
  return (
    <div className="card stack" style={{ gap: '0.6rem' }}>
      <div className="row spread">
        <h3 className="card-title" style={{ margin: 0 }}>
          {activity.title}
        </h3>
        <span className="badge badge-primary">{activity.interested.length} keen</span>
      </div>
      {activity.description && (
        <p className="muted small" style={{ margin: 0 }}>
          {activity.description}
        </p>
      )}
      <div className="row small muted row-wrap" style={{ gap: '0.5rem' }}>
        {activity.durationMinutes && <span className="badge">{activity.durationMinutes} min</span>}
        {activity.scheduledAt && (
          <span className="badge badge-primary">
            📌 {formatSlot(activity.scheduledAt, activity.scheduledAt).split(',')[0]}{' '}
            {new Date(activity.scheduledAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
        {proposer && <span>proposed by {proposer}</span>}
      </div>
      <div className="row" style={{ gap: 4 }}>
        {interestedMembers.map((m, i) => (
          <Avatar key={i} member={m} size={24} />
        ))}
      </div>
      {pinning && (
        <div className="row row-wrap" style={{ gap: '0.4rem' }}>
          <input
            className="input grow"
            type="datetime-local"
            defaultValue={activity.scheduledAt ? isoToLocalInput(activity.scheduledAt) : ''}
            aria-label="Pinned time"
            onChange={(e) =>
              onSchedule(e.target.value ? localInputToISO(e.target.value) : undefined)
            }
          />
          {activity.scheduledAt && (
            <button
              className="btn btn-sm"
              onClick={() => {
                onSchedule(undefined);
                setPinning(false);
              }}
            >
              Unpin
            </button>
          )}
        </div>
      )}
      <div className="row spread">
        <div className="row" style={{ gap: 4 }}>
          <button
            className={`btn btn-sm ${mineInterested ? 'btn-primary' : ''}`}
            onClick={onToggle}
          >
            {mineInterested ? '✓ I’m in' : 'I’m in'}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setPinning((v) => !v)}
            aria-label="Pin a time"
          >
            📌
          </button>
        </div>
        {canDelete && (
          <button className="btn btn-sm btn-danger" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function ItineraryCard() {
  const state = useRoomStore((s) => s.state)!;
  // Default the start to the first planned event, else tomorrow at 10:00.
  const firstEventStart = [...state.events].sort((a, b) => a.start.localeCompare(b.start))[0]
    ?.start;
  const [startLocal, setStartLocal] = useState(
    firstEventStart ? isoToLocalInput(firstEventStart) : defaultStartLocal(1, 10),
  );
  const [gap, setGap] = useState(15);

  const startISO = localInputToISO(startLocal);
  const plan = planItinerary(state.activities, startISO, {
    gapMinutes: gap,
    defaultDurationMinutes: 60,
  });
  const end = itineraryEnd(plan);

  return (
    <div className="card stack" aria-label="Itinerary" style={{ gap: '0.75rem' }}>
      <div className="row spread row-wrap">
        <h3 className="card-title" style={{ margin: 0 }}>
          🗺️ Running order
        </h3>
        <div className="row row-wrap" style={{ gap: '0.75rem' }}>
          <label className="row small" style={{ gap: 6 }}>
            Start
            <input
              className="input"
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              aria-label="Itinerary start"
            />
          </label>
          <label className="row small" style={{ gap: 6 }}>
            Gap
            <select
              className="select"
              value={gap}
              onChange={(e) => setGap(Number(e.target.value))}
              aria-label="Gap between activities"
            >
              <option value={0}>none</option>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
            </select>
          </label>
        </div>
      </div>

      <ol className="timeline">
        {plan.map((seg) => (
          <li key={seg.activityId} className="timeline-item">
            <span className="timeline-time">{formatSlot(seg.start, seg.end)}</span>
            <span className="timeline-title">{seg.title}</span>
          </li>
        ))}
      </ol>

      <div className="muted small">
        {plan.length} activities · {Math.round(itineraryMinutes(plan) / 6) / 10}h of fun
        {end && <> · wraps up {formatSlot(plan[plan.length - 1]!.start, end).split(', ')[1]}</>}
      </div>
    </div>
  );
}
