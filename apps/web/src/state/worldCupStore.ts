import {
  addPredictor,
  clearPrediction,
  clearResult,
  removePredictor,
  renamePredictor,
  setPrediction,
  setResult,
  type RoomState,
  type WorldCupState,
} from '@dap/shared';
import { create } from 'zustand';
import { LocalStorageRepository, getRepository, type Repository } from '../lib/storage/index.js';
import { WORLD_CUP_SLUG, loadOrCreateWorldCup } from '../features/worldcup/worldCupRoom.js';

const PREDICTOR_KEY = 'dap:wc:predictor';
const ADMIN_KEY = 'dap:wc:admin';

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode / SSR — ignore */
  }
}

/** Heuristic: did a fetch fail at the network level (offline, CORS, DNS, Worker down)? */
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch() rejections surface as TypeError
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    m.includes('network') ||
    m.includes('failed to fetch') ||
    m.includes('load failed') ||
    m.includes('fetch resource')
  );
}

interface WorldCupStore {
  state: RoomState | null;
  loading: boolean;
  error: string | null;
  /** True when the backend was unreachable and we fell back to a local board. */
  offline: boolean;
  /** The predictor "I" am, persisted on this device. */
  meId: string | null;
  /** Organiser mode reveals result-entry controls (local toggle, no auth). */
  admin: boolean;
  unsubscribe: (() => void) | null;

  load: () => Promise<void>;
  leave: () => void;
  selectPredictor: (id: string | null) => void;
  setAdmin: (on: boolean) => void;

  predict: (matchId: string, home: number, away: number) => Promise<void>;
  unpredict: (matchId: string) => Promise<void>;
  enterResult: (matchId: string, home: number, away: number, advancesId?: string) => Promise<void>;
  clearMatchResult: (matchId: string) => Promise<void>;
  addName: (name: string) => Promise<void>;
  renameName: (id: string, name: string) => Promise<void>;
  removeName: (id: string) => Promise<void>;
}

/** Apply a pure update to the embedded WorldCupState. */
function withWorldCup(s: RoomState, fn: (wc: WorldCupState) => WorldCupState): RoomState {
  if (!s.worldCup) return s;
  return { ...s, worldCup: fn(s.worldCup) };
}

export const useWorldCupStore = create<WorldCupStore>((set, get) => {
  // The repository actually in use this session: normally the configured one
  // (remote when VITE_API_BASE is set), but if that backend can't be reached we
  // swap to a local board so the page still works.
  let activeRepo: Repository = getRepository();
  const repo = () => activeRepo;

  // Same optimistic-write bookkeeping as the room store: while our own saves are
  // in flight, defer inbound realtime updates so we don't clobber local edits
  // with a stale echo, then reconcile once writes settle.
  let pendingWrites = 0;
  let deferredRemote: RoomState | null = null;
  let lastSavedJson: string | null = null;

  function onIncoming(incoming: RoomState): void {
    if (pendingWrites > 0) {
      deferredRemote = incoming;
      return;
    }
    set({ state: incoming });
  }

  async function apply(updater: (state: RoomState) => RoomState): Promise<void> {
    const current = get().state;
    if (!current) return;
    let next: RoomState;
    try {
      next = updater(current);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return;
    }
    set({ state: next, error: null });
    lastSavedJson = JSON.stringify(next);
    pendingWrites++;
    try {
      await repo().saveRoom(next);
    } catch (err) {
      set({ state: current, error: err instanceof Error ? err.message : 'Could not save' });
      return;
    } finally {
      pendingWrites--;
    }
    if (pendingWrites === 0 && deferredRemote) {
      const remote = deferredRemote;
      deferredRemote = null;
      if (JSON.stringify(remote) !== lastSavedJson) set({ state: remote });
    }
  }

  const requireMe = (): string => {
    const id = get().meId;
    if (!id) throw new Error('Pick who you are first');
    return id;
  };

  return {
    state: null,
    loading: false,
    error: null,
    offline: false,
    meId: readLocal(PREDICTOR_KEY),
    admin: readLocal(ADMIN_KEY) === '1',
    unsubscribe: null,

    async load() {
      get().unsubscribe?.();
      pendingWrites = 0;
      deferredRemote = null;
      lastSavedJson = null;
      activeRepo = getRepository();
      set({ loading: true, error: null, offline: false });

      let state: RoomState;
      let offline = false;
      try {
        state = await loadOrCreateWorldCup(activeRepo);
      } catch (err) {
        // Backend unreachable (offline, CORS, Worker down) → fall back to a local
        // board so the page still opens. Other errors surface as-is.
        if (isNetworkError(err) && !(activeRepo instanceof LocalStorageRepository)) {
          try {
            activeRepo = new LocalStorageRepository();
            state = await loadOrCreateWorldCup(activeRepo);
            offline = true;
          } catch (err2) {
            set({ loading: false, error: err2 instanceof Error ? err2.message : 'Could not load' });
            return;
          }
        } else {
          set({ loading: false, error: err instanceof Error ? err.message : 'Could not load' });
          return;
        }
      }

      const unsub = activeRepo.subscribe(WORLD_CUP_SLUG, onIncoming);
      // Drop a stale selected predictor that no longer exists.
      const meId = get().meId;
      const stillThere = meId && state.worldCup?.predictors.some((p) => p.id === meId);
      set({ state, loading: false, offline, unsubscribe: unsub, meId: stillThere ? meId : null });
    },

    leave() {
      get().unsubscribe?.();
      set({ unsubscribe: null });
    },

    selectPredictor(id) {
      writeLocal(PREDICTOR_KEY, id);
      set({ meId: id });
    },

    setAdmin(on) {
      writeLocal(ADMIN_KEY, on ? '1' : null);
      set({ admin: on });
    },

    async predict(matchId, home, away) {
      const me = requireMe();
      await apply((s) =>
        withWorldCup(s, (wc) => setPrediction(wc, { matchId, predictorId: me, home, away })),
      );
    },

    async unpredict(matchId) {
      const me = requireMe();
      await apply((s) => withWorldCup(s, (wc) => clearPrediction(wc, matchId, me)));
    },

    async enterResult(matchId, home, away, advancesId) {
      await apply((s) =>
        withWorldCup(s, (wc) => setResult(wc, { matchId, home, away, advancesId })),
      );
    },

    async clearMatchResult(matchId) {
      await apply((s) => withWorldCup(s, (wc) => clearResult(wc, matchId)));
    },

    async addName(name) {
      let newId: string | null = null;
      await apply((s) =>
        withWorldCup(s, (wc) => {
          const next = addPredictor(wc, name);
          newId = next.predictors[next.predictors.length - 1]?.id ?? null;
          return next;
        }),
      );
      if (newId && !get().error) get().selectPredictor(newId);
    },

    async renameName(id, name) {
      await apply((s) => withWorldCup(s, (wc) => renamePredictor(wc, id, name)));
    },

    async removeName(id) {
      await apply((s) => withWorldCup(s, (wc) => removePredictor(wc, id)));
      if (get().meId === id) get().selectPredictor(null);
    },
  };
});
