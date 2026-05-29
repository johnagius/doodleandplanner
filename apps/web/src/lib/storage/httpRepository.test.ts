import { createRoom, emptyRoomState, type RoomState } from '@dap/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpRepository, type SocketLike } from './httpRepository.js';
import { RoomExistsError } from './repository.js';

/** A controllable fake WebSocket. */
class FakeSocket implements SocketLike {
  static last: FakeSocket | null = null;
  closed = false;
  private handlers: Record<string, ((ev: { data: unknown }) => void)[]> = {};
  constructor(public url: string) {
    FakeSocket.last = this;
  }
  addEventListener(type: string, cb: (ev: { data: unknown }) => void): void {
    (this.handlers[type] ??= []).push(cb as (ev: { data: unknown }) => void);
  }
  close(): void {
    this.closed = true;
    this.handlers['close']?.forEach((cb) => cb({ data: undefined }));
  }
  /** Simulate a server push. */
  receive(data: unknown): void {
    this.handlers['message']?.forEach((cb) => cb({ data: JSON.stringify(data) }));
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function makeState(): Promise<RoomState> {
  const { room } = await createRoom({ name: 'Trip', ownerName: 'Ann' });
  return emptyRoomState(room);
}

describe('HttpRepository', () => {
  let store: Storage;

  beforeEach(() => {
    localStorage.clear();
    store = localStorage;
    FakeSocket.last = null;
  });

  function build(fetchFn: typeof fetch) {
    return new HttpRepository('https://api.example.com', {
      store,
      fetchFn,
      makeSocket: (url) => new FakeSocket(url),
    });
  }

  it('POSTs to create a room and remembers it locally', async () => {
    const state = await makeState();
    const fetchFn = vi.fn(async () => jsonResponse(state, 201)) as unknown as typeof fetch;
    const repo = build(fetchFn);

    await repo.createRoom(state);

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.com/api/rooms',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await repo.listRooms()).toHaveLength(1);
  });

  it('maps a 409 to RoomExistsError', async () => {
    const state = await makeState();
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: 'exists' }, 409),
    ) as unknown as typeof fetch;
    await expect(build(fetchFn).createRoom(state)).rejects.toBeInstanceOf(RoomExistsError);
  });

  it('returns null for a 404 on getRoom', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}, 404)) as unknown as typeof fetch;
    expect(await build(fetchFn).getRoom('missing')).toBeNull();
  });

  it('PUTs on save and notifies local subscribers', async () => {
    const state = await makeState();
    const fetchFn = vi.fn(async () => jsonResponse(state)) as unknown as typeof fetch;
    const repo = build(fetchFn);
    const seen: RoomState[] = [];
    repo.subscribe(state.room.slug, (s) => seen.push(s));

    await repo.saveRoom(state);

    expect(fetchFn).toHaveBeenCalledWith(
      `https://api.example.com/api/rooms/${state.room.slug}`,
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(seen).toHaveLength(1);
  });

  it('opens a ws://-upgraded socket and forwards server pushes', async () => {
    const state = await makeState();
    const fetchFn = vi.fn(async () => jsonResponse(state)) as unknown as typeof fetch;
    const repo = build(fetchFn);
    const seen: RoomState[] = [];
    const unsub = repo.subscribe(state.room.slug, (s) => seen.push(s));

    expect(FakeSocket.last?.url).toBe(`wss://api.example.com/api/rooms/${state.room.slug}/ws`);

    const incoming = { ...state, room: { ...state.room, name: 'Pushed' } };
    FakeSocket.last!.receive(incoming);
    expect(seen.at(-1)?.room.name).toBe('Pushed');

    unsub();
    expect(FakeSocket.last?.closed).toBe(true);
  });
});
