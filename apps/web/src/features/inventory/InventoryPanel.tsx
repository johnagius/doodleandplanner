import { combineLedger, findMember, summarizeInventory, type InventoryItem } from '@dap/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Avatar } from '../../components/Avatar.js';
import { CountUp } from '../../components/CountUp.js';
import { EmptyState } from '../../components/EmptyState.js';
import { CURRENCIES, formatMoney } from '../../lib/format.js';
import { useRoomStore } from '../../state/roomStore.js';

const UNCATEGORISED = '__uncategorised__';

/** Group items by category (uncategorised last), preserving insertion order. */
function groupByCategory(items: InventoryItem[]): [string, InventoryItem[]][] {
  const groups = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const key = item.category?.trim() || UNCATEGORISED;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(item);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === UNCATEGORISED) return 1;
    if (b === UNCATEGORISED) return -1;
    return a.localeCompare(b);
  });
}

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
        <EmptyState
          icon="🎒"
          title="Nothing on the list yet"
          hint="Add what the group needs to bring. Give items a category to group them, and a cost to split it."
        />
      ) : (
        <>
          <div className="card stack" style={{ gap: '0.5rem' }}>
            <div className="row spread">
              <strong>
                <CountUp value={summary.coverage} format={(n) => `${Math.round(n)}`} />% sorted
              </strong>
              <span className="muted small">
                {summary.claimed} claimed · {summary.done} done · {summary.needed} still needed
              </span>
            </div>
            <div className="progress">
              <span style={{ width: `${summary.coverage}%` }} />
            </div>
          </div>

          {groupByCategory(state.inventory).map(([category, items]) => (
            <div className="stack" key={category} style={{ gap: '0.5rem' }}>
              {category !== UNCATEGORISED && (
                <div className="section-label">
                  {category} <span className="muted small">({items.length})</span>
                </div>
              )}
              {items.map((item) => (
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
          ))}
        </>
      )}

      {/* Money & split is always available, even with no packing items yet. */}
      <BudgetCard />
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
  const { addExpense, removeExpense } = useRoomStore();
  const currency = state.room.settings.currency;
  const memberIds = state.room.members.map((m) => m.id);
  const expenses = state.expenses ?? [];
  const ledger = combineLedger(expenses, state.inventory, memberIds);
  const [adding, setAdding] = useState(false);

  // Show the card once there's anything to split (expenses or item costs).
  const hasCosts = ledger.total > 0 || state.inventory.some((i) => i.cost);
  const name = (id: string) => findMember(state.room, id)?.name ?? 'Someone';

  return (
    <div className="card stack" aria-label="Money" style={{ gap: '0.85rem' }}>
      <div className="row spread row-wrap">
        <h3 className="card-title" style={{ margin: 0 }}>
          💰 Money &amp; split
        </h3>
        <div className="row" style={{ gap: '0.5rem' }}>
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
          <button className="btn btn-sm btn-primary" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Close' : '+ Expense'}
          </button>
        </div>
      </div>

      {adding && (
        <AddExpenseForm
          members={state.room.members}
          onAdd={async (input) => {
            await addExpense(input);
            setAdding(false);
          }}
        />
      )}

      {!hasCosts ? (
        <p className="muted small" style={{ margin: 0 }}>
          Add an expense (petrol, the Airbnb, dinner…) or put a cost on an item to start splitting.
        </p>
      ) : (
        <>
          <div className="row row-wrap" style={{ gap: '1.5rem' }}>
            <Stat
              label="Total"
              value={<CountUp value={ledger.total} format={(n) => formatMoney(n, currency)} />}
            />
            <Stat
              label="Per person"
              value={<CountUp value={ledger.perPerson} format={(n) => formatMoney(n, currency)} />}
            />
            <Stat label="Entries" value={<CountUp value={ledger.entries.length} />} />
          </div>

          {expenses.length > 0 && (
            <div className="stack" style={{ gap: '0.3rem' }}>
              <strong className="small">Expenses</strong>
              {expenses.map((e) => (
                <div key={e.id} className="row spread small">
                  <span>
                    {e.description}{' '}
                    <span className="muted">
                      · {name(e.paidBy)} paid {formatMoney(e.amount, currency)}
                    </span>
                  </span>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => removeExpense(e.id)}
                    aria-label={`Remove ${e.description}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="stack" style={{ gap: '0.35rem' }}>
            <strong className="small">Balances</strong>
            {ledger.balances.map((b) => (
              <div key={b.memberId} className="row spread small">
                <span>{name(b.memberId)}</span>
                <span className="muted">
                  paid {formatMoney(b.paid, currency)} ·{' '}
                  {b.net > 0.005 ? (
                    <span style={{ color: 'var(--success)' }}>
                      owed {formatMoney(b.net, currency)}
                    </span>
                  ) : b.net < -0.005 ? (
                    <span style={{ color: 'var(--danger)' }}>
                      owes {formatMoney(-b.net, currency)}
                    </span>
                  ) : (
                    'settled'
                  )}
                </span>
              </div>
            ))}
          </div>

          {ledger.settlements.length > 0 && (
            <div className="stack" style={{ gap: '0.3rem' }}>
              <strong className="small">Settle up</strong>
              {ledger.settlements.map((s, i) => (
                <div key={i} className="small">
                  <strong>{name(s.from)}</strong> pays <strong>{name(s.to)}</strong>{' '}
                  {formatMoney(s.amount, currency)}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AddExpenseForm({
  members,
  onAdd,
}: {
  members: { id: string; name: string }[];
  onAdd: (input: {
    description: string;
    amount: number;
    paidBy: string;
    category?: string;
  }) => void;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(members[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!description.trim()) return setError('Add a description');
    if (!(value > 0)) return setError('Enter an amount');
    onAdd({ description, amount: value, paidBy });
    setDescription('');
    setAmount('');
  }

  return (
    <form
      className="row row-wrap"
      onSubmit={submit}
      aria-label="Add expense"
      style={{ gap: '0.5rem' }}
    >
      <input
        className="input grow"
        placeholder="What was it? (e.g. Petrol)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        aria-label="Expense description"
      />
      <input
        className="input"
        type="number"
        min={0}
        step="0.01"
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-label="Expense amount"
        style={{ width: 120 }}
      />
      <label className="row small" style={{ gap: 6 }}>
        paid by
        <select
          className="select"
          value={paidBy}
          onChange={(e) => setPaidBy(e.target.value)}
          aria-label="Paid by"
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-primary" type="submit">
        Add
      </button>
      {error && (
        <div className="banner banner-danger" style={{ width: '100%' }}>
          {error}
        </div>
      )}
    </form>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="muted small">{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{value}</div>
    </div>
  );
}
