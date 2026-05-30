/**
 * Tiny IndexedDB store for photo bytes in client-only mode (no Worker). Keyed by
 * `${slug}/${photoId}`. Falls back to a no-op when IndexedDB is unavailable
 * (e.g. some test environments) so the rest of the app keeps working.
 */
const DB_NAME = 'dap-photos';
const STORE = 'photos';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

const key = (slug: string, photoId: string) => `${slug}/${photoId}`;

export async function idbPut(slug: string, photoId: string, blob: Blob): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, key(slug, photoId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function idbGet(slug: string, photoId: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  const result = await new Promise<Blob | null>((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key(slug, photoId));
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => resolve(null);
  });
  db.close();
  return result;
}

export async function idbDelete(slug: string, photoId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key(slug, photoId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}
