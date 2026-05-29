/**
 * Cost splitting for the inventory. Whoever claims an item is assumed to have
 * paid its cost; we split the total fairly across participants and compute the
 * minimal set of "settle-up" transfers so everyone ends square.
 */
import type { InventoryItem } from './types.js';

export interface MemberBalance {
  memberId: string;
  /** What this member paid for (sum of claimed item costs). */
  paid: number;
  /** Their fair share of the total. */
  share: number;
  /** paid - share. Positive ⇒ owed money, negative ⇒ owes money. */
  net: number;
}

export interface Settlement {
  from: string;
  to: string;
  amount: number;
}

export interface BudgetSummary {
  /** Total of costs that have actually been claimed/paid. */
  total: number;
  /** Total of every item's cost, claimed or not (for planning). */
  estimatedTotal: number;
  /** Equal share per participant of {@link total}. */
  perPerson: number;
  balances: MemberBalance[];
  settlements: Settlement[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const EPSILON = 0.005;

/**
 * Greedy minimal settlement: repeatedly send money from the largest debtor to
 * the largest creditor until everyone is within a cent of zero.
 */
export function settleUp(balances: MemberBalance[]): Settlement[] {
  const creditors = balances
    .filter((b) => b.net > EPSILON)
    .map((b) => ({ id: b.memberId, amt: b.net }))
    .sort((a, b) => b.amt - a.amt);
  const debtors = balances
    .filter((b) => b.net < -EPSILON)
    .map((b) => ({ id: b.memberId, amt: -b.net }))
    .sort((a, b) => b.amt - a.amt);

  const settlements: Settlement[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!;
    const creditor = creditors[j]!;
    const pay = Math.min(debtor.amt, creditor.amt);
    if (pay > EPSILON) {
      settlements.push({ from: debtor.id, to: creditor.id, amount: round2(pay) });
    }
    debtor.amt -= pay;
    creditor.amt -= pay;
    if (debtor.amt <= EPSILON) i++;
    if (creditor.amt <= EPSILON) j++;
  }
  return settlements;
}

/**
 * Summarise who paid what and who owes whom.
 *
 * @param items        inventory items (only claimed items with a cost count as paid)
 * @param participants member ids that share the cost (usually all room members)
 */
export function summarizeBudget(items: InventoryItem[], participants: string[]): BudgetSummary {
  const estimatedTotal = round2(items.reduce((sum, i) => sum + (i.cost ?? 0), 0));

  const paidByMember = new Map<string, number>();
  let total = 0;
  for (const item of items) {
    if (item.claimedBy && item.cost) {
      paidByMember.set(item.claimedBy, (paidByMember.get(item.claimedBy) ?? 0) + item.cost);
      total += item.cost;
    }
  }
  total = round2(total);

  const n = participants.length;
  const perPerson = n === 0 ? 0 : round2(total / n);

  const balances: MemberBalance[] = participants.map((memberId) => {
    const paid = round2(paidByMember.get(memberId) ?? 0);
    const share = n === 0 ? 0 : total / n;
    return { memberId, paid, share: round2(share), net: round2(paid - share) };
  });

  return { total, estimatedTotal, perPerson, balances, settlements: settleUp(balances) };
}
