import { useState } from 'react';
import { EmptyState, PanelHeader } from '../../components/EmptyState.js';
import { useRoomStore } from '../../state/roomStore.js';
import { CreatePollForm } from './CreatePollForm.js';
import { PollCard } from './PollCard.js';

export function PollsPanel() {
  const polls = useRoomStore((s) => s.state!.polls);
  const [creating, setCreating] = useState(false);

  return (
    <div className="stack">
      <PanelHeader
        title="Scheduling polls"
        subtitle="Propose times, everyone votes, the best slot wins."
        action={
          <button className="btn btn-primary" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Close' : '+ New poll'}
          </button>
        }
      />

      {creating && <CreatePollForm onDone={() => setCreating(false)} />}

      {polls.length === 0 && !creating ? (
        <EmptyState
          icon="🗳️"
          title="No polls yet"
          hint="Create a poll to find a time that suits everyone — connect Google Calendar and it’ll show who’s free."
          action={
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
              + New poll
            </button>
          }
        />
      ) : (
        polls.map((poll) => <PollCard key={poll.id} pollId={poll.id} />)
      )}
    </div>
  );
}
