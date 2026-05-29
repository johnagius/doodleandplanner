import { describe, expect, it } from 'vitest';
import {
  parseEventsToBusy,
  parseFreeBusy,
  type EventsListResponse,
  type FreeBusyResponse,
} from './calendar.js';

describe('parseFreeBusy', () => {
  it('flattens and merges busy blocks across calendars', () => {
    const resp: FreeBusyResponse = {
      calendars: {
        primary: {
          busy: [
            { start: '2026-06-01T09:00:00Z', end: '2026-06-01T10:00:00Z' },
            { start: '2026-06-01T09:30:00Z', end: '2026-06-01T11:00:00Z' },
          ],
        },
        work: {
          busy: [{ start: '2026-06-01T13:00:00Z', end: '2026-06-01T14:00:00Z' }],
        },
      },
    };
    expect(parseFreeBusy(resp)).toEqual([
      { start: '2026-06-01T09:00:00.000Z', end: '2026-06-01T11:00:00.000Z' },
      { start: '2026-06-01T13:00:00.000Z', end: '2026-06-01T14:00:00.000Z' },
    ]);
  });

  it('handles an empty or missing response', () => {
    expect(parseFreeBusy({})).toEqual([]);
    expect(parseFreeBusy({ calendars: { primary: {} } })).toEqual([]);
  });
});

describe('parseEventsToBusy', () => {
  it('maps timed events with titles and tentative status', () => {
    const resp: EventsListResponse = {
      items: [
        {
          summary: 'Dentist',
          start: { dateTime: '2026-06-01T10:00:00Z' },
          end: { dateTime: '2026-06-01T11:00:00Z' },
        },
        {
          summary: 'Maybe coffee',
          status: 'tentative',
          start: { dateTime: '2026-06-01T12:00:00Z' },
          end: { dateTime: '2026-06-01T12:30:00Z' },
        },
      ],
    };
    const busy = parseEventsToBusy(resp);
    expect(busy).toHaveLength(2);
    expect(busy[0]).toMatchObject({ title: 'Dentist', status: 'busy', allDay: false });
    expect(busy[1]).toMatchObject({ title: 'Maybe coffee', status: 'tentative' });
  });

  it('handles all-day events via the date field', () => {
    const busy = parseEventsToBusy({
      items: [{ summary: 'Holiday', start: { date: '2026-06-01' }, end: { date: '2026-06-02' } }],
    });
    expect(busy[0]).toMatchObject({ title: 'Holiday', allDay: true });
    expect(busy[0]!.start).toContain('2026-06-01');
  });

  it('drops cancelled and transparent (free) events, and event with no times', () => {
    const busy = parseEventsToBusy({
      items: [
        {
          summary: 'Cancelled',
          status: 'cancelled',
          start: { dateTime: 'x' },
          end: { dateTime: 'y' },
        },
        {
          summary: 'Out of office (free)',
          transparency: 'transparent',
          start: { dateTime: '2026-06-01T10:00:00Z' },
          end: { dateTime: '2026-06-01T11:00:00Z' },
        },
        { summary: 'No times' },
      ],
    });
    expect(busy).toEqual([]);
  });

  it('handles an empty response', () => {
    expect(parseEventsToBusy({})).toEqual([]);
  });
});
