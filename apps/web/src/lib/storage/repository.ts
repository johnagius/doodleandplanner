import type { RoomState } from '@dap/shared';

/** Lightweight room descriptor for "my rooms" lists. */
export interface RoomSummary {
  slug: string;
  name: string;
  memberCount: number;
  updatedAt: string;
}

/**
 * Persistence + real-time contract for room state.
 *
 * The web app talks only to this interface, so the same UI runs against:
 *  - {@link LocalStorageRepository} — client-only, used on GitHub Pages and in
 *    tests (cross-tab sync via the `storage` event), and
 *  - a future `CloudflareRepository` — HTTP + WebSocket to a Durable Object for
 *    true multi-device real-time collaboration.
 */
export interface Repository {
  /** Persist a brand-new room. Rejects if the slug already exists. */
  createRoom(state: RoomState): Promise<void>;
  /** Load a room by its slug, or null if unknown to this backend. */
  getRoom(slug: string): Promise<RoomState | null>;
  /** Persist an updated room and notify subscribers. Returns the saved state. */
  saveRoom(state: RoomState): Promise<RoomState>;
  /** Forget a room (does not affect other devices for the local backend). */
  deleteRoom(slug: string): Promise<void>;
  /** Rooms this backend/device knows about, most recently updated first. */
  listRooms(): Promise<RoomSummary[]>;
  /**
   * Subscribe to changes for a room. Fires when the room is saved here or in
   * another tab. Returns an unsubscribe function.
   */
  subscribe(slug: string, listener: (state: RoomState) => void): () => void;

  /**
   * Broadcast an ephemeral, non-persisted payload (e.g. a live cursor) to other
   * clients in the room. Optional — backends without a live channel omit it.
   */
  publishPresence?(slug: string, payload: unknown): void;

  /** Subscribe to ephemeral presence payloads. Returns an unsubscribe function. */
  subscribePresence?(slug: string, listener: (payload: unknown) => void): () => void;

  /** Store the bytes for a photo under the given id. */
  uploadPhoto(slug: string, photoId: string, blob: Blob): Promise<void>;
  /** Fetch a photo's bytes, or null if unknown. */
  getPhotoBlob(slug: string, photoId: string): Promise<Blob | null>;
  /** Remove a photo's bytes. */
  deletePhotoBytes(slug: string, photoId: string): Promise<void>;
  /**
   * A directly-loadable URL for a photo (e.g. the Worker endpoint), letting the
   * browser fetch/cache it in an <img>. Omitted by backends that only have local
   * bytes — callers then fall back to {@link getPhotoBlob} + object URLs.
   */
  photoEndpoint?(slug: string, photoId: string): string;
}

export class RoomExistsError extends Error {
  constructor(slug: string) {
    super(`A room with slug "${slug}" already exists`);
    this.name = 'RoomExistsError';
  }
}
