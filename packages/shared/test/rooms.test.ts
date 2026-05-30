import { describe, expect, it } from 'vitest';
import {
  addMember,
  createRoom,
  emptyRoomState,
  findMember,
  isMember,
  isProtected,
  linkGoogleAccount,
  linkGoogleProfile,
  removeMember,
  renameMember,
  rotateInviteToken,
} from '../src/rooms.js';
import { verifyPassword } from '../src/password.js';

const fixedNow = () => new Date('2026-05-29T12:00:00Z');

describe('createRoom', () => {
  it('creates a room with an owner member', async () => {
    const { room, owner } = await createRoom({
      name: 'Ski Trip',
      ownerName: 'Alice',
      now: fixedNow,
    });
    expect(room.name).toBe('Ski Trip');
    expect(room.slug).toMatch(/^[a-z2-9]{6}$/);
    expect(room.inviteToken).toBeTruthy();
    expect(room.members).toEqual([owner]);
    expect(owner.role).toBe('owner');
    expect(room.createdBy).toBe(owner.id);
    expect(isProtected(room)).toBe(false);
  });

  it('hashes an optional password', async () => {
    const { room } = await createRoom({
      name: 'Secret',
      ownerName: 'Bob',
      password: 'hunter2',
      now: fixedNow,
    });
    expect(isProtected(room)).toBe(true);
    expect(room.passwordHash).toBeDefined();
    expect(await verifyPassword('hunter2', room.passwordHash!)).toBe(true);
    expect(await verifyPassword('nope', room.passwordHash!)).toBe(false);
  });

  it('trims and validates names', async () => {
    await expect(createRoom({ name: '  ', ownerName: 'A' })).rejects.toThrow(/Room name/);
    await expect(createRoom({ name: 'X', ownerName: '  ' })).rejects.toThrow(/Owner name/);
  });

  it('applies setting overrides', async () => {
    const { room } = await createRoom({
      name: 'X',
      ownerName: 'A',
      settings: { defaultSlotMinutes: 60 },
    });
    expect(room.settings.defaultSlotMinutes).toBe(60);
    expect(room.settings.openJoin).toBe(true);
  });

  it('honours a normalised custom slug, falling back to random when unusable', async () => {
    const custom = await createRoom({ name: 'Trip', ownerName: 'A', slug: 'Summer BBQ!' });
    expect(custom.room.slug).toBe('summer-bbq');

    // Too short / unusable → a generated slug is used instead.
    const fallback = await createRoom({ name: 'Trip', ownerName: 'A', slug: '!!' });
    expect(fallback.room.slug).toMatch(/^[23456789abcdefghjkmnpqrstvwxyz]{6}$/);
  });
});

describe('membership', () => {
  it('adds members with distinct colours and member role', async () => {
    const { room } = await createRoom({ name: 'X', ownerName: 'Alice', now: fixedNow });
    const { room: r2, member: bob } = addMember(room, { name: 'Bob', now: fixedNow });
    expect(r2.members).toHaveLength(2);
    expect(bob.role).toBe('member');
    expect(bob.color).not.toBe(room.members[0]!.color);
    expect(isMember(r2, bob.id)).toBe(true);
    expect(findMember(r2, bob.id)?.name).toBe('Bob');
  });

  it('renames and links google accounts immutably', async () => {
    const { room, owner } = await createRoom({ name: 'X', ownerName: 'Alice', now: fixedNow });
    const renamed = renameMember(room, owner.id, 'Alice B');
    expect(renamed.members[0]!.name).toBe('Alice B');
    expect(room.members[0]!.name).toBe('Alice'); // original untouched

    const linked = linkGoogleAccount(renamed, owner.id, 'alice@example.com');
    expect(linked.members[0]!.googleEmail).toBe('alice@example.com');
  });

  it('links a full google profile (email, avatar, name)', async () => {
    const { room, owner } = await createRoom({ name: 'X', ownerName: 'Alice', now: fixedNow });
    const linked = linkGoogleProfile(room, owner.id, {
      email: 'alice@example.com',
      name: 'Alice Wonderland',
      avatarUrl: 'https://img/a.png',
    });
    expect(linked.members[0]).toMatchObject({
      googleEmail: 'alice@example.com',
      name: 'Alice Wonderland',
      avatarUrl: 'https://img/a.png',
    });
    // Keeps the existing name when the profile omits one.
    const noName = linkGoogleProfile(room, owner.id, { email: 'a@b.com' });
    expect(noName.members[0]!.name).toBe('Alice');
  });

  it('removes members but never the owner', async () => {
    const { room, owner } = await createRoom({ name: 'X', ownerName: 'Alice', now: fixedNow });
    const { room: r2, member: bob } = addMember(room, { name: 'Bob' });
    const r3 = removeMember(r2, bob.id);
    expect(isMember(r3, bob.id)).toBe(false);
    expect(() => removeMember(r3, owner.id)).toThrow(/owner/);
  });
});

describe('invite token rotation', () => {
  it('produces a new token', async () => {
    const { room } = await createRoom({ name: 'X', ownerName: 'Alice' });
    const rotated = rotateInviteToken(room);
    expect(rotated.inviteToken).not.toBe(room.inviteToken);
  });
});

describe('emptyRoomState', () => {
  it('wraps a room in empty collections', async () => {
    const { room } = await createRoom({ name: 'X', ownerName: 'Alice' });
    const state = emptyRoomState(room);
    expect(state.polls).toEqual([]);
    expect(state.inventory).toEqual([]);
    expect(state.activities).toEqual([]);
    expect(state.events).toEqual([]);
    expect(state.doodle.strokes).toEqual([]);
    expect(state.doodle.roomId).toBe(room.id);
  });
});
