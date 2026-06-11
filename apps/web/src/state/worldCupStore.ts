import {
  addPredictor,
  clearResult,
  removePredictor,
  renamePredictor,
  setPrediction,
  setResult,
  type RoomState,
  type WorldCupState,
} from '@dap/shared';
import { create } from 'zustand';
import { getRepository } from '../lib/storage/index.js';
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

interface WorldCupStore {
  state: RoomState | null;
  loading: boolean;
  error: string | null;
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
  const repo = () => getRepository();

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
    meId: readLocal(PREDICTOR_KEY),
    admin: readLocal(ADMIN_KEY) === '1',
    unsubscribe: null,

    async load() {
      get().unsubscribe?.();
      pendingWrites = 0;
      deferredRemote = null;
      lastSavedJson = null;
      set({ loading: true, error: null });
      try {
        const state = await loadOrCreateWorldCup();
        const unsub = repo().subscribe(WORLD_CUP_SLUG, onIncoming);
        // Drop a stale selected predictor that no longer exists.
        const meId = get().meId;
        const stillThere = meId && state.worldCup?.predictors.some((p) => p.id === meId);
        set({
          state,
          loading: false,
          unsubscribe: unsub,
          meId: stillThere ? meId : null,
        });
      } catch (err) {
        set({ loading: false, error: err instanceof Error ? err.message : 'Could not load' });
      }
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
