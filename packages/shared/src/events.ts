/** Finalised events and conversion to/from Google Calendar resources. */
import { generateId } from './ids.js';
import { toMs } from './time.js';
import type { PlannedEvent, RsvpStatus, SchedulePoll, TimeOption } from './types.js';

export interface CreateEventInput {
  roomId: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  now?: () => Date;
}

export function createEvent(input: CreateEventInput): PlannedEvent {
  const title = input.title.trim();
  if (!title) throw new Error('Event title is required');
  if (toMs(input.end) <= toMs(input.start)) throw new Error('Event end must be after start');
  return {
    id: generateId('evt'),
    roomId: input.roomId,
    title,
    start: input.start,
    end: input.end,
    location: input.location?.trim() || undefined,
    description: input.description?.trim() || undefined,
    createdAt: (input.now ?? (() => new Date()))().toISOString(),
  };
}

/** Build an event from a (usually winning) poll option. */
export function eventFromOption(
  poll: Pick<SchedulePoll, 'roomId' | 'title' | 'description'>,
  option: TimeOption,
  overrides: Partial<CreateEventInput> = {},
): PlannedEvent {
  return createEvent({
    roomId: poll.roomId,
    title: poll.title,
    description: poll.description,
    start: option.start,
    end: option.end,
    ...overrides,
  });
}

export function attachGoogleEventId(event: PlannedEvent, googleEventId: string): PlannedEvent {
  return { ...event, googleEventId };
}

/** Set (or toggle off) a member's RSVP. Re-selecting the same status clears it. */
export function setRsvp(event: PlannedEvent, memberId: string, status: RsvpStatus): PlannedEvent {
  const current = event.rsvps ?? {};
  const next = { ...current };
  if (next[memberId] === status) {
    delete next[memberId];
  } else {
    next[memberId] = status;
  }
  return { ...event, rsvps: next };
}

export interface RsvpTally {
  going: string[];
  maybe: string[];
  declined: string[];
  /** Member ids with no response yet (from the supplied roster). */
  awaiting: string[];
}

/** Tally RSVPs for an event against the full member roster. */
export function tallyRsvps(event: PlannedEvent, memberIds: string[]): RsvpTally {
  const rsvps = event.rsvps ?? {};
  const going: string[] = [];
  const maybe: string[] = [];
  const declined: string[] = [];
  const awaiting: string[] = [];
  for (const id of memberIds) {
    const status = rsvps[id];
    if (status === 'going') going.push(id);
    else if (status === 'maybe') maybe.push(id);
    else if (status === 'declined') declined.push(id);
    else awaiting.push(id);
  }
  return { going, maybe, declined, awaiting };
}

/** The subset of the Google Calendar event resource we create. */
export interface GoogleCalendarEventResource {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  extendedProperties?: { private?: Record<string, string> };
}

export function toGoogleEvent(event: PlannedEvent): GoogleCalendarEventResource {
  return {
    summary: event.title,
    description: event.description,
    location: event.location,
    start: { dateTime: event.start },
    end: { dateTime: event.end },
    extendedProperties: { private: { dapRoomId: event.roomId, dapEventId: event.id } },
  };
}
