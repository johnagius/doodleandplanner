import { describe, expect, it } from 'vitest';
import { settleUp, summarizeBudget } from '../src/budget.js';
import { claimItem, createItem } from '../src/inventory.js';
import type { InventoryItem } from '../src/types.js';

function paidItem(name: string, cost: number, memberId: string): InventoryItem {
  return claimItem(createItem({ roomId: 'r', name, cost }), memberId);
}

describe('summarizeBudget', () => {
  it('splits claimed costs equally and nets each member out', () => {
    const items = [
      paidItem('Tent', 90, 'a'), // a paid 90
      paidItem('Food', 30, 'b'), // b paid 30
      // c paid nothing
    ];
    const summary = summarizeBudget(items, ['a', 'b', 'c']);
    expect(summary.total).toBe(120);
    expect(summary.perPerson).toBe(40);

    const byId = Object.fromEntries(summary.balances.map((b) => [b.memberId, b]));
    expect(byId['a']).toMatchObject({ paid: 90, share: 40, net: 50 });
    expect(byId['b']).toMatchObject({ paid: 30, share: 40, net: -10 });
    expect(byId['c']).toMatchObject({ paid: 0, share: 40, net: -40 });
  });

  it('counts only claimed items as paid, but all costs as estimated', () => {
    const items = [
      paidItem('Tent', 50, 'a'),
      createItem({ roomId: 'r', name: 'Unclaimed gear', cost: 20 }), // no payer
    ];
    const summary = summarizeBudget(items, ['a', 'b']);
    expect(summary.total).toBe(50);
    expect(summary.estimatedTotal).toBe(70);
  });

  it('produces settlements that clear every debt', () => {
    const items = [paidItem('Tent', 90, 'a'), paidItem('Food', 30, 'b')];
    const summary = summarizeBudget(items, ['a', 'b', 'c']);
    // c owes 40, b owes 10, a is owed 50.
    const toA = summary.settlements.filter((s) => s.to === 'a');
    const receivedByA = toA.reduce((sum, s) => sum + s.amount, 0);
    expect(receivedByA).toBeCloseTo(50, 2);
    expect(summary.settlements.every((s) => s.amount > 0)).toBe(true);
    // Net of every settlement should zero out the balances.
    const delta = new Map<string, number>();
    for (const s of summary.settlements) {
      delta.set(s.from, (delta.get(s.from) ?? 0) - s.amount);
      delta.set(s.to, (delta.get(s.to) ?? 0) + s.amount);
    }
    // Money moved to/from each member should exactly offset their net balance.
    for (const b of summary.balances) {
      expect((delta.get(b.memberId) ?? 0) - b.net).toBeCloseTo(0, 2);
    }
  });

  it('handles no participants and no costs gracefully', () => {
    expect(summarizeBudget([], [])).toMatchObject({ total: 0, perPerson: 0, settlements: [] });
    const items = [createItem({ roomId: 'r', name: 'Free hugs' })];
    expect(summarizeBudget(items, ['a']).total).toBe(0);
  });
});

describe('settleUp', () => {
  it('returns no transfers when everyone is square', () => {
    expect(
      settleUp([
        { memberId: 'a', paid: 10, share: 10, net: 0 },
        { memberId: 'b', paid: 10, share: 10, net: 0 },
      ]),
    ).toEqual([]);
  });

  it('matches the largest debtor to the largest creditor first', () => {
    const settlements = settleUp([
      { memberId: 'a', paid: 0, share: 0, net: 60 },
      { memberId: 'b', paid: 0, share: 0, net: -40 },
      { memberId: 'c', paid: 0, share: 0, net: -20 },
    ]);
    expect(settlements[0]).toMatchObject({ from: 'b', to: 'a', amount: 40 });
    expect(settlements[1]).toMatchObject({ from: 'c', to: 'a', amount: 20 });
  });
});
