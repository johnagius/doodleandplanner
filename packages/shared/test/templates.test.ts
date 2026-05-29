import { describe, expect, it } from 'vitest';
import { createRoom, emptyRoomState } from '../src/rooms.js';
import { ROOM_TEMPLATES, applyTemplate, findTemplate } from '../src/templates.js';

const now = () => new Date('2026-05-29T12:00:00Z');

describe('templates', () => {
  it('exposes a blank template and several presets', () => {
    expect(findTemplate('blank')?.items).toEqual([]);
    expect(ROOM_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    expect(findTemplate('camping')).toBeTruthy();
    expect(findTemplate('nope')).toBeUndefined();
  });

  it('applies a template, seeding categorised items and activities', async () => {
    const { room, owner } = await createRoom({ name: 'X', ownerName: 'A', now });
    const camping = findTemplate('camping')!;
    const next = applyTemplate(emptyRoomState(room), camping, owner.id, now);

    expect(next.inventory.length).toBe(camping.items.length);
    expect(next.activities.length).toBe(camping.activities.length);
    expect(next.inventory.every((i) => i.roomId === room.id)).toBe(true);
    expect(next.inventory.some((i) => i.category === 'Gear')).toBe(true);
    expect(next.activities.every((a) => a.proposedBy === owner.id)).toBe(true);
  });

  it('appends to existing content without dropping it', async () => {
    const { room, owner } = await createRoom({ name: 'X', ownerName: 'A', now });
    const base = emptyRoomState(room);
    const withOne = { ...base, inventory: [{ id: 'x' } as never] };
    const next = applyTemplate(withOne, findTemplate('dinner')!, owner.id, now);
    expect(next.inventory.length).toBe(1 + findTemplate('dinner')!.items.length);
  });

  it('blank template adds nothing', async () => {
    const { room, owner } = await createRoom({ name: 'X', ownerName: 'A', now });
    const next = applyTemplate(emptyRoomState(room), findTemplate('blank')!, owner.id, now);
    expect(next.inventory).toEqual([]);
    expect(next.activities).toEqual([]);
  });
});
