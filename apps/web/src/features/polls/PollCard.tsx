import {
  bestOptions,
  classifyOption,
  findMember,
  formatSlot,
  participantCount,
  type OptionTally,
  type TimeOption,
  type VoteValue,
} from '@dap/shared';
import { Avatar } from '../../components/Avatar.js';
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
          <div className="muted small">
            {participantCount(poll)} of {state.room.members.length} voted
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
          const cls = hasAvailability ? classifyOption(option, memberIds, availability) : undefined;
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
              freeNames={cls ? names(cls.free) : undefined}
              busyNames={cls ? names(cls.busy) : undefined}
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
  freeNames,
  busyNames,
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
  freeNames?: string[];
  busyNames?: string[];
  voters: { name: string; color: string }[];
  onVote: (value: VoteValue) => void;
  canFinalize: boolean;
  onPick: () => void;
  onAddToPlan: () => void;
}) {
  const score = tally?.score ?? 0;
  const values: VoteValue[] = allowMaybe ? ['yes', 'maybe', 'no'] : ['yes', 'no'];

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
          <span>👍 {tally?.yes ?? 0}</span>
          {allowMaybe && <span>🤔 {tally?.maybe ?? 0}</span>}
          <span>👎 {tally?.no ?? 0}</span>
        </div>
      </div>

      <div className="progress">
        <span style={{ width: `${(score / maxScore) * 100}%` }} />
      </div>

      {(freeNames?.length || busyNames?.length) && (
        <div className="row small" style={{ gap: '0.75rem' }}>
          {freeNames && freeNames.length > 0 && (
            <span style={{ color: 'var(--success)' }} title={`Free: ${freeNames.join(', ')}`}>
              📅 {freeNames.length} free
            </span>
          )}
          {busyNames && busyNames.length > 0 && (
            <span style={{ color: 'var(--danger)' }} title={`Busy: ${busyNames.join(', ')}`}>
              ⛔ {busyNames.length} busy
            </span>
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
