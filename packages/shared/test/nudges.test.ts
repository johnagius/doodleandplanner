import { describe, expect, it } from 'vitest';
import { createActivity } from '../src/activities.js';
import { createEvent, setRsvp } from '../src/events.js';
import { claimItem, createItem } from '../src/inventory.js';
import { computeNudges, hasNudges } from '../src/nudges.js';
import { castVote, createPoll } from '../src/polls.js';

const opt = { start: '2026-06-01T18:00:00Z', end: '2026-06-01T20:00:00Z' };

describe('computeNudges', () => {
  it('counts polls the viewer has not voted in, and due polls', () => {
    const unvoted = createPoll({ roomId: 'r', title: 'A', options: [opt] });
    let voted = createPoll({ roomId: 'r', title: 'B', options: [opt] });
    voted = castVote(voted, 'me', voted.options[0]!.id, 'yes');
    const due = createPoll({
      roomId: 'r',
      title: 'C',
      options: [opt],
      deadline: '2026-01-01T00:00:00Z',
    });

    const n = computeNudges({
      viewerId: 'me',
      polls: [unvoted, voted, due],
      inventory: [],
      events: [],
      activities: [],
      now: new Date('2026-05-01T00:00:00Z'),
    });
    expect(n.pollsToVote).toBe(2); // unvoted + due (also unvoted)
    expect(n.pollsDue).toBe(1);
  });

  it('counts unclaimed items, events awaiting RSVP, and quiet activities', () => {
    const claimed = claimItem(createItem({ roomId: 'r', name: 'Tent' }), 'me');
    const needed = createItem({ roomId: 'r', name: 'Food' });
    // evt has no RSVP from me -> awaiting; evt2 is answered.
    const evt = createEvent({ roomId: 'r', title: 'D', start: opt.start, end: opt.end });
    const evt2 = setRsvp(
      createEvent({ roomId: 'r', title: 'E', start: opt.start, end: opt.end }),
      'me',
      'going',
    );
    const quiet = createActivity({ roomId: 'r', title: 'Idea', proposedBy: 'x' });

    const n = computeNudges({
      viewerId: 'me',
      polls: [],
      inventory: [claimed, needed],
      events: [evt, evt2],
      activities: [quiet],
    });
    expect(n.itemsNeeded).toBe(1);
    expect(n.eventsToRsvp).toBe(1); // evt awaiting, evt2 answered
    expect(n.activitiesQuiet).toBe(1);
  });

  it('hasNudges reflects whether anything is pending', () => {
    const none = computeNudges({
      viewerId: 'me',
      polls: [],
      inventory: [],
      events: [],
      activities: [],
    });
    expect(hasNudges(none)).toBe(false);
    expect(hasNudges({ ...none, itemsNeeded: 2 })).toBe(true);
  });
});
