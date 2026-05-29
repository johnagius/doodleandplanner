import { describe, expect, it } from 'vitest';
import {
  claimItem,
  createItem,
  releaseItem,
  setItemStatus,
  summarizeInventory,
  updateItem,
} from '../src/inventory.js';

describe('createItem', () => {
  it('creates a needed item with defaults', () => {
    const item = createItem({ roomId: 'r', name: '  Tent  ' });
    expect(item.name).toBe('Tent');
    expect(item.quantity).toBe(1);
    expect(item.status).toBe('needed');
    expect(item.claimedBy).toBeUndefined();
  });

  it('validates name and quantity', () => {
    expect(() => createItem({ roomId: 'r', name: ' ' })).toThrow(/name/);
    expect(() => createItem({ roomId: 'r', name: 'x', quantity: 0 })).toThrow(/Quantity/);
  });

  it('accepts an optional cost and rejects negative costs', () => {
    expect(createItem({ roomId: 'r', name: 'Tent', cost: 90 }).cost).toBe(90);
    expect(createItem({ roomId: 'r', name: 'Free' }).cost).toBeUndefined();
    expect(() => createItem({ roomId: 'r', name: 'x', cost: -5 })).toThrow(/Cost/);
  });
});

describe('claim lifecycle', () => {
  it('claims, releases and changes status', () => {
    let item = createItem({ roomId: 'r', name: 'Cooler' });
    item = claimItem(item, 'mem_1');
    expect(item.status).toBe('claimed');
    expect(item.claimedBy).toBe('mem_1');

    item = setItemStatus(item, 'done');
    expect(item.status).toBe('done');
    expect(item.claimedBy).toBe('mem_1');

    item = releaseItem(item);
    expect(item.status).toBe('needed');
    expect(item.claimedBy).toBeUndefined();

    // setting status back to needed releases the claim
    item = claimItem(item, 'mem_2');
    item = setItemStatus(item, 'needed');
    expect(item.claimedBy).toBeUndefined();
  });
});

describe('updateItem', () => {
  it('patches fields and validates', () => {
    const item = createItem({ roomId: 'r', name: 'Chips', quantity: 2 });
    const updated = updateItem(item, { name: 'Crisps', quantity: 5, category: 'Snacks' });
    expect(updated.name).toBe('Crisps');
    expect(updated.quantity).toBe(5);
    expect(updated.category).toBe('Snacks');
    expect(() => updateItem(item, { name: '   ' })).toThrow(/name/);
    expect(() => updateItem(item, { quantity: 0 })).toThrow(/Quantity/);
    expect(updateItem(item, { cost: 12.5 }).cost).toBe(12.5);
    expect(() => updateItem(item, { cost: -1 })).toThrow(/Cost/);
  });
});

describe('summarizeInventory', () => {
  it('counts statuses, groups by member and computes coverage', () => {
    const base = createItem({ roomId: 'r', name: 'A' });
    const items = [
      base,
      claimItem(createItem({ roomId: 'r', name: 'B' }), 'm1'),
      setItemStatus(claimItem(createItem({ roomId: 'r', name: 'C' }), 'm1'), 'done'),
      setItemStatus(claimItem(createItem({ roomId: 'r', name: 'D' }), 'm2'), 'done'),
    ];
    const summary = summarizeInventory(items);
    expect(summary.total).toBe(4);
    expect(summary.needed).toBe(1);
    expect(summary.claimed).toBe(1);
    expect(summary.done).toBe(2);
    expect(summary.byMember['m1']).toHaveLength(2);
    expect(summary.byMember['m2']).toHaveLength(1);
    expect(summary.coverage).toBe(75);
  });

  it('handles an empty list', () => {
    expect(summarizeInventory([])).toMatchObject({ total: 0, coverage: 0 });
  });
});
