import { useState } from 'react';
import { useRoomStore } from '../../state/roomStore.js';
import { CreatePollForm } from './CreatePollForm.js';
import { PollCard } from './PollCard.js';

export function PollsPanel() {
  const polls = useRoomStore((s) => s.state!.polls);
  const [creating, setCreating] = useState(false);

  return (
    <div className="stack">
      <div className="row spread">
        <div>
          <h2 className="card-title" style={{ margin: 0 }}>
            Scheduling polls
          </h2>
          <p className="muted small" style={{ margin: 0 }}>
            Propose times, everyone votes, the best slot wins.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Close' : '+ New poll'}
        </button>
      </div>

      {creating && <CreatePollForm onDone={() => setCreating(false)} />}

      {polls.length === 0 && !creating ? (
        <div className="empty">No polls yet. Create one to find a time that suits everyone 🗳️</div>
      ) : (
        polls.map((poll) => <PollCard key={poll.id} pollId={poll.id} />)
      )}
    </div>
  );
}
