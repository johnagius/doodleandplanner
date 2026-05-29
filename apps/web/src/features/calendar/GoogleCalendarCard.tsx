import { suggestSlots } from '@dap/shared';
import { useState } from 'react';
import { useToast } from '../../components/Toast.js';
import { getFreeBusy } from '../../lib/google/calendar.js';
import { isGoogleConfigured } from '../../lib/google/config.js';
import { useGoogleStore } from '../../state/googleStore.js';
import { useRoomStore } from '../../state/roomStore.js';

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function GoogleCalendarCard() {
  const configured = isGoogleConfigured();
  const { email, connecting, error, connect, disconnect, token } = useGoogleStore();
  const room = useRoomStore((s) => s.state!.room);
  const polls = useRoomStore((s) => s.state!.polls);
  const meId = useRoomStore((s) => s.meId)!;
  const { linkGoogle, addPoll, shareMyAvailability } = useRoomStore();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);

  if (!configured) {
    return (
      <div className="card stack">
        <h3 className="card-title">📅 Google Calendar</h3>
        <p className="muted small" style={{ margin: 0 }}>
          Connect Google Calendar to check everyone’s availability and write the final event back to
          your calendar. To enable it, deploy with a <code>VITE_GOOGLE_CLIENT_ID</code> from a
          Google Cloud OAuth client. Meanwhile, you can still export any event as an{' '}
          <strong>.ics</strong> file below.
        </p>
      </div>
    );
  }

  async function handleConnect() {
    const linked = await connect();
    if (linked) {
      await linkGoogle(linked);
      show(`Connected ${linked}`);
    }
  }

  async function suggestFromMyCalendar() {
    setBusy(true);
    try {
      const accessToken = await token();
      const now = new Date();
      const windowStart = now.toISOString();
      const windowEnd = addDays(now, 7).toISOString();
      const myBusy = await getFreeBusy(accessToken, windowStart, windowEnd);
      const suggestions = suggestSlots({
        windowStart,
        windowEnd,
        durationMinutes: room.settings.defaultSlotMinutes,
        stepMinutes: 30,
        workingHours: room.settings.workingHours,
        hourOf: (d) => d.getHours(),
        members: [{ memberId: meId, busy: myBusy }],
        minFree: 1,
        limit: 6,
      });
      if (suggestions.length === 0) {
        show('No free slots found in the next 7 days');
        return;
      }
      await addPoll({
        title: 'Times that work for me',
        description: 'Auto-suggested from my Google Calendar',
        options: suggestions.map((s) => ({ start: s.option.start, end: s.option.end })),
      });
      show('Created a poll from your free slots 🗓️');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Calendar lookup failed');
    } finally {
      setBusy(false);
    }
  }

  async function shareAvailability() {
    setBusy(true);
    try {
      const accessToken = await token();
      const options = polls.flatMap((p) => p.options);
      const now = new Date();
      let windowStart = now.toISOString();
      let windowEnd = addDays(now, 14).toISOString();
      if (options.length > 0) {
        windowStart = options.reduce(
          (min, o) => (o.start < min ? o.start : min),
          options[0]!.start,
        );
        windowEnd = options.reduce((max, o) => (o.end > max ? o.end : max), options[0]!.end);
      }
      const myBusy = await getFreeBusy(accessToken, windowStart, windowEnd);
      await shareMyAvailability(myBusy);
      show('Shared your availability on the polls 📅');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Calendar lookup failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <div className="row spread row-wrap">
        <h3 className="card-title" style={{ margin: 0 }}>
          📅 Google Calendar
        </h3>
        {email ? (
          <span className="badge badge-success">connected · {email}</span>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={handleConnect} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Connect Google Calendar'}
          </button>
        )}
      </div>
      {error && <div className="banner banner-danger">{error}</div>}
      {email && (
        <div className="row row-wrap">
          <button className="btn btn-sm" onClick={suggestFromMyCalendar} disabled={busy}>
            {busy ? 'Checking…' : '✨ Suggest times I’m free'}
          </button>
          <button
            className="btn btn-sm"
            onClick={shareAvailability}
            disabled={busy}
            title="Overlay your free/busy on the schedule polls"
          >
            📅 Overlay my availability
          </button>
          <button className="btn btn-sm btn-ghost" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
