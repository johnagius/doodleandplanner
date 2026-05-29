import { createRoom, emptyRoomState, type RoomState } from '@dap/shared';
import { describe, expect, it } from 'vitest';
import { parseRoomFile, serializeRoom } from './roomFile.js';

async function state(): Promise<RoomState> {
  const { room } = await createRoom({ name: 'Trip', ownerName: 'Ann' });
  return emptyRoomState(room);
}

describe('room file serialize/parse', () => {
  it('round-trips a room', async () => {
    const original = await state();
    const restored = parseRoomFile(serializeRoom(original));
    expect(restored.room.slug).toBe(original.room.slug);
    expect(restored.room.name).toBe('Trip');
    expect(restored.doodle.roomId).toBe(original.room.id);
  });

  it('writes a versioned, app-tagged envelope', async () => {
    const file = JSON.parse(serializeRoom(await state()));
    expect(file.app).toBe('doodleandplanner');
    expect(file.version).toBe(1);
    expect(typeof file.exportedAt).toBe('string');
  });

  it('rejects invalid JSON, foreign files and malformed state', () => {
    expect(() => parseRoomFile('{not json')).toThrow(/valid JSON/);
    expect(() => parseRoomFile(JSON.stringify({ app: 'other', state: {} }))).toThrow(/Doodle/);
    expect(() => parseRoomFile(JSON.stringify({ app: 'doodleandplanner' }))).toThrow(/Doodle/);
    expect(() =>
      parseRoomFile(JSON.stringify({ app: 'doodleandplanner', version: 1, state: { room: {} } })),
    ).toThrow(/malformed/);
  });
});
