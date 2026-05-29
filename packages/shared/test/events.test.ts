import { describe, expect, it } from 'vitest';
import {
  attachGoogleEventId,
  createEvent,
  eventFromOption,
  setRsvp,
  tallyRsvps,
  toGoogleEvent,
} from '../src/events.js';

describe('createEvent', () => {
  it('creates an event and validates the time range', () => {
    const evt = createEvent({
      roomId: 'r',
      title: 'BBQ',
      start: '2026-06-01T17:00:00Z',
      end: '2026-06-01T21:00:00Z',
      location: 'The Park',
    });
    expect(evt.title).toBe('BBQ');
    expect(evt.location).toBe('The Park');
    expect(() =>
      createEvent({
        roomId: 'r',
        title: 'x',
        start: '2026-06-01T21:00:00Z',
        end: '2026-06-01T17:00:00Z',
      }),
    ).toThrow(/after/);
    expect(() =>
      createEvent({
        roomId: 'r',
        title: ' ',
        start: '2026-06-01T17:00:00Z',
        end: '2026-06-01T21:00:00Z',
      }),
    ).toThrow(/title/);
  });
});

describe('eventFromOption', () => {
  it('derives an event from a poll option', () => {
    const evt = eventFromOption(
      { roomId: 'r', title: 'Dinner', description: 'Tapas' },
      { id: 'opt1', start: '2026-06-01T19:00:00Z', end: '2026-06-01T21:00:00Z' },
      { location: "Jose's" },
    );
    expect(evt.title).toBe('Dinner');
    expect(evt.description).toBe('Tapas');
    expect(evt.location).toBe("Jose's");
    expect(evt.start).toBe('2026-06-01T19:00:00Z');
  });
});

describe('google calendar conversion', () => {
  it('maps to a Google event resource with private metadata', () => {
    const evt = createEvent({
      roomId: 'room_42',
      title: 'BBQ',
      start: '2026-06-01T17:00:00Z',
      end: '2026-06-01T21:00:00Z',
    });
    const g = toGoogleEvent(evt);
    expect(g.summary).toBe('BBQ');
    expect(g.start.dateTime).toBe('2026-06-01T17:00:00Z');
    expect(g.extendedProperties?.private?.dapRoomId).toBe('room_42');
    expect(g.extendedProperties?.private?.dapEventId).toBe(evt.id);
  });

  it('attaches a google event id', () => {
    const evt = createEvent({
      roomId: 'r',
      title: 'x',
      start: '2026-06-01T17:00:00Z',
      end: '2026-06-01T18:00:00Z',
    });
    expect(attachGoogleEventId(evt, 'gcal_123').googleEventId).toBe('gcal_123');
  });
});

describe('RSVPs', () => {
  const base = () =>
    createEvent({
      roomId: 'r',
      title: 'BBQ',
      start: '2026-06-01T17:00:00Z',
      end: '2026-06-01T21:00:00Z',
    });

  it('sets a member RSVP', () => {
    const e = setRsvp(base(), 'm1', 'going');
    expect(e.rsvps).toEqual({ m1: 'going' });
  });

  it('toggles off when the same status is chosen again', () => {
    let e = setRsvp(base(), 'm1', 'going');
    e = setRsvp(e, 'm1', 'going');
    expect(e.rsvps).toEqual({});
  });

  it('changes status without removing', () => {
    let e = setRsvp(base(), 'm1', 'going');
    e = setRsvp(e, 'm1', 'maybe');
    expect(e.rsvps).toEqual({ m1: 'maybe' });
  });

  it('tallies against the roster, listing those awaiting', () => {
    let e = base();
    e = setRsvp(e, 'a', 'going');
    e = setRsvp(e, 'b', 'declined');
    e = setRsvp(e, 'c', 'maybe');
    const t = tallyRsvps(e, ['a', 'b', 'c', 'd']);
    expect(t.going).toEqual(['a']);
    expect(t.declined).toEqual(['b']);
    expect(t.maybe).toEqual(['c']);
    expect(t.awaiting).toEqual(['d']);
  });

  it('handles an event with no RSVPs', () => {
    expect(tallyRsvps(base(), ['a', 'b'])).toMatchObject({ going: [], awaiting: ['a', 'b'] });
  });
});
