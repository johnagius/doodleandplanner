/**
 * Doodle-style scheduling polls: members vote yes / maybe / no on candidate
 * time slots, and we tally a weighted score to surface the best option.
 */
import { generateId } from './ids.js';
import { toMs } from './time.js';
import type { OptionTally, SchedulePoll, TimeOption, Vote, VoteValue } from './types.js';

export interface CreatePollInput {
  roomId: string;
  title: string;
  description?: string;
  options: Array<{ start: string; end: string }>;
  allowMaybe?: boolean;
  deadline?: string;
  now?: () => Date;
}

export function createPoll(input: CreatePollInput): SchedulePoll {
  const title = input.title.trim();
  if (!title) throw new Error('Poll title is required');
  if (input.options.length === 0) throw new Error('A poll needs at least one time option');

  const now = (input.now ?? (() => new Date()))().toISOString();
  const options: TimeOption[] = input.options.map((o) => {
    if (toMs(o.end) <= toMs(o.start)) throw new Error('Option end must be after start');
    return { id: generateId('opt'), start: o.start, end: o.end };
  });

  return {
    id: generateId('poll'),
    roomId: input.roomId,
    title,
    description: input.description?.trim() || undefined,
    options,
    votes: [],
    status: 'open',
    allowMaybe: input.allowMaybe ?? true,
    deadline: input.deadline,
    createdAt: now,
  };
}

/** Set or clear a poll's voting deadline. */
export function setPollDeadline(poll: SchedulePoll, deadline: string | undefined): SchedulePoll {
  return { ...poll, deadline };
}

/** True when an open poll has a deadline that has passed. */
export function isPollDue(poll: SchedulePoll, now: Date = new Date()): boolean {
  return poll.status === 'open' && !!poll.deadline && toMs(poll.deadline) <= now.getTime();
}

export function addOption(poll: SchedulePoll, start: string, end: string): SchedulePoll {
  if (toMs(end) <= toMs(start)) throw new Error('Option end must be after start');
  const option: TimeOption = { id: generateId('opt'), start, end };
  return { ...poll, options: [...poll.options, option] };
}

export function removeOption(poll: SchedulePoll, optionId: string): SchedulePoll {
  return {
    ...poll,
    options: poll.options.filter((o) => o.id !== optionId),
    votes: poll.votes.filter((v) => v.optionId !== optionId),
    finalOptionId: poll.finalOptionId === optionId ? undefined : poll.finalOptionId,
  };
}

/**
 * Cast (or change) a member's vote on a single option. Re-voting overwrites the
 * previous value; voting "maybe" when the poll forbids it throws.
 */
export function castVote(
  poll: SchedulePoll,
  memberId: string,
  optionId: string,
  value: VoteValue,
): SchedulePoll {
  if (poll.status === 'closed') throw new Error('Poll is closed');
  if (!poll.options.some((o) => o.id === optionId)) throw new Error('Unknown option');
  if (value === 'maybe' && !poll.allowMaybe) throw new Error('Maybe votes are disabled');

  const others = poll.votes.filter((v) => !(v.memberId === memberId && v.optionId === optionId));
  const vote: Vote = { memberId, optionId, value };
  return { ...poll, votes: [...others, vote] };
}

export function clearVote(poll: SchedulePoll, memberId: string, optionId: string): SchedulePoll {
  return {
    ...poll,
    votes: poll.votes.filter((v) => !(v.memberId === memberId && v.optionId === optionId)),
  };
}

/** Tally every option. `score = yes + 0.5 * maybe`. */
export function tallyPoll(poll: SchedulePoll): OptionTally[] {
  return poll.options.map((option) => {
    const votes = poll.votes.filter((v) => v.optionId === option.id);
    const yesMembers = votes.filter((v) => v.value === 'yes').map((v) => v.memberId);
    const yes = yesMembers.length;
    const maybe = votes.filter((v) => v.value === 'maybe').length;
    const no = votes.filter((v) => v.value === 'no').length;
    return { optionId: option.id, yes, maybe, no, score: yes + 0.5 * maybe, yesMembers };
  });
}

/**
 * Options ranked best-first by score, then by most yes votes, then earliest
 * start time as a stable tie-breaker.
 */
export function bestOptions(poll: SchedulePoll): OptionTally[] {
  const startById = new Map(poll.options.map((o) => [o.id, toMs(o.start)]));
  return tallyPoll(poll).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.yes !== a.yes) return b.yes - a.yes;
    return (startById.get(a.optionId) ?? 0) - (startById.get(b.optionId) ?? 0);
  });
}

export function closePoll(poll: SchedulePoll, finalOptionId?: string): SchedulePoll {
  const winner = finalOptionId ?? bestOptions(poll)[0]?.optionId;
  if (winner && !poll.options.some((o) => o.id === winner)) {
    throw new Error('Final option is not part of this poll');
  }
  return { ...poll, status: 'closed', finalOptionId: winner };
}

export function reopenPoll(poll: SchedulePoll): SchedulePoll {
  return { ...poll, status: 'open', finalOptionId: undefined };
}

/** How many distinct members have cast at least one vote. */
export function participantCount(poll: SchedulePoll): number {
  return new Set(poll.votes.map((v) => v.memberId)).size;
}
