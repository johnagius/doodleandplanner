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

export interface GoogleProfile {
  email: string;
  name?: string;
  picture?: string;
}

/** Fetch the signed-in user's profile (name, email, avatar) for "Sign in with Google". */
export async function fetchUserProfile(token: string): Promise<GoogleProfile> {
  const resp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Could not read Google profile (${resp.status})`);
  const json = (await resp.json()) as { email?: string; name?: string; picture?: string };
  return { email: json.email ?? '', name: json.name, picture: json.picture };
}

/** The primary calendar id is the user's email — handy for showing who linked. */
export async function getPrimaryEmail(token: string): Promise<string> {
  const resp = await authedFetch(token, '/calendars/primary', { method: 'GET' });
  if (!resp.ok) throw new Error(`Could not read primary calendar (${resp.status})`);
  const json = (await resp.json()) as { id: string };
  return json.id;
}

// --- Rich busy intervals (with event titles) via events.list ---------------

interface GoogleEventItem {
  status?: string;
  summary?: string;
  transparency?: string; // 'transparent' => doesn't block time
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export interface EventsListResponse {
  items?: GoogleEventItem[];
}

/**
 * Pure: map a Calendar events.list response to enriched BusyIntervaLs that the
 * conflict engine understands (title, tentative status, all-day flag). Cancelled
 * and "free"/transparent events are dropped; declined events are skipped.
 */
export function parseEventsToBusy(resp: EventsListResponse): BusyInterval[] {
  const out: BusyInterval[] = [];
  for (const ev of resp.items ?? []) {
    if (ev.status === 'cancelled') continue;
    if (ev.transparency === 'transparent') continue; // marked "free"
    const allDay = !ev.start?.dateTime && !!ev.start?.date;
    const start =
      ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T00:00:00.000Z` : undefined);
    const end = ev.end?.dateTime ?? (ev.end?.date ? `${ev.end.date}T00:00:00.000Z` : undefined);
    if (!start || !end) continue;
    out.push({
      start,
      end,
      title: ev.summary?.trim() || undefined,
      status: ev.status === 'tentative' ? 'tentative' : 'busy',
      allDay,
    });
  }
  return out;
}

/**
 * List the user's events in a window as enriched busy intervals (with titles).
 * Falls back to opaque free/busy if the richer scope is unavailable.
 */
export async function getBusyWithEvents(
  token: string,
  timeMin: string,
  timeMax: string,
  calendarId = 'primary',
): Promise<BusyInterval[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const resp = await authedFetch(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    { method: 'GET' },
  );
  if (!resp.ok) {
    // Gracefully degrade to opaque busy blocks (e.g. readonly scope only).
    return getFreeBusy(token, timeMin, timeMax, calendarId);
  }
  return parseEventsToBusy((await resp.json()) as EventsListResponse);
}
