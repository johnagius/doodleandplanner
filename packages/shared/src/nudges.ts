/**
 * Room "at a glance" nudges: small, actionable prompts for the current viewer —
 * open polls they haven't voted in, due polls, unclaimed items, and events
 * awaiting their RSVP. Pure and tested; the UI renders them as chips.
 */
import { isPollDue } from './polls.js';
import type { Activity, InventoryItem, PlannedEvent, SchedulePoll } from './types.js';

export interface RoomNudges {
  /** Open polls the viewer has not voted in yet. */
  pollsToVote: number;
  /** Open polls whose deadline has passed (need deciding). */
  pollsDue: number;
  /** Inventory items nobody has claimed. */
  itemsNeeded: number;
  /** Events the viewer hasn't RSVP'd to. */
  eventsToRsvp: number;
  /** Activities with no interest yet. */
  activitiesQuiet: number;
}

export interface NudgesInput {
  viewerId: string;
  polls: SchedulePoll[];
  inventory: InventoryItem[];
  events: PlannedEvent[];
  activities: Activity[];
  now?: Date;
}

export function computeNudges(input: NudgesInput): RoomNudges {
  const now = input.now ?? new Date();
  const hasVoted = (p: SchedulePoll) => p.votes.some((v) => v.memberId === input.viewerId);

  const open = input.polls.filter((p) => p.status === 'open');
  return {
    pollsToVote: open.filter((p) => !hasVoted(p)).length,
    pollsDue: open.filter((p) => isPollDue(p, now)).length,
    itemsNeeded: input.inventory.filter((i) => !i.claimedBy).length,
    eventsToRsvp: input.events.filter((e) => !(e.rsvps ?? {})[input.viewerId]).length,
    activitiesQuiet: input.activities.filter((a) => a.interested.length === 0).length,
  };
}

/** True when there's at least one nudge worth showing. */
export function hasNudges(n: RoomNudges): boolean {
  return (
    n.pollsToVote > 0 ||
    n.pollsDue > 0 ||
    n.itemsNeeded > 0 ||
    n.eventsToRsvp > 0 ||
    n.activitiesQuiet > 0
  );
}
