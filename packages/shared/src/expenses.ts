/**
 * Shared expenses (Splitwise-style) and a combined ledger.
 *
 * An expense is paid by one member and split across a chosen set (or everyone).
 * `combineLedger` merges inventory item costs *and* expenses into one set of
 * per-member balances, then reuses {@link settleUp} for minimal transfers.
 */
import { settleUp, type MemberBalance, type Settlement } from './budget.js';
import { generateId } from './ids.js';
import type { Expense, InventoryItem } from './types.js';

export interface CreateExpenseInput {
  roomId: string;
  description: string;
  amount: number;
  paidBy: string;
  /** Members to split across; empty/undefined ⇒ everyone (resolved later). */
  sharedWith?: string[];
  category?: string;
  now?: () => Date;
}

export function createExpense(input: CreateExpenseInput): Expense {
  const description = input.description.trim();
  if (!description) throw new Error('Expense needs a description');
  if (!(input.amount > 0)) throw new Error('Amount must be greater than zero');
  if (!input.paidBy) throw new Error('Expense needs a payer');
  return {
    id: generateId('exp'),
    roomId: input.roomId,
    description,
    amount: input.amount,
    paidBy: input.paidBy,
    sharedWith: input.sharedWith ? [...new Set(input.sharedWith)] : [],
    category: input.category?.trim() || undefined,
    createdAt: (input.now ?? (() => new Date()))().toISOString(),
  };
}

export function updateExpense(
  expense: Expense,
  patch: Partial<Pick<Expense, 'description' | 'amount' | 'paidBy' | 'sharedWith' | 'category'>>,
): Expense {
  const next = { ...expense, ...patch };
  if (patch.description !== undefined) {
    const d = patch.description.trim();
    if (!d) throw new Error('Expense needs a description');
    next.description = d;
  }
  if (patch.amount !== undefined && !(patch.amount > 0)) {
    throw new Error('Amount must be greater than zero');
  }
  return next;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface LedgerEntry {
  /** Source of the charge, for an itemised breakdown. */
  kind: 'expense' | 'item';
  description: string;
  amount: number;
  paidBy: string;
  sharedWith: string[];
}

export interface LedgerSummary {
  /** Grand total of all paid charges (expenses + claimed item costs). */
  total: number;
  perPerson: number;
  balances: MemberBalance[];
  settlements: Settlement[];
  entries: LedgerEntry[];
}

/**
 * Build a combined ledger from expenses + claimed inventory costs.
 *
 * - Expenses split across `sharedWith`, or all `participants` if empty.
 * - Claimed inventory items with a cost are treated as paid by the claimer and
 *   split across everyone (matching the simple budget behaviour).
 */
export function combineLedger(
  expenses: Expense[],
  items: InventoryItem[],
  participants: string[],
): LedgerSummary {
  const paid = new Map<string, number>();
  const owed = new Map<string, number>();
  const entries: LedgerEntry[] = [];
  let total = 0;

  const addOwed = (memberId: string, amount: number) =>
    owed.set(memberId, (owed.get(memberId) ?? 0) + amount);
  const addPaid = (memberId: string, amount: number) =>
    paid.set(memberId, (paid.get(memberId) ?? 0) + amount);

  for (const exp of expenses) {
    if (!(exp.amount > 0)) continue;
    const split = exp.sharedWith.length > 0 ? exp.sharedWith : participants;
    if (split.length === 0) continue;
    addPaid(exp.paidBy, exp.amount);
    const share = exp.amount / split.length;
    for (const m of split) addOwed(m, share);
    total += exp.amount;
    entries.push({
      kind: 'expense',
      description: exp.description,
      amount: exp.amount,
      paidBy: exp.paidBy,
      sharedWith: [...split],
    });
  }

  for (const item of items) {
    if (!item.claimedBy || !item.cost) continue;
    if (participants.length === 0) continue;
    addPaid(item.claimedBy, item.cost);
    const share = item.cost / participants.length;
    for (const m of participants) addOwed(m, share);
    total += item.cost;
    entries.push({
      kind: 'item',
      description: item.name,
      amount: item.cost,
      paidBy: item.claimedBy,
      sharedWith: [...participants],
    });
  }

  total = round2(total);
  const n = participants.length;
  const perPerson = n === 0 ? 0 : round2(total / n);

  const balances: MemberBalance[] = participants.map((memberId) => {
    const p = round2(paid.get(memberId) ?? 0);
    const share = round2(owed.get(memberId) ?? 0);
    return { memberId, paid: p, share, net: round2(p - share) };
  });

  return { total, perPerson, balances, settlements: settleUp(balances), entries };
}
