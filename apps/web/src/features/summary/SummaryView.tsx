import {
  combineLedger,
  findMember,
  formatSlot,
  rankActivities,
  summarizeInventory,
  tallyRsvps,
  type PlannedEvent,
} from '@dap/shared';
import { formatMoney } from '../../lib/format.js';
import { useRoomStore } from '../../state/roomStore.js';

/**
 * A printable one-page trip summary: the agreed plan, who's coming, the running
 * order, what to pack, and how the money splits. "Print / Save PDF" uses the
 * browser print dialog (print CSS hides the app chrome).
 */
export function SummaryView() {
  const state = useRoomStore((s) => s.state)!;
  const room = state.room;
  const memberIds = room.members.map((m) => m.id);
  const name = (id: string) => findMember(room, id)?.name ?? 'Someone';

  const events = [...state.events].sort((a, b) => a.start.localeCompare(b.start));
  const inventory = summarizeInventory(state.inventory);
  const ledger = combineLedger(state.expenses ?? [], state.inventory, memberIds);
  const activities = rankActivities(state.activities);
  const currency = room.settings.currency;

  return (
    <div className="stack summary">
      <div className="row spread row-wrap no-print">
        <p className="muted small" style={{ margin: 0 }}>
          A shareable overview of the plan. Print it or save as PDF.
        </p>
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
          🖨️ Print / Save PDF
        </button>
      </div>

      <div className="card stack summary-sheet" style={{ gap: '1.25rem' }}>
        <header className="stack" style={{ gap: '0.25rem' }}>
          <h2 style={{ margin: 0 }}>{room.name}</h2>
          {room.description && (
            <p className="muted" style={{ margin: 0 }}>
              {room.description}
            </p>
          )}
          <div className="row small muted" style={{ gap: '0.4rem' }}>
            <span>{room.members.length} people</span>
            <span>·</span>
            <span>{room.members.map((m) => m.name).join(', ')}</span>
          </div>
        </header>

        <SummarySection title="🗓️ The plan">
          {events.length === 0 ? (
            <p className="muted small">No events locked in yet.</p>
          ) : (
            <div className="stack" style={{ gap: '0.5rem' }}>
              {events.map((e) => (
                <EventSummary key={e.id} event={e} memberIds={memberIds} name={name} />
              ))}
            </div>
          )}
        </SummarySection>

        {activities.length > 0 && (
          <SummarySection title="🎉 Activities">
            <ul className="summary-list">
              {activities.map((a) => (
                <li key={a.id}>
                  {a.title}
                  {a.interested.length > 0 && (
                    <span className="muted small"> · {a.interested.length} keen</span>
                  )}
                </li>
              ))}
            </ul>
          </SummarySection>
        )}

        {state.inventory.length > 0 && (
          <SummarySection title={`🎒 What to bring (${inventory.coverage}% sorted)`}>
            <ul className="summary-list">
              {state.inventory.map((item) => (
                <li key={item.id}>
                  <span
                    style={{ textDecoration: item.status === 'done' ? 'line-through' : 'none' }}
                  >
                    {item.name}
                    {item.quantity > 1 ? ` ×${item.quantity}` : ''}
                  </span>
                  <span className="muted small">
                    {item.claimedBy ? ` · ${name(item.claimedBy)}` : ' · unclaimed'}
                    {item.category ? ` · ${item.category}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </SummarySection>
        )}

        {ledger.total > 0 && (
          <SummarySection title={`💰 Money — ${formatMoney(ledger.total, currency)} total`}>
            {ledger.settlements.length === 0 ? (
              <p className="muted small">All settled up.</p>
            ) : (
              <ul className="summary-list">
                {ledger.settlements.map((s, i) => (
                  <li key={i}>
                    <strong>{name(s.from)}</strong> pays <strong>{name(s.to)}</strong>{' '}
                    {formatMoney(s.amount, currency)}
                  </li>
                ))}
              </ul>
            )}
          </SummarySection>
        )}

        <footer
          className="muted small"
          style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}
        >
          Made with Doodle &amp; Planner · room code {room.slug}
        </footer>
      </div>
    </div>
  );
}

function SummarySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="stack" style={{ gap: '0.5rem' }}>
      <h3 className="card-title" style={{ margin: 0 }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function EventSummary({
  event,
  memberIds,
  name,
}: {
  event: PlannedEvent;
  memberIds: string[];
  name: (id: string) => string;
}) {
  const rsvp = tallyRsvps(event, memberIds);
  return (
    <div className="stack" style={{ gap: '0.2rem' }}>
      <div className="row spread row-wrap">
        <strong>{event.title}</strong>
        <span className="muted small">{formatSlot(event.start, event.end)}</span>
      </div>
      {event.location && <div className="small">📍 {event.location}</div>}
      <div className="small muted">
        ✅ {rsvp.going.length} going
        {rsvp.maybe.length > 0 ? ` · 🤔 ${rsvp.maybe.length} maybe` : ''}
        {rsvp.going.length > 0 ? ` — ${rsvp.going.map(name).join(', ')}` : ''}
      </div>
    </div>
  );
}
