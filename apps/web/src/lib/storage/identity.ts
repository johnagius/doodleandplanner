/**
 * Per-device identity. Maps a room to "which member am I on this device", plus
 * a remembered display name to pre-fill join forms.
 */
const NAME_KEY = 'dap:preferredName';
const IDENTITY_PREFIX = 'dap:identity:';

export function getPreferredName(store: Storage = localStorage): string {
  return store.getItem(NAME_KEY) ?? '';
}

export function setPreferredName(name: string, store: Storage = localStorage): void {
  store.setItem(NAME_KEY, name.trim());
}

export function getIdentity(roomId: string, store: Storage = localStorage): string | null {
  return store.getItem(`${IDENTITY_PREFIX}${roomId}`);
}

export function setIdentity(roomId: string, memberId: string, store: Storage = localStorage): void {
  store.setItem(`${IDENTITY_PREFIX}${roomId}`, memberId);
}

export function clearIdentity(roomId: string, store: Storage = localStorage): void {
  store.removeItem(`${IDENTITY_PREFIX}${roomId}`);
}
