import { findMember, summarizeInventory, type InventoryItem } from '@dap/shared';
import { useState, type FormEvent } from 'react';
import { Avatar } from '../../components/Avatar.js';
import { useRoomStore } from '../../state/roomStore.js';

export function InventoryPanel() {
  const state = useRoomStore((s) => s.state)!;
  const meId = useRoomStore((s) => s.meId)!;
  const { addItem, claim, release, setStatus, removeItem } = useRoomStore();

  const summary = summarizeInventory(state.inventory);

  return (
    <div className="stack">
      <AddItemForm onAdd={(input) => addItem(input)} />

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
        </>
      )}
    </div>
  );
}

function AddItemForm({
  onAdd,
}: {
  onAdd: (input: { name: string; quantity: number; category?: string }) => void;
}) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [category, setCategory] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ name, quantity, category: category || undefined });
    setName('');
    setQuantity(1);
    setCategory('');
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
        style={{ width: 140 }}
        aria-label="Category"
      />
      <button className="btn btn-primary" type="submit">
        Add
      </button>
    </form>
  );
}

function ItemRow({
  item,
  claimerName,
  claimerColor,
  mine,
  onClaim,
  onRelease,
  onDone,
  onRemove,
}: {
  item: InventoryItem;
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
