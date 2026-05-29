import type { RoomState } from '@dap/shared';
import { type Repository, RoomExistsError, type RoomSummary } from './repository.js';

const STORE_VERSION = 1;
const ROOM_PREFIX = 'dap:room:';
const INDEX_KEY = 'dap:rooms';

interface StoredRoom {
  version: number;
  updatedAt: string;
  state: RoomState;
}

type Listener = (state: RoomState) => void;

/**
 * localStorage-backed repository. Real-time updates within a tab go through an
 * in-process listener map; cross-tab updates arrive via the window `storage`
 * event. Everything is JSON, so the wire format matches a future HTTP backend.
 */
export class LocalStorageRepository implements Repository {
  private readonly listeners = new Map<string, Set<Listener>>();
  private storageHandler?: (e: StorageEvent) => void;

  constructor(private readonly store: Storage = globalThis.localStorage) {
    this.attachCrossTab();
  }

  private key(slug: string): string {
    return `${ROOM_PREFIX}${slug}`;
  }

  private read(slug: string): StoredRoom | null {
    const raw = this.store.getItem(this.key(slug));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredRoom;
    } catch {
      return null;
    }
  }

  private write(state: RoomState): StoredRoom {
    const record: StoredRoom = {
      version: STORE_VERSION,
      updatedAt: new Date().toISOString(),
      state,
    };
    this.store.setItem(this.key(state.room.slug), JSON.stringify(record));
    this.updateIndex(record);
    return record;
  }

  private updateIndex(record: StoredRoom): void {
    const index = this.readIndex();
    const summary: RoomSummary = {
      slug: record.state.room.slug,
      name: record.state.room.name,
      memberCount: record.state.room.members.length,
      updatedAt: record.updatedAt,
    };
    const next = [summary, ...index.filter((r) => r.slug !== summary.slug)];
    this.store.setItem(INDEX_KEY, JSON.stringify(next));
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

  async createRoom(state: RoomState): Promise<void> {
    if (this.read(state.room.slug)) throw new RoomExistsError(state.room.slug);
    this.write(state);
    this.emit(state);
  }

  async getRoom(slug: string): Promise<RoomState | null> {
    return this.read(slug)?.state ?? null;
  }

  async saveRoom(state: RoomState): Promise<RoomState> {
    this.write(state);
    this.emit(state);
    return state;
  }

  async deleteRoom(slug: string): Promise<void> {
    this.store.removeItem(this.key(slug));
    this.store.setItem(INDEX_KEY, JSON.stringify(this.readIndex().filter((r) => r.slug !== slug)));
  }

  async listRooms(): Promise<RoomSummary[]> {
    return this.readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  subscribe(slug: string, listener: Listener): () => void {
    const set = this.listeners.get(slug) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(slug, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(slug);
    };
  }

  private emit(state: RoomState): void {
    this.listeners.get(state.room.slug)?.forEach((l) => l(state));
  }

  private attachCrossTab(): void {
    if (typeof window === 'undefined' || this.storageHandler) return;
    this.storageHandler = (e: StorageEvent) => {
      if (!e.key?.startsWith(ROOM_PREFIX) || !e.newValue) return;
      try {
        const record = JSON.parse(e.newValue) as StoredRoom;
        this.emit(record.state);
      } catch {
        /* ignore malformed cross-tab payloads */
      }
    };
    window.addEventListener('storage', this.storageHandler);
  }

  /** Detach the cross-tab listener (useful in tests / teardown). */
  dispose(): void {
    if (this.storageHandler && typeof window !== 'undefined') {
      window.removeEventListener('storage', this.storageHandler);
      this.storageHandler = undefined;
    }
    this.listeners.clear();
  }
}
