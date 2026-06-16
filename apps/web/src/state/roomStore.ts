import {
  addMember,
  addNote,
  addOption,
  addStroke,
  appendMessage,
  toggleReaction,
  editMessage,
  deleteMessage,
  castVote,
  claimItem,
  clearBoard,
  closePoll,
  createGame as makeGame,
  joinGame as joinGameLogic,
  leaveGame as leaveGameLogic,
  startGame as startGameLogic,
  makeMove as makeMoveLogic,
  resetGame as resetGameLogic,
  seatOf,
  battleshipPlaceShip,
  battleshipRemoveShipAt,
  battleshipShuffle as battleshipShuffleLogic,
  battleshipClearFleet as battleshipClearFleetLogic,
  battleshipReady as battleshipReadyLogic,
  createMeetPoint,
  updateMeetPoint,
  createPhoto,
  updatePhoto,
  generateId,
  createActivity,
  createEvent,
  createExpense,
  createItem,
  createMessage,
  createPoll,
  eventFromOption,
  linkGoogleProfile,
  moveNote,
  releaseItem,
  removeNote,
  removeOption,
  renameMember,
  rotateInviteToken,
  scheduleActivity,
  setCells,
  setItemStatus,
  setRsvp,
  toggleInterest,
  undoLastStroke,
  updateActivity,
  updateItem,
  upsertAvailability,
  type Activity,
  type BusyInterval,
  type InventoryItem,
  type ItemStatus,
  type Member,
  type Point,
  type RoomSettings,
  type RoomState,
  type GameMove,
  type GameSession,
  type GameType,
  type MeetPoint,
  type Photo,
  type GridSpec,
  type RsvpStatus,
  type SchedulePoll,
  type StrokeTool,
  type TimeOption,
  type VoteValue,
} from '@dap/shared';
import { create } from 'zustand';
import { getIdentity, getRepository, setIdentity } from '../lib/storage/index.js';
import { SaveConflictError } from '../lib/storage/httpRepository.js';
import { useGoogleStore } from './googleStore.js';

/**
 * Resolve which member "I" am in a room: the device-local identity if it still
 * matches a member, otherwise — when signed in — the member carrying my Google
 * email, so the same person is recognised across devices. Persists the match
 * locally so subsequent loads are instant.
 */
function resolveIdentity(state: RoomState): string | null {
  const local = getIdentity(state.room.id);
  if (local && state.room.members.some((m) => m.id === local)) return local;
  const email = useGoogleStore.getState().profile?.email;
  if (email) {
    const mine = state.room.members.find((m) => m.googleEmail === email);
    if (mine) {
      setIdentity(state.room.id, mine.id);
      return mine.id;
    }
  }
  return null;
}

interface RoomStore {
  state: RoomState | null;
  meId: string | null;
  loading: boolean;
  error: string | null;
  unsubscribe: (() => void) | null;

  loadRoom: (slug: string) => Promise<void>;
  leave: () => void;
  joinRoom: (name: string) => Promise<Member | null>;
  linkGoogle: (profile: { email: string; name?: string; avatarUrl?: string }) => Promise<void>;
  /** Re-resolve which member I am (e.g. after signing in on a new device). */
  refreshIdentity: () => void;

  // polls
  addPoll: (input: {
    title: string;
    description?: string;
    options: { start: string; end: string }[];
    allowMaybe?: boolean;
    deadline?: string;
  }) => Promise<void>;
  vote: (pollId: string, optionId: string, value: VoteValue) => Promise<void>;
  addPollOption: (pollId: string, start: string, end: string) => Promise<void>;
  removePollOption: (pollId: string, optionId: string) => Promise<void>;
  decidePoll: (pollId: string, finalOptionId?: string) => Promise<void>;
  deletePoll: (pollId: string) => Promise<void>;

  // events
  scheduleFromOption: (poll: SchedulePoll, option: TimeOption) => Promise<void>;
  addEvent: (input: {
    title: string;
    start: string;
    end: string;
    location?: string;
    description?: string;
  }) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  attachGoogleId: (eventId: string, googleEventId: string) => Promise<void>;
  rsvp: (eventId: string, status: RsvpStatus) => Promise<void>;

  // inventory
  addItem: (input: {
    name: string;
    quantity?: number;
    category?: string;
    notes?: string;
    cost?: number;
  }) => Promise<void>;
  claim: (itemId: string) => Promise<void>;
  release: (itemId: string) => Promise<void>;
  setStatus: (itemId: string, status: ItemStatus) => Promise<void>;
  editItem: (
    itemId: string,
    patch: Partial<Pick<InventoryItem, 'name' | 'quantity' | 'category' | 'notes' | 'cost'>>,
  ) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;

  // activities
  addActivity: (input: {
    title: string;
    description?: string;
    durationMinutes?: number;
  }) => Promise<void>;
  toggleActivityInterest: (activityId: string) => Promise<void>;
  scheduleActivityAt: (activityId: string, scheduledAt: string | undefined) => Promise<void>;
  editActivity: (
    activityId: string,
    patch: Partial<Pick<Activity, 'title' | 'description' | 'durationMinutes'>>,
  ) => Promise<void>;
  removeActivity: (activityId: string) => Promise<void>;

  // doodle
  draw: (input: {
    color: string;
    width: number;
    points: Point[];
    tool?: StrokeTool;
  }) => Promise<void>;
  undoDoodle: () => Promise<void>;
  clearDoodle: () => Promise<void>;
  addNote: (input: { text: string; color: string; x: number; y: number }) => Promise<void>;
  moveNote: (noteId: string, x: number, y: number) => Promise<void>;
  removeNote: (noteId: string) => Promise<void>;

  // chat
  postMessage: (text: string, photoId?: string) => Promise<void>;
  reactToMessage: (messageId: string, emoji: string) => Promise<void>;
  editMessage: (messageId: string, text: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;

  // availability
  shareMyAvailability: (busy: BusyInterval[]) => Promise<void>;

  // availability grid (Doodle-style week × time matrix)
  setupGrid: (spec: GridSpec) => Promise<void>;
  setMyGridCells: (cellIds: string[], available: boolean) => Promise<void>;

  // expenses
  addExpense: (input: {
    description: string;
    amount: number;
    paidBy: string;
    sharedWith?: string[];
    category?: string;
  }) => Promise<void>;
  removeExpense: (expenseId: string) => Promise<void>;

  // room admin
  rotateInvite: () => Promise<void>;
  setCurrency: (currency: string) => Promise<void>;
  updateRoom: (patch: {
    name?: string;
    description?: string;
    settings?: Partial<RoomSettings>;
  }) => Promise<void>;
  renameMe: (name: string) => Promise<void>;

  // Party games
  createGame: (type: GameType) => Promise<string>;
  joinGame: (gameId: string) => Promise<void>;
  leaveGame: (gameId: string) => Promise<void>;
  startGame: (gameId: string) => Promise<void>;
  playMove: (gameId: string, move: GameMove) => Promise<void>;
  rematchGame: (gameId: string) => Promise<void>;
  deleteGame: (gameId: string) => Promise<void>;
  // Battleship placement (operate on my own seat)
  bsPlaceShip: (gameId: string, cells: number[]) => Promise<void>;
  bsRemoveShip: (gameId: string, cell: number) => Promise<void>;
  bsShuffle: (gameId: string) => Promise<void>;
  bsClear: (gameId: string) => Promise<void>;
  bsReady: (gameId: string) => Promise<void>;

  // Map meet-up points
  addMeetPoint: (input: {
    label: string;
    lat: number;
    lng: number;
    note?: string;
    time?: string;
  }) => Promise<void>;
  editMeetPoint: (
    pointId: string,
    patch: Partial<Pick<MeetPoint, 'label' | 'note' | 'time' | 'lat' | 'lng'>>,
  ) => Promise<void>;
  removeMeetPoint: (pointId: string) => Promise<void>;

  // Photos (bytes uploaded via the repository; metadata syncs in RoomState)
  addPhoto: (input: {
    blob: Blob;
    width: number;
    height: number;
    caption?: string;
    lat?: number;
    lng?: number;
    country?: string;
    place?: string;
    event?: string;
  }) => Promise<string>;
  editPhoto: (
    photoId: string,
    patch: Partial<Pick<Photo, 'caption' | 'event' | 'country' | 'place'>>,
  ) => Promise<void>;
  removePhoto: (photoId: string) => Promise<void>;
}

/** Replace one game in the room's games array via a pure updater. */
function replaceGame(s: RoomState, gameId: string, fn: (g: GameSession) => GameSession): RoomState {
  return { ...s, games: (s.games ?? []).map((g) => (g.id === gameId ? fn(g) : g)) };
}

export const useRoomStore = create<RoomStore>((set, get) => {
  // Resolved lazily so tests can swap the backend via setRepository().
  const repo = () => getRepository();

  // In-flight local saves. While > 0 our optimistic state is authoritative, so
  // inbound subscription updates are deferred (they may be the echo of an
  // earlier save arriving after a newer local edit — finding #11). Any remote
  // update seen during that window is stashed and re-applied once writes settle,
  // so a genuinely newer remote change is never permanently dropped.
  let pendingWrites = 0;
  let deferredRemote: RoomState | null = null;
  // Serialised form of the most recent state we persisted; used to recognise
  // (and skip) the backend's echo of our own save vs a genuinely newer update.
  let lastSavedJson: string | null = null;

  /** Reset the realtime bookkeeping (on leave / room switch). */
  function resetSync(): void {
    pendingWrites = 0;
    deferredRemote = null;
    lastSavedJson = null;
  }

  /** Apply a pure update to the current room and persist it. On a save conflict
   * (our revision was stale) we rebase the mutation onto the server's current
   * state and retry, so concurrent edits don't clobber each other. */
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
          set({
            state: err instanceof SaveConflictError && err.state ? err.state : current,
            error:
              err instanceof SaveConflictError
                ? 'Synced with everyone else — try that again.'
                : err instanceof Error
                  ? err.message
                  : 'Could not save',
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
    // Once writes settle, apply a deferred remote update only if it's genuinely
    // different from what we just saved (i.e. not merely our own echo).
    if (pendingWrites === 0 && deferredRemote) {
      const remote = deferredRemote;
      deferredRemote = null;
      if (JSON.stringify(remote) !== lastSavedJson) set({ state: remote });
    }
  }

  /**
   * Accept an inbound (remote) state. While a local write is pending we defer
   * the latest one (re-applied once writes settle, unless it's our own echo)
   * instead of clobbering our optimistic state with a possibly-stale update.
   */
  function onIncoming(incoming: RoomState): void {
    if (pendingWrites > 0) {
      deferredRemote = incoming;
      return;
    }
    set({ state: incoming });
  }

  const requireMe = (): string => {
    const id = get().meId;
    if (!id) throw new Error('You must join the room first');
    return id;
  };

  return {
    state: null,
    meId: null,
    loading: false,
    error: null,
    unsubscribe: null,

    async loadRoom(slug) {
      get().unsubscribe?.();
      resetSync();
      set({ loading: true, error: null });
      const state = await repo().getRoom(slug);
      if (!state) {
        set({ state: null, meId: null, loading: false, unsubscribe: null });
        return;
      }
      const unsub = repo().subscribe(slug, onIncoming);
      set({
        state,
        meId: resolveIdentity(state),
        loading: false,
        unsubscribe: unsub,
      });
    },

    leave() {
      get().unsubscribe?.();
      resetSync();
      set({ state: null, meId: null, unsubscribe: null, error: null });
    },

    async joinRoom(name) {
      const current = get().state;
      if (!current) return null;
      const added = addMember(current.room, { name });
      let room = added.room;
      // Stamp my Google identity on the new member so other devices recognise me.
      const profile = useGoogleStore.getState().profile;
      if (profile?.email) {
        room = linkGoogleProfile(room, added.member.id, {
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.picture,
        });
      }
      const next = { ...current, room };
      set({ state: next, meId: added.member.id });
      setIdentity(room.id, added.member.id);
      await repo().saveRoom(next);
      return added.member;
    },

    async linkGoogle(profile) {
      const me = requireMe();
      await apply((s) => ({ ...s, room: linkGoogleProfile(s.room, me, profile) }));
    },

    refreshIdentity() {
      const s = get().state;
      if (!s || get().meId) return; // keep an existing identity
      const meId = resolveIdentity(s);
      if (meId) set({ meId });
    },

    async addPoll(input) {
      await apply((s) => ({
        ...s,
        polls: [
          ...s.polls,
          createPoll({
            roomId: s.room.id,
            title: input.title,
            description: input.description,
            options: input.options.map((o) => ({ start: o.start, end: o.end })),
            allowMaybe: input.allowMaybe,
            deadline: input.deadline,
          }),
        ],
      }));
    },

    async vote(pollId, optionId, value) {
      const me = requireMe();
      await apply((s) => ({
        ...s,
        polls: s.polls.map((p) => (p.id === pollId ? castVote(p, me, optionId, value) : p)),
      }));
    },

    async addPollOption(pollId, start, end) {
      await apply((s) => ({
        ...s,
        polls: s.polls.map((p) => (p.id === pollId ? addOption(p, start, end) : p)),
      }));
    },

    async removePollOption(pollId, optionId) {
      await apply((s) => ({
        ...s,
        polls: s.polls.map((p) => (p.id === pollId ? removeOption(p, optionId) : p)),
      }));
    },

    async decidePoll(pollId, finalOptionId) {
      await apply((s) => ({
        ...s,
        polls: s.polls.map((p) => (p.id === pollId ? closePoll(p, finalOptionId) : p)),
      }));
    },

    async deletePoll(pollId) {
      await apply((s) => ({ ...s, polls: s.polls.filter((p) => p.id !== pollId) }));
    },

    async scheduleFromOption(poll, option) {
      await apply((s) => ({ ...s, events: [...s.events, eventFromOption(poll, option)] }));
    },

    async addEvent(input) {
      await apply((s) => ({
        ...s,
        events: [...s.events, createEvent({ roomId: s.room.id, ...input })],
      }));
    },

    async deleteEvent(eventId) {
      await apply((s) => ({ ...s, events: s.events.filter((e) => e.id !== eventId) }));
    },

    async attachGoogleId(eventId, googleEventId) {
      await apply((s) => ({
        ...s,
        events: s.events.map((e) => (e.id === eventId ? { ...e, googleEventId } : e)),
      }));
    },

    async rsvp(eventId, status) {
      const me = requireMe();
      await apply((s) => ({
        ...s,
        events: s.events.map((e) => (e.id === eventId ? setRsvp(e, me, status) : e)),
      }));
    },

    async addItem(input) {
      await apply((s) => ({
        ...s,
        inventory: [...s.inventory, createItem({ roomId: s.room.id, ...input })],
      }));
    },

    async claim(itemId) {
      const me = requireMe();
      await apply((s) => ({
        ...s,
        inventory: s.inventory.map((i) => (i.id === itemId ? claimItem(i, me) : i)),
      }));
    },

    async release(itemId) {
      await apply((s) => ({
        ...s,
        inventory: s.inventory.map((i) => (i.id === itemId ? releaseItem(i) : i)),
      }));
    },

    async setStatus(itemId, status) {
      await apply((s) => ({
        ...s,
        inventory: s.inventory.map((i) => (i.id === itemId ? setItemStatus(i, status) : i)),
      }));
    },

    async editItem(itemId, patch) {
      await apply((s) => ({
        ...s,
        inventory: s.inventory.map((i) => (i.id === itemId ? updateItem(i, patch) : i)),
      }));
    },

    async removeItem(itemId) {
      await apply((s) => ({ ...s, inventory: s.inventory.filter((i) => i.id !== itemId) }));
    },

    async addActivity(input) {
      const me = requireMe();
      await apply((s) => ({
        ...s,
        activities: [
          ...s.activities,
          createActivity({ roomId: s.room.id, proposedBy: me, ...input }),
        ],
      }));
    },

    async toggleActivityInterest(activityId) {
      const me = requireMe();
      await apply((s) => ({
        ...s,
        activities: s.activities.map((a) => (a.id === activityId ? toggleInterest(a, me) : a)),
      }));
    },

    async scheduleActivityAt(activityId, scheduledAt) {
      await apply((s) => ({
        ...s,
        activities: s.activities.map((a) =>
          a.id === activityId ? scheduleActivity(a, scheduledAt) : a,
        ),
      }));
    },

    async editActivity(activityId, patch) {
      await apply((s) => ({
        ...s,
        activities: s.activities.map((a) => (a.id === activityId ? updateActivity(a, patch) : a)),
      }));
    },

    async removeActivity(activityId) {
      await apply((s) => ({ ...s, activities: s.activities.filter((a) => a.id !== activityId) }));
    },

    async draw(input) {
      const me = requireMe();
      await apply((s) => ({ ...s, doodle: addStroke(s.doodle, { memberId: me, ...input }) }));
    },

    async undoDoodle() {
      const me = requireMe();
      await apply((s) => ({ ...s, doodle: undoLastStroke(s.doodle, me) }));
    },

    async clearDoodle() {
      await apply((s) => ({ ...s, doodle: clearBoard(s.doodle) }));
    },

    async addNote(input) {
      const me = requireMe();
      await apply((s) => ({ ...s, doodle: addNote(s.doodle, { memberId: me, ...input }) }));
    },

    async moveNote(noteId, x, y) {
      await apply((s) => ({ ...s, doodle: moveNote(s.doodle, noteId, x, y) }));
    },

    async removeNote(noteId) {
      await apply((s) => ({ ...s, doodle: removeNote(s.doodle, noteId) }));
    },

    async postMessage(text, photoId) {
      const me = requireMe();
      await apply((s) => ({
        ...s,
        messages: appendMessage(
          s.messages ?? [],
          createMessage({ roomId: s.room.id, authorId: me, text, photoId }),
        ),
      }));
    },

    async reactToMessage(messageId, emoji) {
      const me = requireMe();
      await apply((s) => ({
        ...s,
        messages: toggleReaction(s.messages ?? [], messageId, emoji, me),
      }));
    },

    async editMessage(messageId, text) {
      const me = requireMe();
      await apply((s) => ({
        ...s,
        messages: editMessage(s.messages ?? [], messageId, me, text),
      }));
    },

    async deleteMessage(messageId) {
      const me = requireMe();
      await apply((s) => ({
        ...s,
        messages: deleteMessage(s.messages ?? [], messageId, me),
      }));
    },

    async shareMyAvailability(busy) {
      const me = requireMe();
      await apply((s) => ({
        ...s,
        availability: upsertAvailability(s.availability ?? [], {
          memberId: me,
          busy,
          updatedAt: new Date().toISOString(),
        }),
      }));
    },

    async setupGrid(spec) {
      await apply((s) => ({ ...s, gridSpec: spec }));
    },

    async setMyGridCells(cellIds, available) {
      const me = requireMe();
      await apply((s) => ({
        ...s,
        availabilityGrid: setCells(s.availabilityGrid ?? {}, me, cellIds, available),
      }));
    },

    async addExpense(input) {
      await apply((s) => ({
        ...s,
        expenses: [...(s.expenses ?? []), createExpense({ roomId: s.room.id, ...input })],
      }));
    },

    async removeExpense(expenseId) {
      await apply((s) => ({
        ...s,
        expenses: (s.expenses ?? []).filter((e) => e.id !== expenseId),
      }));
    },

    async rotateInvite() {
      await apply((s) => ({ ...s, room: rotateInviteToken(s.room) }));
    },

    async setCurrency(currency) {
      await apply((s) => ({
        ...s,
        room: { ...s.room, settings: { ...s.room.settings, currency } },
      }));
    },

    async updateRoom(patch) {
      await apply((s) => {
        const name = patch.name !== undefined ? patch.name.trim() : s.room.name;
        if (!name) throw new Error('Room name is required');
        return {
          ...s,
          room: {
            ...s.room,
            name,
            description:
              patch.description !== undefined
                ? patch.description.trim() || undefined
                : s.room.description,
            settings: { ...s.room.settings, ...patch.settings },
          },
        };
      });
    },

    async renameMe(name) {
      const me = requireMe();
      await apply((s) => ({ ...s, room: renameMember(s.room, me, name) }));
    },

    async createGame(type) {
      const me = requireMe();
      const current = get().state;
      if (!current) return '';
      const game = makeGame({ roomId: current.room.id, type, createdBy: me });
      await apply((s) => ({ ...s, games: [...(s.games ?? []), game] }));
      return game.id;
    },

    async joinGame(gameId) {
      const me = requireMe();
      await apply((s) => replaceGame(s, gameId, (g) => joinGameLogic(g, me)));
    },

    async leaveGame(gameId) {
      const me = requireMe();
      await apply((s) => replaceGame(s, gameId, (g) => leaveGameLogic(g, me)));
    },

    async startGame(gameId) {
      requireMe();
      await apply((s) => replaceGame(s, gameId, (g) => startGameLogic(g)));
    },

    async playMove(gameId, move) {
      const me = requireMe();
      await apply((s) => replaceGame(s, gameId, (g) => makeMoveLogic(g, me, move)));
    },

    async rematchGame(gameId) {
      requireMe();
      await apply((s) => replaceGame(s, gameId, (g) => resetGameLogic(g)));
    },

    async deleteGame(gameId) {
      requireMe();
      await apply((s) => ({ ...s, games: (s.games ?? []).filter((g) => g.id !== gameId) }));
    },

    async bsPlaceShip(gameId, cells) {
      const me = requireMe();
      await apply((s) =>
        replaceGame(s, gameId, (g) =>
          g.type === 'battleship' ? battleshipPlaceShip(g, seatOf(g, me), cells) : g,
        ),
      );
    },

    async bsRemoveShip(gameId, cell) {
      const me = requireMe();
      await apply((s) =>
        replaceGame(s, gameId, (g) =>
          g.type === 'battleship' ? battleshipRemoveShipAt(g, seatOf(g, me), cell) : g,
        ),
      );
    },

    async bsShuffle(gameId) {
      const me = requireMe();
      await apply((s) =>
        replaceGame(s, gameId, (g) =>
          g.type === 'battleship' ? battleshipShuffleLogic(g, seatOf(g, me)) : g,
        ),
      );
    },

    async bsClear(gameId) {
      const me = requireMe();
      await apply((s) =>
        replaceGame(s, gameId, (g) =>
          g.type === 'battleship' ? battleshipClearFleetLogic(g, seatOf(g, me)) : g,
        ),
      );
    },

    async bsReady(gameId) {
      const me = requireMe();
      await apply((s) =>
        replaceGame(s, gameId, (g) =>
          g.type === 'battleship' ? battleshipReadyLogic(g, seatOf(g, me)) : g,
        ),
      );
    },

    async addMeetPoint(input) {
      const me = requireMe();
      await apply((s) => ({
        ...s,
        meetPoints: [
          ...(s.meetPoints ?? []),
          createMeetPoint({ ...input, roomId: s.room.id, createdBy: me }),
        ],
      }));
    },

    async editMeetPoint(pointId, patch) {
      requireMe();
      await apply((s) => ({
        ...s,
        meetPoints: (s.meetPoints ?? []).map((p) =>
          p.id === pointId ? updateMeetPoint(p, patch) : p,
        ),
      }));
    },

    async removeMeetPoint(pointId) {
      requireMe();
      await apply((s) => ({
        ...s,
        meetPoints: (s.meetPoints ?? []).filter((p) => p.id !== pointId),
      }));
    },

    async addPhoto(input) {
      const me = requireMe();
      const current = get().state;
      if (!current) return '';
      // Upload bytes first under a fresh id, then record syncing metadata.
      const id = generateId('photo');
      await repo().uploadPhoto(current.room.slug, id, input.blob);
      const photo = createPhoto({
        id,
        roomId: current.room.id,
        authorId: me,
        mime: input.blob.type || 'image/jpeg',
        width: input.width,
        height: input.height,
        caption: input.caption,
        lat: input.lat,
        lng: input.lng,
        country: input.country,
        place: input.place,
        event: input.event,
      });
      await apply((s) => ({ ...s, photos: [...(s.photos ?? []), photo] }));
      return id;
    },

    async editPhoto(photoId, patch) {
      requireMe();
      await apply((s) => ({
        ...s,
        photos: (s.photos ?? []).map((p) => (p.id === photoId ? updatePhoto(p, patch) : p)),
      }));
    },

    async removePhoto(photoId) {
      requireMe();
      const current = get().state;
      await apply((s) => ({ ...s, photos: (s.photos ?? []).filter((p) => p.id !== photoId) }));
      if (current)
        void repo()
          .deletePhotoBytes(current.room.slug, photoId)
          .catch(() => {});
    },
  };
});
