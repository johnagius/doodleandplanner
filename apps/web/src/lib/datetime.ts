import { addMinutes } from '@dap/shared';

/** Convert a `datetime-local` value (local time) to an ISO-8601 UTC string. */
export function localInputToISO(value: string): string {
  return new Date(value).toISOString();
}

/** Convert an ISO string to a `datetime-local` value in the viewer's timezone. */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

/** A sensible default start: the next full hour, `daysAhead` days from now. */
export function defaultStartLocal(daysAhead = 1, hour = 18): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

/** Build {start,end} ISO options from local datetime values + a duration. */
export function optionsFromLocal(values: string[], durationMinutes: number) {
  return values.filter(Boolean).map((v) => {
    const start = localInputToISO(v);
    return { start, end: addMinutes(start, durationMinutes) };
  });
}
