/** Room creation and membership logic. All mutators return new objects. */
import { colorForIndex } from './color.js';
import { generateId, generateSlug, generateToken } from './ids.js';
import { hashPassword } from './password.js';
import type { Member, Room, RoomSettings, RoomState } from './types.js';

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  openJoin: true,
  defaultSlotMinutes: 90,
  workingHours: { startHour: 9, endHour: 22 },
  currency: 'EUR',
};

export interface CreateRoomInput {
  name: string;
  description?: string;
  ownerName: string;
  /** Optional plaintext password; hashed before storage. */
  password?: string;
  settings?: Partial<RoomSettings>;
  now?: () => Date;
}

export interface CreateRoomResult {
  room: Room;
  owner: Member;
}

export async function createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
  const name = input.name.trim();
  const ownerName = input.ownerName.trim();
  if (!name) throw new Error('Room name is required');
  if (!ownerName) throw new Error('Owner name is required');

  const now = (input.now ?? (() => new Date()))().toISOString();
  const owner: Member = {
    id: generateId('mem'),
    name: ownerName,
    color: colorForIndex(0),
    role: 'owner',
    joinedAt: now,
  };

  const room: Room = {
    id: generateId('room'),
    slug: generateSlug(),
    name,
    description: input.description?.trim() || undefined,
    createdAt: now,
    createdBy: owner.id,
    inviteToken: generateToken(),
    passwordHash: input.password ? await hashPassword(input.password) : undefined,
    members: [owner],
    settings: { ...DEFAULT_ROOM_SETTINGS, ...input.settings },
  };

  return { room, owner };
}

/** Build a fresh, empty RoomState around a newly created room. */
export function emptyRoomState(room: Room): RoomState {
  return {
    room,
    polls: [],
    inventory: [],
    activities: [],
    events: [],
    doodle: { id: generateId('doodle'), roomId: room.id, strokes: [] },
    messages: [],
    availability: [],
  };
}

export function isMember(room: Room, memberId: string): boolean {
  return room.members.some((m) => m.id === memberId);
}

export function findMember(room: Room, memberId: string): Member | undefined {
  return room.members.find((m) => m.id === memberId);
}

export function isProtected(room: Pick<Room, 'passwordHash'>): boolean {
  return room.passwordHash !== undefined;
}

export interface JoinRoomInput {
  name: string;
  now?: () => Date;
}

/** Add a new member to the room. Returns the updated room and the new member. */
export function addMember(room: Room, input: JoinRoomInput): { room: Room; member: Member } {
  const name = input.name.trim();
  if (!name) throw new Error('Member name is required');

  const now = (input.now ?? (() => new Date()))().toISOString();
  const member: Member = {
    id: generateId('mem'),
    name,
    color: colorForIndex(room.members.length),
    role: 'member',
    joinedAt: now,
  };
  return { room: { ...room, members: [...room.members, member] }, member };
}

export function renameMember(room: Room, memberId: string, name: string): Room {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Member name is required');
  return {
    ...room,
    members: room.members.map((m) => (m.id === memberId ? { ...m, name: trimmed } : m)),
  };
}

export function linkGoogleAccount(room: Room, memberId: string, googleEmail: string): Room {
  return {
    ...room,
    members: room.members.map((m) => (m.id === memberId ? { ...m, googleEmail } : m)),
  };
}

export interface GoogleProfileLink {
  email: string;
  name?: string;
  avatarUrl?: string;
}

/** Link a member's full Google profile: email, optional avatar, and name. */
export function linkGoogleProfile(room: Room, memberId: string, profile: GoogleProfileLink): Room {
  return {
    ...room,
    members: room.members.map((m) =>
      m.id === memberId
        ? {
            ...m,
            googleEmail: profile.email,
            avatarUrl: profile.avatarUrl ?? m.avatarUrl,
            name: profile.name?.trim() || m.name,
          }
        : m,
    ),
  };
}

export function removeMember(room: Room, memberId: string): Room {
  const target = findMember(room, memberId);
  if (target?.role === 'owner') throw new Error('Cannot remove the room owner');
  return { ...room, members: room.members.filter((m) => m.id !== memberId) };
}

/** Rotate the invite token, invalidating all previously shared links. */
export function rotateInviteToken(room: Room): Room {
  return { ...room, inviteToken: generateToken() };
}
