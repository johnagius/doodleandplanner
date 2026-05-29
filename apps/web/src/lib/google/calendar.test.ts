import { describe, expect, it } from 'vitest';
import { parseFreeBusy, type FreeBusyResponse } from './calendar.js';

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
