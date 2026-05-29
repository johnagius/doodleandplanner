/**
 * Room templates — opinionated starting points that pre-fill a new room with
 * categorised inventory and suggested activities, so a group isn't staring at a
 * blank room. Pure: `applyTemplate` returns a new RoomState.
 */
import { createActivity } from './activities.js';
import { createItem } from './inventory.js';
import type { RoomState } from './types.js';

export interface TemplateItem {
  name: string;
  category: string;
  quantity?: number;
}

export interface RoomTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  items: TemplateItem[];
  activities: string[];
}

export const ROOM_TEMPLATES: RoomTemplate[] = [
  {
    id: 'blank',
    name: 'Blank room',
    icon: '📄',
    description: 'Start from scratch.',
    items: [],
    activities: [],
  },
  {
    id: 'camping',
    name: 'Camping trip',
    icon: '🏕️',
    description: 'Tents, food and the great outdoors.',
    items: [
      { name: 'Tent', category: 'Gear' },
      { name: 'Sleeping bags', category: 'Gear', quantity: 4 },
      { name: 'Camping stove', category: 'Gear' },
      { name: 'Torches', category: 'Gear', quantity: 4 },
      { name: 'Firewood', category: 'Gear' },
      { name: 'Breakfast', category: 'Food' },
      { name: 'Marshmallows', category: 'Food' },
      { name: 'Water', category: 'Food' },
      { name: 'First-aid kit', category: 'Safety' },
    ],
    activities: ['Hiking', 'Campfire & s’mores', 'Stargazing', 'Swimming'],
  },
  {
    id: 'birthday',
    name: 'Birthday party',
    icon: '🎂',
    description: 'Cake, decorations and good vibes.',
    items: [
      { name: 'Cake', category: 'Food' },
      { name: 'Candles', category: 'Food' },
      { name: 'Drinks', category: 'Food' },
      { name: 'Snacks', category: 'Food' },
      { name: 'Balloons', category: 'Decorations' },
      { name: 'Banner', category: 'Decorations' },
      { name: 'Speaker / playlist', category: 'Entertainment' },
      { name: 'Plates & cups', category: 'Supplies' },
    ],
    activities: ['Games', 'Cake & speeches', 'Dancing', 'Group photo'],
  },
  {
    id: 'dinner',
    name: 'Dinner party',
    icon: '🍽️',
    description: 'A shared meal with friends.',
    items: [
      { name: 'Starter', category: 'Food' },
      { name: 'Main course', category: 'Food' },
      { name: 'Dessert', category: 'Food' },
      { name: 'Wine', category: 'Drinks' },
      { name: 'Soft drinks', category: 'Drinks' },
      { name: 'Bread', category: 'Food' },
    ],
    activities: ['Apéritif', 'Board games', 'Coffee & chat'],
  },
  {
    id: 'gamenight',
    name: 'Game night',
    icon: '🎲',
    description: 'Board games and snacks.',
    items: [
      { name: 'Board games', category: 'Games', quantity: 3 },
      { name: 'Cards', category: 'Games' },
      { name: 'Snacks', category: 'Food' },
      { name: 'Drinks', category: 'Food' },
      { name: 'Pizza', category: 'Food' },
    ],
    activities: ['Warm-up card game', 'Main board game', 'Tournament finale'],
  },
  {
    id: 'citybreak',
    name: 'City break',
    icon: '🏙️',
    description: 'A weekend away exploring.',
    items: [
      { name: 'Accommodation booking', category: 'Logistics' },
      { name: 'Train / flight tickets', category: 'Logistics' },
      { name: 'City map / guide', category: 'Logistics' },
      { name: 'Comfortable shoes', category: 'Personal' },
      { name: 'Power bank', category: 'Personal' },
    ],
    activities: ['Walking tour', 'Museum visit', 'Local restaurant', 'Rooftop drinks'],
  },
];

export function findTemplate(id: string): RoomTemplate | undefined {
  return ROOM_TEMPLATES.find((t) => t.id === id);
}

/**
 * Return a new RoomState with the template's items and activities added.
 * `proposedBy` attributes the seeded activities (usually the owner's id).
 */
export function applyTemplate(
  state: RoomState,
  template: RoomTemplate,
  proposedBy: string,
  now: () => Date = () => new Date(),
): RoomState {
  const roomId = state.room.id;
  const inventory = template.items.map((i) =>
    createItem({ roomId, name: i.name, category: i.category, quantity: i.quantity, now }),
  );
  const activities = template.activities.map((title) =>
    createActivity({ roomId, title, proposedBy, now }),
  );
  return {
    ...state,
    inventory: [...state.inventory, ...inventory],
    activities: [...state.activities, ...activities],
  };
}
