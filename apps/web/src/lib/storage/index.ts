import { HttpRepository } from './httpRepository.js';
import { LocalStorageRepository } from './localRepository.js';
import type { Repository } from './repository.js';

export * from './repository.js';
export * from './localRepository.js';
export * from './httpRepository.js';
export * from './identity.js';

let instance: Repository | null = null;

/**
 * The app-wide repository. When `VITE_API_BASE` points at the Cloudflare Worker
 * we use the real-time {@link HttpRepository} (multi-device, live updates);
 * otherwise we fall back to the client-only {@link LocalStorageRepository},
 * which still works fully offline and on GitHub Pages.
 */
export function getRepository(): Repository {
  if (!instance) {
    const apiBase = import.meta.env.VITE_API_BASE?.trim();
    instance = apiBase ? new HttpRepository(apiBase) : new LocalStorageRepository();
  }
  return instance;
}

/** Override the repository (used by tests). */
export function setRepository(repo: Repository): void {
  instance = repo;
}

/** True when a real-time backend is configured. */
export function isRealtimeBackend(): boolean {
  return Boolean(import.meta.env.VITE_API_BASE?.trim());
}
