/** "Who brings what" inventory checklist logic. */
import { generateId } from './ids.js';
import type { InventoryItem, ItemStatus } from './types.js';

export interface CreateItemInput {
  roomId: string;
  name: string;
  quantity?: number;
  category?: string;
  notes?: string;
  cost?: number;
  now?: () => Date;
}

export function createItem(input: CreateItemInput): InventoryItem {
  const name = input.name.trim();
  if (!name) throw new Error('Item name is required');
  const quantity = input.quantity ?? 1;
  if (quantity < 1) throw new Error('Quantity must be at least 1');
  if (input.cost !== undefined && input.cost < 0) throw new Error('Cost cannot be negative');

  return {
    id: generateId('item'),
    roomId: input.roomId,
    name,
    quantity,
    category: input.category?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    cost: input.cost,
    claimedBy: undefined,
    status: 'needed',
    createdAt: (input.now ?? (() => new Date()))().toISOString(),
  };
}

export function claimItem(item: InventoryItem, memberId: string): InventoryItem {
  return { ...item, claimedBy: memberId, status: 'claimed' };
}

export function releaseItem(item: InventoryItem): InventoryItem {
  return { ...item, claimedBy: undefined, status: 'needed' };
}

export function setItemStatus(item: InventoryItem, status: ItemStatus): InventoryItem {
  if (status === 'needed') return releaseItem(item);
  return { ...item, status };
}

export function updateItem(
  item: InventoryItem,
  patch: Partial<Pick<InventoryItem, 'name' | 'quantity' | 'category' | 'notes' | 'cost'>>,
): InventoryItem {
  const next = { ...item, ...patch };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error('Item name is required');
    next.name = name;
  }
  if (patch.quantity !== undefined && patch.quantity < 1) {
    throw new Error('Quantity must be at least 1');
  }
  if (patch.cost !== undefined && patch.cost !== null && patch.cost < 0) {
    throw new Error('Cost cannot be negative');
  }
  return next;
}

export interface InventorySummary {
  total: number;
  needed: number;
  claimed: number;
  done: number;
  /** Items claimed, grouped by member id. */
  byMember: Record<string, InventoryItem[]>;
  /** Percentage of items that are claimed or done (0-100). */
  coverage: number;
}

export function summarizeInventory(items: InventoryItem[]): InventorySummary {
  const byMember: Record<string, InventoryItem[]> = {};
  let needed = 0;
  let claimed = 0;
  let done = 0;
  for (const item of items) {
    if (item.status === 'needed') needed++;
    else if (item.status === 'claimed') claimed++;
    else done++;
    if (item.claimedBy) (byMember[item.claimedBy] ??= []).push(item);
  }
  const total = items.length;
  const coverage = total === 0 ? 0 : Math.round(((claimed + done) / total) * 100);
  return { total, needed, claimed, done, byMember, coverage };
}
