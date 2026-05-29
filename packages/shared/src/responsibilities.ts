/**
 * Per-member responsibility rollup: a single view of what each person has taken
 * on across the room — items they'll bring, their money balance, the activities
 * they're keen on, and the events they've said yes to.
 */
import { combineLedger } from './expenses.js';
import { tallyRsvps } from './events.js';
import type { Activity, Expense, InventoryItem, PlannedEvent } from './types.js';

export interface MemberResponsibilities {
  memberId: string;
  /** Inventory items this member has claimed. */
  bringing: InventoryItem[];
  /** Activities this member is interested in. */
  keenOn: Activity[];
  /** Events this member has RSVP'd "going" to. */
  going: PlannedEvent[];
  /** Net money position: positive ⇒ owed, negative ⇒ owes, 0 ⇒ settled. */
  net: number;
}

export interface ResponsibilitiesInput {
  memberIds: string[];
  inventory: InventoryItem[];
  activities: Activity[];
  events: PlannedEvent[];
  expenses: Expense[];
}

/** Build the responsibility rollup for every member id supplied. */
export function summarizeResponsibilities(input: ResponsibilitiesInput): MemberResponsibilities[] {
  const ledger = combineLedger(input.expenses, input.inventory, input.memberIds);
  const netByMember = new Map(ledger.balances.map((b) => [b.memberId, b.net]));

  return input.memberIds.map((memberId) => {
    const bringing = input.inventory.filter((i) => i.claimedBy === memberId);
    const keenOn = input.activities.filter((a) => a.interested.includes(memberId));
    const going = input.events.filter((e) => tallyRsvps(e, [memberId]).going.includes(memberId));
    return {
      memberId,
      bringing,
      keenOn,
      going,
      net: netByMember.get(memberId) ?? 0,
    };
  });
}
