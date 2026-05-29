import {
  addMember,
  addNote,
  addOption,
  addStroke,
  appendMessage,
  castVote,
  claimItem,
  clearBoard,
  closePoll,
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
  type RsvpStatus,
  type SchedulePoll,
  type StrokeTool,
  type TimeOption,
  type VoteValue,
} from '@dap/shared';
import { create } from 'zustand';
import { getIdentity, getRepository, setIdentity } from '../lib/storage/index.js';

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
  postMessage: (text: string) => Promise<void>;

  // availability
  shareMyAvailability: (busy: BusyInterval[]) => Promise<void>;

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

  /** Apply a pure update to the current room and persist it. */
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
      // Roll back the optimistic change so the UI matches reality.
      set({ state: current, error: err instanceof Error ? err.message : 'Could not save' });
      return;
    } finally {
      pendingWrites--;
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
        meId: getIdentity(state.room.id),
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
      const { room, member } = addMember(current.room, { name });
      const next = { ...current, room };
      set({ state: next, meId: member.id });
      setIdentity(room.id, member.id);
      await repo().saveRoom(next);
      return member;
    },

    async linkGoogle(profile) {
      const me = requireMe();
      await apply((s) => ({ ...s, room: linkGoogleProfile(s.room, me, profile) }));
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

    async postMessage(text) {
      const me = requireMe();
      await apply((s) => ({
        ...s,
        messages: appendMessage(
          s.messages ?? [],
          createMessage({ roomId: s.room.id, authorId: me, text }),
        ),
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
  };
});
