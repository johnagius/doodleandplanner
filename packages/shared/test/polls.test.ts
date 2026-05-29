import { describe, expect, it } from 'vitest';
import {
  addOption,
  bestOptions,
  castVote,
  clearVote,
  closePoll,
  createPoll,
  participantCount,
  removeOption,
  reopenPoll,
  tallyPoll,
} from '../src/polls.js';
import type { SchedulePoll } from '../src/types.js';

function buildPoll(): SchedulePoll {
  return createPoll({
    roomId: 'room_1',
    title: 'Movie night',
    options: [
      { start: '2026-06-01T18:00:00Z', end: '2026-06-01T20:00:00Z' },
      { start: '2026-06-02T18:00:00Z', end: '2026-06-02T20:00:00Z' },
      { start: '2026-06-03T18:00:00Z', end: '2026-06-03T20:00:00Z' },
    ],
  });
}

describe('createPoll', () => {
  it('creates an open poll with options', () => {
    const poll = buildPoll();
    expect(poll.status).toBe('open');
    expect(poll.options).toHaveLength(3);
    expect(poll.allowMaybe).toBe(true);
  });

  it('validates title and options', () => {
    expect(() => createPoll({ roomId: 'r', title: ' ', options: [] })).toThrow(/title/);
    expect(() => createPoll({ roomId: 'r', title: 'x', options: [] })).toThrow(/at least one/);
    expect(() =>
      createPoll({
        roomId: 'r',
        title: 'x',
        options: [{ start: '2026-06-01T20:00:00Z', end: '2026-06-01T18:00:00Z' }],
      }),
    ).toThrow(/end must be after/);
  });
});

describe('voting', () => {
  it('tallies yes/maybe/no with weighted score', () => {
    let poll = buildPoll();
    const [o1] = poll.options;
    poll = castVote(poll, 'm1', o1!.id, 'yes');
    poll = castVote(poll, 'm2', o1!.id, 'yes');
    poll = castVote(poll, 'm3', o1!.id, 'maybe');
    poll = castVote(poll, 'm4', o1!.id, 'no');

    const tally = tallyPoll(poll).find((t) => t.optionId === o1!.id)!;
    expect(tally.yes).toBe(2);
    expect(tally.maybe).toBe(1);
    expect(tally.no).toBe(1);
    expect(tally.score).toBe(2.5);
    expect(tally.yesMembers).toEqual(['m1', 'm2']);
  });

  it('overwrites a member’s prior vote on the same option', () => {
    let poll = buildPoll();
    const [o1] = poll.options;
    poll = castVote(poll, 'm1', o1!.id, 'yes');
    poll = castVote(poll, 'm1', o1!.id, 'no');
    const tally = tallyPoll(poll).find((t) => t.optionId === o1!.id)!;
    expect(tally.yes).toBe(0);
    expect(tally.no).toBe(1);
    expect(poll.votes).toHaveLength(1);
  });

  it('clears a vote', () => {
    let poll = buildPoll();
    const [o1] = poll.options;
    poll = castVote(poll, 'm1', o1!.id, 'yes');
    poll = clearVote(poll, 'm1', o1!.id);
    expect(poll.votes).toHaveLength(0);
  });

  it('rejects maybe when disabled, unknown options, and closed polls', () => {
    const strict = createPoll({
      roomId: 'r',
      title: 'x',
      allowMaybe: false,
      options: [{ start: '2026-06-01T18:00:00Z', end: '2026-06-01T20:00:00Z' }],
    });
    const opt = strict.options[0]!.id;
    expect(() => castVote(strict, 'm1', opt, 'maybe')).toThrow(/Maybe/);
    expect(() => castVote(strict, 'm1', 'nope', 'yes')).toThrow(/Unknown option/);
    const closed = closePoll(strict, opt);
    expect(() => castVote(closed, 'm1', opt, 'yes')).toThrow(/closed/);
  });

  it('counts distinct participants', () => {
    let poll = buildPoll();
    const [o1, o2] = poll.options;
    poll = castVote(poll, 'm1', o1!.id, 'yes');
    poll = castVote(poll, 'm1', o2!.id, 'no');
    poll = castVote(poll, 'm2', o1!.id, 'yes');
    expect(participantCount(poll)).toBe(2);
  });
});

describe('ranking and closing', () => {
  it('ranks by score, then yes, then earliest start', () => {
    let poll = buildPoll();
    const [o1, o2, o3] = poll.options;
    // o2: 2 yes (score 2); o3: 1 yes + 2 maybe (score 2) -> o2 wins on yes count
    poll = castVote(poll, 'a', o2!.id, 'yes');
    poll = castVote(poll, 'b', o2!.id, 'yes');
    poll = castVote(poll, 'a', o3!.id, 'yes');
    poll = castVote(poll, 'b', o3!.id, 'maybe');
    poll = castVote(poll, 'c', o3!.id, 'maybe');
    poll = castVote(poll, 'a', o1!.id, 'maybe'); // score 0.5

    const ranked = bestOptions(poll);
    expect(ranked[0]!.optionId).toBe(o2!.id);
    expect(ranked[1]!.optionId).toBe(o3!.id);
    expect(ranked[2]!.optionId).toBe(o1!.id);
  });

  it('closes with an explicit or computed winner and can reopen', () => {
    let poll = buildPoll();
    const [o1] = poll.options;
    poll = castVote(poll, 'a', o1!.id, 'yes');
    const closed = closePoll(poll);
    expect(closed.status).toBe('closed');
    expect(closed.finalOptionId).toBe(o1!.id);
    expect(() => closePoll(poll, 'bogus')).toThrow(/not part of/);

    const reopened = reopenPoll(closed);
    expect(reopened.status).toBe('open');
    expect(reopened.finalOptionId).toBeUndefined();
  });
});

describe('option editing', () => {
  it('adds and removes options, cleaning up votes', () => {
    let poll = buildPoll();
    poll = addOption(poll, '2026-06-04T18:00:00Z', '2026-06-04T20:00:00Z');
    expect(poll.options).toHaveLength(4);
    const target = poll.options[0]!.id;
    poll = castVote(poll, 'm1', target, 'yes');
    poll = removeOption(poll, target);
    expect(poll.options).toHaveLength(3);
    expect(poll.votes.some((v) => v.optionId === target)).toBe(false);
  });
});
