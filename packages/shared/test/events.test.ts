import { describe, expect, it } from 'vitest';
import { attachGoogleEventId, createEvent, eventFromOption, toGoogleEvent } from '../src/events.js';

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
