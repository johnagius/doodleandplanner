import { mergeBusyIntervals, type BusyInterval } from '@dap/shared';
import type { GoogleCalendarEventResource } from '@dap/shared';

const CAL_BASE = 'https://www.googleapis.com/calendar/v3';

export interface FreeBusyResponse {
  calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
}

/** Pure: flatten + merge the busy blocks across all returned calendars. */
export function parseFreeBusy(resp: FreeBusyResponse): BusyInterval[] {
  const out: BusyInterval[] = [];
  for (const cal of Object.values(resp.calendars ?? {})) {
    for (const b of cal.busy ?? []) out.push({ start: b.start, end: b.end });
  }
  return mergeBusyIntervals(out);
}

async function authedFetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${CAL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

/** Look up the signed-in user's busy intervals between two ISO instants. */
export async function getFreeBusy(
  token: string,
  timeMin: string,
  timeMax: string,
  calendarId = 'primary',
): Promise<BusyInterval[]> {
  const resp = await authedFetch(token, '/freeBusy', {
    method: 'POST',
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: calendarId }] }),
  });
  if (!resp.ok) throw new Error(`Free/busy lookup failed (${resp.status})`);
  return parseFreeBusy((await resp.json()) as FreeBusyResponse);
}

/** Insert an event on the user's primary calendar. */
export async function insertCalendarEvent(
  token: string,
  resource: GoogleCalendarEventResource,
): Promise<{ id: string; htmlLink?: string }> {
  const resp = await authedFetch(token, '/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(resource),
  });
  if (!resp.ok) throw new Error(`Could not create calendar event (${resp.status})`);
  const json = (await resp.json()) as { id: string; htmlLink?: string };
  return { id: json.id, htmlLink: json.htmlLink };
}

/** The primary calendar id is the user's email — handy for showing who linked. */
export async function getPrimaryEmail(token: string): Promise<string> {
  const resp = await authedFetch(token, '/calendars/primary', { method: 'GET' });
  if (!resp.ok) throw new Error(`Could not read primary calendar (${resp.status})`);
  const json = (await resp.json()) as { id: string };
  return json.id;
}
