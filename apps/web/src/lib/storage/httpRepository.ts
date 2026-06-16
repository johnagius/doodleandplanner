import { migrateRoomState, type RoomState } from '@dap/shared';
import { type Repository, RoomExistsError, type RoomSummary } from './repository.js';
import { saveHeaders } from './saveHeaders.js';

/** Thrown when the Worker rejects a save because it would change a claimed name's
 * picks without that name's verified session (someone else's, or an expired one). */
export class SaveLockedError extends Error {
  constructor() {
    super('locked');
    this.name = 'SaveLockedError';
  }
}

type Listener = (state: RoomState) => void;

/** Minimal WebSocket surface so a fake can be injected in tests. */
export interface SocketLike {
  send?(data: string): void;
  close(): void;
  addEventListener(type: 'message', cb: (ev: { data: unknown }) => void): void;
  addEventListener(type: 'close' | 'error', cb: () => void): void;
}

export interface HttpRepositoryOptions {
  store?: Storage;
  fetchFn?: typeof fetch;
  makeSocket?: (url: string) => SocketLike;
}

const INDEX_KEY = 'dap:remote-rooms';

/**
 * Repository backed by the Cloudflare Worker: REST for read/write and a
 * WebSocket per room for live updates. A small local index remembers which
 * rooms this device has visited so the home screen can list them.
 */
type PresenceListener = (payload: unknown) => void;

export class HttpRepository implements Repository {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly presenceListeners = new Map<string, Set<PresenceListener>>();
  private readonly sockets = new Map<string, SocketLike>();
  private readonly store: Storage;
  private readonly fetchFn: typeof fetch;
  private readonly makeSocket: (url: string) => SocketLike;

  constructor(
    private readonly apiBase: string,
    options: HttpRepositoryOptions = {},
  ) {
    this.store = options.store ?? globalThis.localStorage;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.makeSocket = options.makeSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike);
  }

  private url(path: string): string {
    return `${this.apiBase.replace(/\/$/, '')}${path}`;
  }

  async createRoom(state: RoomState): Promise<void> {
    const res = await this.fetchFn(this.url('/api/rooms'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    if (res.status === 409) throw new RoomExistsError(state.room.slug);
    if (!res.ok) throw new Error(`Could not create room (${res.status})`);
    this.remember(state);
  }

  async getRoom(slug: string): Promise<RoomState | null> {
    const res = await this.fetchFn(this.url(`/api/rooms/${encodeURIComponent(slug)}`));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Could not load room (${res.status})`);
    const state = migrateRoomState(await res.json());
    this.remember(state);
    return state;
  }

  async saveRoom(state: RoomState): Promise<RoomState> {
    const res = await this.fetchFn(this.url(`/api/rooms/${encodeURIComponent(state.room.slug)}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...saveHeaders() },
      body: JSON.stringify(state),
    });
    if (res.status === 403) throw new SaveLockedError();
    if (!res.ok) throw new Error(`Could not save room (${res.status})`);
    const saved = (await res.json()) as RoomState;
    this.remember(saved);
    this.emit(saved);
    return saved;
  }

  async deleteRoom(slug: string): Promise<void> {
    this.sockets.get(slug)?.close();
    this.sockets.delete(slug);
    this.safeSetIndex(this.readIndex().filter((r) => r.slug !== slug));
  }

  async listRooms(): Promise<RoomSummary[]> {
    return this.readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  subscribe(slug: string, listener: Listener): () => void {
    const set = this.listeners.get(slug) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(slug, set);
    this.ensureSocket(slug);
    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(slug);
        this.sockets.get(slug)?.close();
        this.sockets.delete(slug);
      }
    };
  }

  private ensureSocket(slug: string): void {
    if (this.sockets.has(slug)) return;
    const wsBase = this.apiBase.replace(/^http/, 'ws').replace(/\/$/, '');
    const socket = this.makeSocket(`${wsBase}/api/rooms/${encodeURIComponent(slug)}/ws`);
    socket.addEventListener('message', (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as unknown;
        if (data && typeof data === 'object' && '__presence' in data) {
          const payload = (data as { __presence: unknown }).__presence;
          this.presenceListeners.get(slug)?.forEach((l) => l(payload));
          return;
        }
        const state = migrateRoomState(data);
        this.remember(state);
        this.emit(state);
      } catch {
        /* ignore malformed frames */
      }
    });
    socket.addEventListener('close', () => this.sockets.delete(slug));
    this.sockets.set(slug, socket);
  }

  publishPresence(slug: string, payload: unknown): void {
    this.ensureSocket(slug);
    try {
      this.sockets.get(slug)?.send?.(JSON.stringify({ __presence: payload }));
    } catch {
      /* socket not open yet — fine for high-frequency cursor frames */
    }
  }

  subscribePresence(slug: string, listener: PresenceListener): () => void {
    const set = this.presenceListeners.get(slug) ?? new Set<PresenceListener>();
    set.add(listener);
    this.presenceListeners.set(slug, set);
    this.ensureSocket(slug);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.presenceListeners.delete(slug);
    };
  }

  photoEndpoint(slug: string, photoId: string): string {
    return this.url(`/api/rooms/${encodeURIComponent(slug)}/photos/${encodeURIComponent(photoId)}`);
  }

  async uploadPhoto(slug: string, photoId: string, blob: Blob): Promise<void> {
    const res = await this.fetchFn(this.photoEndpoint(slug, photoId), {
      method: 'PUT',
      headers: { 'Content-Type': blob.type || 'image/jpeg' },
      body: blob,
    });
    if (!res.ok) throw new Error(`Could not upload photo (${res.status})`);
  }

  async getPhotoBlob(slug: string, photoId: string): Promise<Blob | null> {
    const res = await this.fetchFn(this.photoEndpoint(slug, photoId));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Could not load photo (${res.status})`);
    return res.blob();
  }

  async deletePhotoBytes(slug: string, photoId: string): Promise<void> {
    await this.fetchFn(this.photoEndpoint(slug, photoId), { method: 'DELETE' }).catch(() => {});
  }

  private emit(state: RoomState): void {
    this.listeners.get(state.room.slug)?.forEach((l) => l(state));
  }

  private readIndex(): RoomSummary[] {
    const raw = this.store.getItem(INDEX_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as RoomSummary[];
    } catch {
      return [];
    }
  }

  private remember(state: RoomState): void {
    const summary: RoomSummary = {
      slug: state.room.slug,
      name: state.room.name,
      memberCount: state.room.members.length,
      updatedAt: new Date().toISOString(),
    };
    const next = [summary, ...this.readIndex().filter((r) => r.slug !== summary.slug)];
    this.safeSetIndex(next);
  }

  /** The "my rooms" index is a non-essential convenience: never let a failed
   * write (e.g. localStorage full / quota exceeded / disabled) break loading. */
  private safeSetIndex(rooms: RoomSummary[]): void {
    try {
      this.store.setItem(INDEX_KEY, JSON.stringify(rooms));
    } catch {
      /* storage full or unavailable — fine, the index is best-effort */
    }
  }
}
