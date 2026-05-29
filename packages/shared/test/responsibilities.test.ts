import { describe, expect, it } from 'vitest';
import { createActivity, toggleInterest } from '../src/activities.js';
import { createEvent, setRsvp } from '../src/events.js';
import { createExpense } from '../src/expenses.js';
import { claimItem, createItem } from '../src/inventory.js';
import { summarizeResponsibilities } from '../src/responsibilities.js';

describe('summarizeResponsibilities', () => {
  it('rolls up bringing / keenOn / going / net per member', () => {
    const tent = claimItem(createItem({ roomId: 'r', name: 'Tent', cost: 60 }), 'a');
    const food = createItem({ roomId: 'r', name: 'Food' }); // unclaimed
    const hike = toggleInterest(
      createActivity({ roomId: 'r', title: 'Hike', proposedBy: 'a' }),
      'a',
    );
    let dinner = createEvent({
      roomId: 'r',
      title: 'Dinner',
      start: '2026-06-01T18:00:00Z',
      end: '2026-06-01T20:00:00Z',
    });
    dinner = setRsvp(dinner, 'a', 'going');
    dinner = setRsvp(dinner, 'b', 'declined');

    const result = summarizeResponsibilities({
      memberIds: ['a', 'b'],
      inventory: [tent, food],
      activities: [hike],
      events: [dinner],
      expenses: [],
    });
    const a = result.find((r) => r.memberId === 'a')!;
    const b = result.find((r) => r.memberId === 'b')!;

    expect(a.bringing.map((i) => i.name)).toEqual(['Tent']);
    expect(a.keenOn.map((x) => x.title)).toEqual(['Hike']);
    expect(a.going.map((e) => e.title)).toEqual(['Dinner']);
    // a paid 60 for an item split across 2 → owed 30.
    expect(a.net).toBeCloseTo(30, 2);

    expect(b.bringing).toEqual([]);
    expect(b.going).toEqual([]); // declined, not going
    expect(b.net).toBeCloseTo(-30, 2);
  });

  it('includes expenses in the net balance', () => {
    const exp = createExpense({ roomId: 'r', description: 'Cabin', amount: 100, paidBy: 'a' });
    const result = summarizeResponsibilities({
      memberIds: ['a', 'b'],
      inventory: [],
      activities: [],
      events: [],
      expenses: [exp],
    });
    expect(result.find((r) => r.memberId === 'a')!.net).toBeCloseTo(50, 2);
    expect(result.find((r) => r.memberId === 'b')!.net).toBeCloseTo(-50, 2);
  });

  it('handles a member with nothing assigned', () => {
    const [solo] = summarizeResponsibilities({
      memberIds: ['x'],
      inventory: [],
      activities: [],
      events: [],
      expenses: [],
    });
    expect(solo).toMatchObject({ bringing: [], keenOn: [], going: [], net: 0 });
  });
});
