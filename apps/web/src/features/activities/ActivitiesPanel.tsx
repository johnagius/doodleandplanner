import { findMember, rankActivities, type Activity } from '@dap/shared';
import { useState, type FormEvent } from 'react';
import { Avatar } from '../../components/Avatar.js';
import { useRoomStore } from '../../state/roomStore.js';

export function ActivitiesPanel() {
  const state = useRoomStore((s) => s.state)!;
  const meId = useRoomStore((s) => s.meId)!;
  const { addActivity, toggleActivityInterest, removeActivity } = useRoomStore();

  const ranked = rankActivities(state.activities);

  return (
    <div className="stack">
      <AddActivityForm onAdd={(input) => addActivity(input)} />

      {ranked.length === 0 ? (
        <div className="empty">No ideas yet. What should everyone do together? 🎉</div>
      ) : (
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
            />
          ))}
        </div>
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

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ title, description: description || undefined });
    setTitle('');
    setDescription('');
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
}: {
  activity: Activity;
  interestedMembers: { name: string; color: string }[];
  proposer?: string;
  mineInterested: boolean;
  canDelete: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
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
      {proposer && <div className="muted small">proposed by {proposer}</div>}
      <div className="row" style={{ gap: 4 }}>
        {interestedMembers.map((m, i) => (
          <Avatar key={i} member={m} size={24} />
        ))}
      </div>
      <div className="row spread">
        <button className={`btn btn-sm ${mineInterested ? 'btn-primary' : ''}`} onClick={onToggle}>
          {mineInterested ? '✓ I’m in' : 'I’m in'}
        </button>
        {canDelete && (
          <button className="btn btn-sm btn-danger" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
