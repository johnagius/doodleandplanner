import { findMember, summarizeBudget, summarizeInventory, type InventoryItem } from '@dap/shared';
import { useState, type FormEvent } from 'react';
import { Avatar } from '../../components/Avatar.js';
import { CURRENCIES, formatMoney } from '../../lib/format.js';
import { useRoomStore } from '../../state/roomStore.js';

export function InventoryPanel() {
  const state = useRoomStore((s) => s.state)!;
  const meId = useRoomStore((s) => s.meId)!;
  const { addItem, claim, release, setStatus, removeItem } = useRoomStore();

  const summary = summarizeInventory(state.inventory);
  const currency = state.room.settings.currency;

  return (
    <div className="stack">
      <AddItemForm onAdd={(input) => addItem(input)} currency={currency} />

      {state.inventory.length === 0 ? (
        <div className="empty">Nothing on the list yet. Add what the group needs to bring 🎒</div>
      ) : (
        <>
          <div className="card stack" style={{ gap: '0.5rem' }}>
            <div className="row spread">
              <strong>{summary.coverage}% sorted</strong>
              <span className="muted small">
                {summary.claimed} claimed · {summary.done} done · {summary.needed} still needed
              </span>
            </div>
            <div className="progress">
              <span style={{ width: `${summary.coverage}%` }} />
            </div>
          </div>

          <div className="stack">
            {state.inventory.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                currency={currency}
                claimerName={
                  item.claimedBy ? findMember(state.room, item.claimedBy)?.name : undefined
                }
                claimerColor={
                  item.claimedBy ? findMember(state.room, item.claimedBy)?.color : undefined
                }
                mine={item.claimedBy === meId}
                onClaim={() => claim(item.id)}
                onRelease={() => release(item.id)}
                onDone={() => setStatus(item.id, item.status === 'done' ? 'claimed' : 'done')}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </div>

          <BudgetCard />
        </>
      )}
    </div>
  );
}

function AddItemForm({
  onAdd,
  currency,
}: {
  onAdd: (input: { name: string; quantity: number; category?: string; cost?: number }) => void;
  currency: string;
}) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [category, setCategory] = useState('');
  const [cost, setCost] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const parsedCost = cost.trim() === '' ? undefined : Math.max(0, Number(cost));
    onAdd({ name, quantity, category: category || undefined, cost: parsedCost });
    setName('');
    setQuantity(1);
    setCategory('');
    setCost('');
  }

  return (
    <form className="card row row-wrap" onSubmit={submit} aria-label="Add inventory item">
      <input
        className="input grow"
        placeholder="What to bring (e.g. Tent)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Item name"
      />
      <input
        className="input"
        type="number"
        min={1}
        value={quantity}
        onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
        style={{ width: 80 }}
        aria-label="Quantity"
      />
      <input
        className="input"
        placeholder="Category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        style={{ width: 130 }}
        aria-label="Category"
      />
      <input
        className="input"
        type="number"
        min={0}
        step="0.01"
        placeholder={`Cost (${currency})`}
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        style={{ width: 120 }}
        aria-label="Cost"
      />
      <button className="btn btn-primary" type="submit">
        Add
      </button>
    </form>
  );
}

function ItemRow({
  item,
  currency,
  claimerName,
  claimerColor,
  mine,
  onClaim,
  onRelease,
  onDone,
  onRemove,
}: {
  item: InventoryItem;
  currency: string;
  claimerName?: string;
  claimerColor?: string;
  mine: boolean;
  onClaim: () => void;
  onRelease: () => void;
  onDone: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="card row spread row-wrap" style={{ gap: '0.75rem' }}>
      <div className="row" style={{ gap: '0.6rem', minWidth: 0 }}>
        <input
          type="checkbox"
          checked={item.status === 'done'}
          onChange={onDone}
          aria-label={`Mark ${item.name} done`}
        />
        <div>
          <div
            style={{
              fontWeight: 600,
              textDecoration: item.status === 'done' ? 'line-through' : 'none',
            }}
          >
            {item.name} {item.quantity > 1 && <span className="muted">×{item.quantity}</span>}
            {item.cost ? (
              <span className="badge" style={{ marginLeft: 6 }}>
                {formatMoney(item.cost, currency)}
              </span>
            ) : null}
          </div>
          <div className="row small muted" style={{ gap: '0.4rem' }}>
            {item.category && <span className="badge">{item.category}</span>}
            {claimerName ? (
              <span className="row" style={{ gap: 4 }}>
                <Avatar member={{ name: claimerName, color: claimerColor ?? '#888' }} size={20} />{' '}
                {claimerName}
              </span>
            ) : (
              <span className="badge">unclaimed</span>
            )}
          </div>
        </div>
      </div>
      <div className="row">
        {item.claimedBy ? (
          mine ? (
            <button className="btn btn-sm" onClick={onRelease}>
              Release
            </button>
          ) : null
        ) : (
          <button className="btn btn-sm btn-primary" onClick={onClaim}>
            I’ll bring it
          </button>
        )}
        <button
          className="btn btn-sm btn-danger"
          onClick={onRemove}
          aria-label={`Remove ${item.name}`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function BudgetCard() {
  const state = useRoomStore((s) => s.state)!;
  const setCurrency = useRoomStore((s) => s.setCurrency);
  const currency = state.room.settings.currency;
  const memberIds = state.room.members.map((m) => m.id);
  const budget = summarizeBudget(state.inventory, memberIds);

  if (budget.estimatedTotal === 0) return null;
  const name = (id: string) => findMember(state.room, id)?.name ?? 'Someone';

  return (
    <div className="card stack" aria-label="Budget" style={{ gap: '0.75rem' }}>
      <div className="row spread row-wrap">
        <h3 className="card-title" style={{ margin: 0 }}>
          💰 Budget &amp; split
        </h3>
        <label className="row small" style={{ gap: 6 }}>
          Currency
          <select
            className="select"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            aria-label="Currency"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="row row-wrap" style={{ gap: '1.5rem' }}>
        <Stat label="Spent so far" value={formatMoney(budget.total, currency)} />
        {budget.estimatedTotal !== budget.total && (
          <Stat label="Estimated total" value={formatMoney(budget.estimatedTotal, currency)} />
        )}
        <Stat label="Per person" value={formatMoney(budget.perPerson, currency)} />
      </div>

      <div className="stack" style={{ gap: '0.35rem' }}>
        {budget.balances.map((b) => (
          <div key={b.memberId} className="row spread small">
            <span>{name(b.memberId)}</span>
            <span className="muted">
              paid {formatMoney(b.paid, currency)} ·{' '}
              {b.net > 0.005 ? (
                <span style={{ color: 'var(--success)' }}>owed {formatMoney(b.net, currency)}</span>
              ) : b.net < -0.005 ? (
                <span style={{ color: 'var(--danger)' }}>owes {formatMoney(-b.net, currency)}</span>
              ) : (
                'settled'
              )}
            </span>
          </div>
        ))}
      </div>

      {budget.settlements.length > 0 && (
        <div className="stack" style={{ gap: '0.3rem' }}>
          <strong className="small">Settle up</strong>
          {budget.settlements.map((s, i) => (
            <div key={i} className="small">
              <strong>{name(s.from)}</strong> pays <strong>{name(s.to)}</strong>{' '}
              {formatMoney(s.amount, currency)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted small">{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{value}</div>
    </div>
  );
}
