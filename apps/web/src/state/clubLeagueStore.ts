import {
  addClubPredictor,
  addFixture,
  clearClubPrediction,
  clearFixtureResult,
  removeClubPredictor,
  removeFixture,
  renameClubPredictor,
  setBanker,
  setClubPrediction,
  setFixtureResult,
  updateFixture,
  type ClubLeagueState,
  type ClubOutcome,
  type ClubBtts,
  type ClubTotals,
  type FixtureDraft,
  type RoomState,
} from '@dap/shared';
import { create } from 'zustand';
import { LocalStorageRepository, getRepository, type Repository } from '../lib/storage/index.js';
import { SaveConflictError } from '../lib/storage/httpRepository.js';
import { CLUB_LEAGUE_SLUG, loadOrCreateClubLeague } from '../features/clubleague/clubLeagueRoom.js';

const PREDICTOR_KEY = 'dap:club:predictor';
const ADMIN_KEY = 'dap:club:admin';

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

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    m.includes('network') ||
    m.includes('failed to fetch') ||
    m.includes('load failed') ||
    m.includes('fetch resource')
  );
}

interface ClubLeagueStore {
  state: RoomState | null;
  loading: boolean;
  error: string | null;
  offline: boolean;
  /** The predictor "I" am, persisted on this device. */
  meId: string | null;
  /** Organiser mode reveals fixture + result controls (local toggle, no auth). */
  admin: boolean;
  unsubscribe: (() => void) | null;

  load: () => Promise<void>;
  leave: () => void;
  selectPredictor: (id: string | null) => void;
  setAdmin: (on: boolean) => void;

  predictMarket: (
    fixtureId: string,
    market: { outcome?: ClubOutcome; totals?: ClubTotals; btts?: ClubBtts },
  ) => Promise<void>;
  clearMyPrediction: (fixtureId: string) => Promise<void>;
  toggleBanker: (fixtureId: string, on: boolean) => Promise<void>;

  // Organiser
  enterResult: (fixtureId: string, home: number, away: number) => Promise<void>;
  clearResult: (fixtureId: string) => Promise<void>;
  addFixture: (draft: FixtureDraft) => Promise<void>;
  editFixture: (fixtureId: string, patch: Parameters<typeof updateFixture>[2]) => Promise<void>;
  deleteFixture: (fixtureId: string) => Promise<void>;

  addName: (name: string) => Promise<void>;
  renameName: (id: string, name: string) => Promise<void>;
  removeName: (id: string) => Promise<void>;
}

function withClub(s: RoomState, fn: (c: ClubLeagueState) => ClubLeagueState): RoomState {
  if (!s.clubLeague) return s;
  return { ...s, clubLeague: fn(s.clubLeague) };
}

export const useClubLeagueStore = create<ClubLeagueStore>((set, get) => {
  let activeRepo: Repository = getRepository();
  const repo = () => activeRepo;

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
    let base = current;
    for (let attempt = 0; ; attempt++) {
      let next: RoomState;
      try {
        next = updater(base);
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
        return;
      }
      set({ state: next, error: null });
      lastSavedJson = JSON.stringify(next);
      pendingWrites++;
      let rebaseTo: RoomState | null = null;
      let failed = false;
      try {
        const saved = await repo().saveRoom(next);
        lastSavedJson = JSON.stringify(saved);
        set({ state: saved });
      } catch (err) {
        if (err instanceof SaveConflictError && err.state && attempt < 3) {
          rebaseTo = err.state;
        } else {
          failed = true;
          const msg =
            err instanceof SaveConflictError
              ? 'Synced with everyone else — tap again to apply your change.'
              : err instanceof Error
                ? err.message
                : 'Could not save';
          set({
            state: err instanceof SaveConflictError && err.state ? err.state : current,
            error: msg,
          });
        }
      } finally {
        pendingWrites--;
      }
      if (failed) return;
      if (!rebaseTo) break;
      base = rebaseTo;
      set({ state: base });
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
        state = await loadOrCreateClubLeague(activeRepo);
      } catch (err) {
        if (isNetworkError(err) && !(activeRepo instanceof LocalStorageRepository)) {
          try {
            activeRepo = new LocalStorageRepository();
            state = await loadOrCreateClubLeague(activeRepo);
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

      const unsub = activeRepo.subscribe(CLUB_LEAGUE_SLUG, onIncoming);
      const meId = get().meId;
      const stillThere = meId && state.clubLeague?.predictors.some((p) => p.id === meId);
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

    async predictMarket(fixtureId, market) {
      const me = requireMe();
      await apply((s) =>
        withClub(s, (c) => setClubPrediction(c, { fixtureId, predictorId: me, ...market })),
      );
    },

    async clearMyPrediction(fixtureId) {
      const me = requireMe();
      await apply((s) => withClub(s, (c) => clearClubPrediction(c, fixtureId, me)));
    },

    async toggleBanker(fixtureId, on) {
      const me = requireMe();
      await apply((s) => withClub(s, (c) => setBanker(c, fixtureId, me, on)));
    },

    async enterResult(fixtureId, home, away) {
      await apply((s) => withClub(s, (c) => setFixtureResult(c, fixtureId, { home, away })));
    },

    async clearResult(fixtureId) {
      await apply((s) => withClub(s, (c) => clearFixtureResult(c, fixtureId)));
    },

    async addFixture(draft) {
      await apply((s) => withClub(s, (c) => addFixture(c, draft)));
    },

    async editFixture(fixtureId, patch) {
      await apply((s) => withClub(s, (c) => updateFixture(c, fixtureId, patch)));
    },

    async deleteFixture(fixtureId) {
      await apply((s) => withClub(s, (c) => removeFixture(c, fixtureId)));
    },

    async addName(name) {
      let newId: string | null = null;
      await apply((s) =>
        withClub(s, (c) => {
          const next = addClubPredictor(c, name);
          newId = next.predictors[next.predictors.length - 1]?.id ?? null;
          return next;
        }),
      );
      if (newId && !get().error) get().selectPredictor(newId);
    },

    async renameName(id, name) {
      await apply((s) => withClub(s, (c) => renameClubPredictor(c, id, name)));
    },

    async removeName(id) {
      await apply((s) => withClub(s, (c) => removeClubPredictor(c, id)));
      if (get().meId === id) get().selectPredictor(null);
    },
  };
});
