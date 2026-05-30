import {
  bestOptions,
  findMember,
  formatSlot,
  isPollDue,
  participantCount,
  summarizeSlotConflicts,
  type BusyInterval,
  type OptionTally,
  type SlotConflictSummary,
  type TimeOption,
  type VoteValue,
} from '@dap/shared';
import { Avatar } from '../../components/Avatar.js';
import { CountUp } from '../../components/CountUp.js';
import { useToast } from '../../components/Toast.js';
import { useRoomStore } from '../../state/roomStore.js';

const VOTE_LABEL: Record<VoteValue, string> = { yes: '👍', maybe: '🤔', no: '👎' };

export function PollCard({ pollId }: { pollId: string }) {
  const state = useRoomStore((s) => s.state)!;
  const meId = useRoomStore((s) => s.meId)!;
  const { vote, decidePoll, deletePoll, scheduleFromOption } = useRoomStore();
  const { show } = useToast();

  const poll = state.polls.find((p) => p.id === pollId);
  if (!poll) return null;

  const tallies = bestOptions(poll);
  const tallyById = new Map(tallies.map((t) => [t.optionId, t]));
  const topId = tallies[0]?.optionId;
  const maxScore = Math.max(1, ...tallies.map((t) => t.score));
  const isOrganiser = state.room.createdBy === meId;
  const closed = poll.status === 'closed';
  const memberIds = state.room.members.map((m) => m.id);
  const availability = state.availability ?? [];
  const hasAvailability = availability.length > 0;
  const busyByMember = new Map<string, BusyInterval[]>(
    availability.map((a) => [a.memberId, a.busy]),
  );
  const names = (ids: string[]) => ids.map((id) => findMember(state.room, id)?.name ?? '?');

  const myVote = (optionId: string): VoteValue | undefined =>
    poll.votes.find((v) => v.memberId === meId && v.optionId === optionId)?.value;

  async function finalizeToPlan(option: TimeOption) {
    await scheduleFromOption(poll!, option);
    show('Added to the plan 🗓️');
  }

  return (
    <div className="card stack">
      <div className="row spread row-wrap">
        <div>
          <h3 className="card-title" style={{ margin: 0 }}>
            {poll.title} {closed && <span className="badge badge-success">decided</span>}
          </h3>
          {poll.description && (
            <p className="muted small" style={{ margin: 0 }}>
              {poll.description}
            </p>
          )}
          <div className="row small muted" style={{ gap: '0.5rem' }}>
            <span>
              <CountUp value={participantCount(poll)} /> of {state.room.members.length} voted
            </span>
            {poll.deadline && !closed && (
              <span className={isPollDue(poll) ? 'badge badge-warn' : 'badge'}>
                {isPollDue(poll)
                  ? '⏰ voting due'
                  : `⏳ closes ${new Date(poll.deadline).toLocaleDateString([], {
                      day: 'numeric',
                      month: 'short',
                    })}`}
              </span>
            )}
          </div>
        </div>
        {isOrganiser && (
          <div className="row">
            {closed ? (
              <button className="btn btn-sm" onClick={() => decidePoll(poll.id)}>
                Reopen
              </button>
            ) : null}
            <button className="btn btn-sm btn-danger" onClick={() => deletePoll(poll.id)}>
              Delete
            </button>
          </div>
        )}
      </div>

      <div className="stack" style={{ gap: '0.6rem' }}>
        {poll.options.map((option) => {
          const tally = tallyById.get(option.id);
          const isWinner = closed ? poll.finalOptionId === option.id : option.id === topId;
          const conflict = hasAvailability
            ? summarizeSlotConflicts(option, memberIds, busyByMember)
            : undefined;
          return (
            <OptionRow
              key={option.id}
              option={option}
              tally={tally}
              maxScore={maxScore}
              highlight={isWinner}
              closed={closed}
              allowMaybe={poll.allowMaybe}
              myVote={myVote(option.id)}
              conflict={conflict}
              names={names}
              voters={(tally?.yesMembers ?? [])
                .map((id) => findMember(state.room, id))
                .filter(Boolean)
                .map((m) => ({ name: m!.name, color: m!.color }))}
              onVote={(value) => vote(poll.id, option.id, value)}
              canFinalize={isOrganiser}
              onPick={() => decidePoll(poll.id, option.id)}
              onAddToPlan={() => finalizeToPlan(option)}
            />
          );
        })}
      </div>
    </div>
  );
}

function OptionRow({
  option,
  tally,
  maxScore,
  highlight,
  closed,
  allowMaybe,
  myVote,
  conflict,
  names,
  voters,
  onVote,
  canFinalize,
  onPick,
  onAddToPlan,
}: {
  option: TimeOption;
  tally?: OptionTally;
  maxScore: number;
  highlight: boolean;
  closed: boolean;
  allowMaybe: boolean;
  myVote?: VoteValue;
  conflict?: SlotConflictSummary;
  names: (ids: string[]) => string[];
  voters: { name: string; color: string }[];
  onVote: (value: VoteValue) => void;
  canFinalize: boolean;
  onPick: () => void;
  onAddToPlan: () => void;
}) {
  const score = tally?.score ?? 0;
  const values: VoteValue[] = allowMaybe ? ['yes', 'maybe', 'no'] : ['yes', 'no'];

  // Collect the named events that hard-block this slot, for an explainable tooltip.
  const clashNotes = conflict
    ? conflict.perMember
        .filter((m) => m.conflict.severity === 'hard')
        .map((m) => {
          const who = names([m.memberId])[0] ?? 'Someone';
          const why = m.conflict.reasons[0]?.title ?? 'busy';
          return `${who}: ${why}`;
        })
    : [];

  return (
    <div
      className="stack"
      style={{
        gap: '0.4rem',
        padding: '0.6rem 0.75rem',
        borderRadius: 'var(--radius-sm)',
        border: highlight ? '1px solid var(--primary)' : '1px solid var(--border)',
        background: highlight ? 'var(--primary-soft)' : 'transparent',
      }}
    >
      <div className="row spread row-wrap">
        <strong>
          {formatSlot(option.start, option.end)} {highlight && <span aria-hidden>⭐</span>}
        </strong>
        <div className="row small muted" style={{ gap: '0.5rem' }}>
          <span>
            👍 <CountUp value={tally?.yes ?? 0} />
          </span>
          {allowMaybe && (
            <span>
              🤔 <CountUp value={tally?.maybe ?? 0} />
            </span>
          )}
          <span>
            👎 <CountUp value={tally?.no ?? 0} />
          </span>
        </div>
      </div>

      <div className="progress">
        <span style={{ width: `${(score / maxScore) * 100}%` }} />
      </div>

      {conflict && (conflict.free.length || conflict.soft.length || conflict.hard.length) > 0 && (
        <div className="stack" style={{ gap: '0.25rem' }}>
          <div className="row small" style={{ gap: '0.75rem' }}>
            {conflict.free.length > 0 && (
              <span
                style={{ color: 'var(--success)' }}
                title={`Free: ${names(conflict.free).join(', ')}`}
              >
                ✅ {conflict.free.length} free
              </span>
            )}
            {conflict.soft.length > 0 && (
              <span
                style={{ color: 'var(--warn)' }}
                title={`Maybe: ${names(conflict.soft).join(', ')}`}
              >
                ⚠️ {conflict.soft.length} tentative
              </span>
            )}
            {conflict.hard.length > 0 && (
              <span style={{ color: 'var(--danger)' }} title={clashNotes.join(' · ')}>
                ⛔ {conflict.hard.length} can’t make it
              </span>
            )}
          </div>
          {clashNotes.length > 0 && (
            <div className="muted" style={{ fontSize: '0.72rem' }}>
              Clashes: {clashNotes.slice(0, 3).join(' · ')}
              {clashNotes.length > 3 ? ` +${clashNotes.length - 3} more` : ''}
            </div>
          )}
        </div>
      )}

      <div className="row spread row-wrap">
        <div className="row" style={{ gap: 3 }}>
          {voters.map((m, i) => (
            <Avatar key={i} member={m} size={22} />
          ))}
        </div>
        {!closed && (
          <div
            className="row"
            role="group"
            aria-label={`Vote for ${formatSlot(option.start, option.end)}`}
          >
            {values.map((value) => (
              <button
                key={value}
                className={`btn btn-sm ${myVote === value ? 'btn-primary' : ''}`}
                onClick={() => onVote(value)}
                aria-pressed={myVote === value}
                aria-label={`Vote ${value}`}
              >
                {VOTE_LABEL[value]}
              </button>
            ))}
          </div>
        )}
      </div>

      {canFinalize && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {!closed ? (
            <button className="btn btn-sm" onClick={onPick}>
              Pick this time
            </button>
          ) : highlight ? (
            <button className="btn btn-sm btn-primary" onClick={onAddToPlan}>
              Add to plan
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
