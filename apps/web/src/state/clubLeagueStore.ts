import {
  addClubPredictor,
  clearClubPrediction,
  clearFixtureResult,
  clubLiveSwings,
  removeClubPredictor,
  removeFixture,
  renameClubPredictor,
  setClubPrediction,
  setFixtureResult,
  syncClubFeed,
  type ClubBtts,
  type ClubLeagueState,
  type ClubLiveInfo,
  type ClubOutcome,
  type ClubResult,
  type ClubTotals,
  type RoomState,
} from '@dap/shared';
import { create } from 'zustand';
import { LocalStorageRepository, getRepository, type Repository } from '../lib/storage/index.js';
import { SaveConflictError } from '../lib/storage/httpRepository.js';
import { CLUB_LEAGUE_SLUG, loadOrCreateClubLeague } from '../features/clubleague/clubLeagueRoom.js';
import { fetchClubFixtures } from '../features/clubleague/clubFeed.js';
import { clearSessionToken, isSessionPersisted } from '../features/worldcup/wcAuthClient.js';

const PREDICTOR_KEY = 'dap:club:predictor';
const ADMIN_KEY = 'dap:club:admin';
const NOTES_KEY = 'dap:club:notes';

/** Live swing notes are session drama worth keeping across a refresh mid-game. */
function readNotes(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}
function writeNotes(notes: Record<string, string[]>): void {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  } catch {
    /* private mode / quota — notes just won't persist */
  }
}

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
  /** Organiser mode reveals result-override controls (local toggle, no auth). */
  admin: boolean;
  /** Ephemeral in-play info per fixture id (from the live feed; not persisted). */
  live: Record<string, ClubLiveInfo>;
  /** Live "swing" notes per fixture id, newest last (session-only). */
  liveNotes: Record<string, string[]>;
  unsubscribe: (() => void) | null;

  load: () => Promise<void>;
  leave: () => void;
  selectPredictor: (id: string | null) => void;
  /** Sign out of the claimed name on this device (forgets the session token). */
  logout: () => void;
  setAdmin: (on: boolean) => void;

  predictMarket: (
    fixtureId: string,
    market: { outcome?: ClubOutcome; totals?: ClubTotals; btts?: ClubBtts; combinator?: boolean },
  ) => Promise<void>;
  clearMyPrediction: (fixtureId: string) => Promise<void>;

  /** Pull the automatic fixture feed and reconcile it into the board. */
  syncFixtures: () => Promise<void>;

  // Organiser (edge-case overrides only)
  enterResult: (fixtureId: string, home: number, away: number) => Promise<void>;
  clearResult: (fixtureId: string) => Promise<void>;
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
    live: {},
    liveNotes: readNotes(),
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
      const predictors = state.clubLeague?.predictors ?? [];
      let resolvedMe = meId && predictors.some((p) => p.id === meId) ? meId : null;
      // Stay logged in without re-entering a code: if nothing is selected but this
      // device holds a verified session for exactly one name, resume as that name.
      if (!resolvedMe) {
        const owned = predictors.filter((p) => isSessionPersisted(p.id));
        if (owned.length === 1) {
          resolvedMe = owned[0]!.id;
          writeLocal(PREDICTOR_KEY, resolvedMe);
        }
      }
      set({ state, loading: false, offline, unsubscribe: unsub, meId: resolvedMe });
    },

    leave() {
      get().unsubscribe?.();
      set({ unsubscribe: null });
    },

    selectPredictor(id) {
      writeLocal(PREDICTOR_KEY, id);
      set({ meId: id });
    },

    logout() {
      const id = get().meId;
      if (id) clearSessionToken(id);
      writeLocal(PREDICTOR_KEY, null);
      set({ meId: null });
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

    async syncFixtures() {
      const club = get().state?.clubLeague;
      if (!club) return;
      // The Champions League final always belongs on the board (it decides the
      // Meister Cup) even if it's between two non-tracked clubs — so let the feed
      // keep any UCL match kicking off after the leagues have finished.
      const seasonEnd = club.periods.length
        ? new Date(Math.max(...club.periods.map((p) => new Date(p.endsAt).getTime()))).toISOString()
        : undefined;
      const { fixtures, window } = await fetchClubFixtures(new Date(), {
        uclFinalAfter: seasonEnd,
      });
      if (fixtures.length === 0) return; // nothing fresh — leave the board as-is

      // Persist the reconciled fixtures (final results, adds/prunes) only when the
      // board actually changes, so we don't spam the shared room on every poll.
      const next = syncClubFeed(club, fixtures, window ? { window } : undefined);
      if (JSON.stringify(next.fixtures) !== JSON.stringify(club.fixtures)) {
        await apply((s) =>
          s.clubLeague
            ? {
                ...s,
                clubLeague: syncClubFeed(s.clubLeague, fixtures, window ? { window } : undefined),
              }
            : s,
        );
      }

      // Fold in-play scores into an ephemeral (device-only) live map, keyed by our
      // local fixture id, and note any market swings since the last poll.
      const board = get().state?.clubLeague;
      if (!board) return;
      const byExt = new Map(
        board.fixtures.filter((f) => f.externalId).map((f) => [f.externalId!, f]),
      );
      const prevLive = get().live;
      const live: Record<string, ClubLiveInfo> = {};
      const notes: Record<string, string[]> = { ...get().liveNotes };
      for (const inc of fixtures) {
        if (!inc.live) continue;
        const local = byExt.get(inc.externalId);
        if (!local) continue;
        live[local.id] = inc.live;
        const before = prevLive[local.id];
        const prevScore: ClubResult | null = before
          ? { home: before.home, away: before.away }
          : null;
        const nowScore: ClubResult = { home: inc.live.home, away: inc.live.away };
        if (before && (before.home !== nowScore.home || before.away !== nowScore.away)) {
          const swings = clubLiveSwings(board, local.id, prevScore, nowScore);
          if (swings.length) {
            const clock = inc.live.detail ? `${inc.live.detail} · ` : '';
            const line = `${clock}${nowScore.home}–${nowScore.away} · ${swings.join(' · ')}`;
            notes[local.id] = [...(notes[local.id] ?? []), line].slice(-6);
          }
        }
      }
      set({ live, liveNotes: notes });
      writeNotes(notes);
    },

    async enterResult(fixtureId, home, away) {
      // Organiser results are manual (e.g. an extra-time correction) so the feed
      // never overwrites them.
      await apply((s) =>
        withClub(s, (c) => setFixtureResult(c, fixtureId, { home, away }, { manual: true })),
      );
    },

    async clearResult(fixtureId) {
      await apply((s) => withClub(s, (c) => clearFixtureResult(c, fixtureId)));
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
