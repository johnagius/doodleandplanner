import { describe, expect, it } from 'vitest';
import { combineLedger, createExpense, updateExpense } from '../src/expenses.js';
import { claimItem, createItem } from '../src/inventory.js';
import type { Expense, InventoryItem } from '../src/types.js';

function expense(over: Partial<Expense> = {}): Expense {
  return {
    ...createExpense({ roomId: 'r', description: 'Petrol', amount: 60, paidBy: 'a' }),
    ...over,
  };
}

describe('createExpense / updateExpense', () => {
  it('creates a valid expense and de-dupes sharedWith', () => {
    const e = createExpense({
      roomId: 'r',
      description: '  Dinner ',
      amount: 90,
      paidBy: 'a',
      sharedWith: ['a', 'b', 'b'],
    });
    expect(e.description).toBe('Dinner');
    expect(e.sharedWith).toEqual(['a', 'b']);
    expect(e.id).toMatch(/^exp_/);
  });

  it('validates description, amount and payer', () => {
    expect(() => createExpense({ roomId: 'r', description: ' ', amount: 5, paidBy: 'a' })).toThrow(
      /description/,
    );
    expect(() => createExpense({ roomId: 'r', description: 'x', amount: 0, paidBy: 'a' })).toThrow(
      /greater than zero/,
    );
    expect(() => createExpense({ roomId: 'r', description: 'x', amount: 5, paidBy: '' })).toThrow(
      /payer/,
    );
  });

  it('updates fields with validation', () => {
    const e = expense();
    expect(updateExpense(e, { amount: 80 }).amount).toBe(80);
    expect(() => updateExpense(e, { amount: -1 })).toThrow(/greater than zero/);
    expect(() => updateExpense(e, { description: '  ' })).toThrow(/description/);
  });
});

describe('combineLedger', () => {
  it('splits an expense across everyone when sharedWith is empty', () => {
    const summary = combineLedger([expense({ amount: 90, paidBy: 'a' })], [], ['a', 'b', 'c']);
    expect(summary.total).toBe(90);
    expect(summary.perPerson).toBe(30);
    const byId = Object.fromEntries(summary.balances.map((b) => [b.memberId, b]));
    expect(byId['a']).toMatchObject({ paid: 90, share: 30, net: 60 });
    expect(byId['b']).toMatchObject({ paid: 0, share: 30, net: -30 });
  });

  it('splits only across sharedWith when provided', () => {
    const summary = combineLedger(
      [expense({ amount: 50, paidBy: 'a', sharedWith: ['a', 'b'] })],
      [],
      ['a', 'b', 'c'],
    );
    const byId = Object.fromEntries(summary.balances.map((b) => [b.memberId, b]));
    expect(byId['a']).toMatchObject({ paid: 50, share: 25, net: 25 });
    expect(byId['b']).toMatchObject({ paid: 0, share: 25, net: -25 });
    expect(byId['c']).toMatchObject({ paid: 0, share: 0, net: 0 });
  });

  it('merges claimed inventory costs with expenses', () => {
    const items: InventoryItem[] = [claimItem(createItem({ roomId: 'r', name: 'Tent', cost: 30 }), 'b')];
    const summary = combineLedger([expense({ amount: 90, paidBy: 'a' })], items, ['a', 'b', 'c']);
    expect(summary.total).toBe(120);
    expect(summary.entries).toHaveLength(2);
    expect(summary.entries.some((e) => e.kind === 'item' && e.description === 'Tent')).toBe(true);
  });

  it('produces settlements that clear the combined balances', () => {
    const items: InventoryItem[] = [claimItem(createItem({ roomId: 'r', name: 'Food', cost: 30 }), 'b')];
    const summary = combineLedger([expense({ amount: 90, paidBy: 'a' })], items, ['a', 'b', 'c']);
    const delta = new Map<string, number>();
    for (const s of summary.settlements) {
      delta.set(s.from, (delta.get(s.from) ?? 0) - s.amount);
      delta.set(s.to, (delta.get(s.to) ?? 0) + s.amount);
    }
    for (const b of summary.balances) {
      expect((delta.get(b.memberId) ?? 0) - b.net).toBeCloseTo(0, 2);
    }
  });

  it('handles empty inputs', () => {
    expect(combineLedger([], [], [])).toMatchObject({ total: 0, settlements: [] });
    expect(combineLedger([], [], ['a']).total).toBe(0);
  });
});
