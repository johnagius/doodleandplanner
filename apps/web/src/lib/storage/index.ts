import { LocalStorageRepository } from './localRepository.js';
import type { Repository } from './repository.js';

export * from './repository.js';
export * from './localRepository.js';
export * from './identity.js';

let instance: Repository | null = null;

/**
 * The app-wide repository. Today this is always the localStorage backend; when
 * the Cloudflare Worker lands we'll select it here based on configuration.
 */
export function getRepository(): Repository {
  if (!instance) instance = new LocalStorageRepository();
  return instance;
}

/** Override the repository (used by tests). */
export function setRepository(repo: Repository): void {
  instance = repo;
}
