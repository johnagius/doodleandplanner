/**
 * Core domain types for Doodle & Planner.
 *
 * Everything here is plain serialisable data so it can live equally well in
 * localStorage, an HTTP payload, or a future database row. Dates are stored as
 * ISO-8601 strings to stay JSON-friendly and timezone-explicit.
 */

export type ISODateTime = string;

export type MemberRole = 'owner' | 'member';

export interface Member {
  id: string;
  name: string;
  /** Hex colour used to identify the member on the doodle board and avatars. */
  color: string;
  role: MemberRole;
  joinedAt: ISODateTime;
  /** Present when the member has linked their Google account. */
  googleEmail?: string;
  /** Avatar image URL (e.g. Google profile photo), shown instead of initials. */
  avatarUrl?: string;
}

/** A PBKDF2 password hash, fully self-describing so it can be re-verified. */
export interface PasswordHash {
  algorithm: 'PBKDF2-SHA256';
  iterations: number;
  /** base64url-encoded salt. */
  salt: string;
  /** base64url-encoded derived key. */
  hash: string;
}

export interface RoomSettings {
  /** Allow anyone with the link to join without approval. */
  openJoin: boolean;
  /** Default duration (minutes) used when suggesting calendar slots. */
  defaultSlotMinutes: number;
  /** Working-hours window used by the slot finder, 0-24. */
  workingHours: { startHour: number; endHour: number };
  /** ISO 4217 currency code used for the inventory budget (e.g. "EUR"). */
  currency: string;
}

export interface Room {
  id: string;
  /** Short, human-shareable code used in invite links (e.g. "k7m2qp"). */
  slug: string;
  name: string;
  description?: string;
  createdAt: ISODateTime;
  createdBy: string;
  /** Secret token embedded in invite links; required to join. */
  inviteToken: string;
  /** When set, the room is password protected. */
  passwordHash?: PasswordHash;
  members: Member[];
  settings: RoomSettings;
}

export type VoteValue = 'yes' | 'no' | 'maybe';

export interface TimeOption {
  id: string;
  start: ISODateTime;
  end: ISODateTime;
}

export interface Vote {
  memberId: string;
  optionId: string;
  value: VoteValue;
}

export type PollStatus = 'open' | 'closed';

/** A "Doodle"-style scheduling poll: vote on candidate time slots. */
export interface SchedulePoll {
  id: string;
  roomId: string;
  title: string;
  description?: string;
  options: TimeOption[];
  votes: Vote[];
  status: PollStatus;
  /** Winning option once the poll is closed/decided. */
  finalOptionId?: string;
  /** Whether voters may pick "maybe" in addition to yes/no. */
  allowMaybe: boolean;
  createdAt: ISODateTime;
}

export interface OptionTally {
  optionId: string;
  yes: number;
  maybe: number;
  no: number;
  /** Weighted score: yes counts 1, maybe counts 0.5. */
  score: number;
  /** Members who voted yes — useful for "who's coming" UI. */
  yesMembers: string[];
}

export interface BusyInterval {
  start: ISODateTime;
  end: ISODateTime;
  /** Human label of the blocking event (e.g. "Dentist"), when known. */
  title?: string;
  /** 'tentative' is a soft conflict; defaults to a hard 'busy' block. */
  status?: 'busy' | 'tentative';
  /** All-day events get friendlier display. */
  allDay?: boolean;
}

/** A member's shared busy intervals, used to overlay availability on polls. */
export interface MemberAvailability {
  memberId: string;
  busy: BusyInterval[];
  updatedAt: ISODateTime;
}

export type ItemStatus = 'needed' | 'claimed' | 'done';

/** An inventory entry: something that needs bringing to the event. */
export interface InventoryItem {
  id: string;
  roomId: string;
  name: string;
  quantity: number;
  category?: string;
  claimedBy?: string;
  status: ItemStatus;
  notes?: string;
  /** Optional cost of the item; whoever claims it is assumed to have paid. */
  cost?: number;
  createdAt: ISODateTime;
}

/** A proposed activity to do during the event. */
export interface Activity {
  id: string;
  roomId: string;
  title: string;
  description?: string;
  proposedBy: string;
  /** Member ids that expressed interest. */
  interested: string[];
  durationMinutes?: number;
  scheduledAt?: ISODateTime;
  createdAt: ISODateTime;
}

export type RsvpStatus = 'going' | 'maybe' | 'declined';

export interface PlannedEvent {
  id: string;
  roomId: string;
  title: string;
  start: ISODateTime;
  end: ISODateTime;
  location?: string;
  description?: string;
  /** Set after the event is pushed to Google Calendar. */
  googleEventId?: string;
  /** Per-member attendance responses, keyed by member id. */
  rsvps?: Record<string, RsvpStatus>;
  createdAt: ISODateTime;
}

export interface Point {
  x: number;
  y: number;
}

/** Drawing tools. 'pen'/'eraser' use the full point path; shapes use the
 * first and last point as opposite corners (or endpoints for 'line'). */
export type StrokeTool = 'pen' | 'eraser' | 'line' | 'rect' | 'ellipse';

/** A stroke or shape. Coordinates are normalised 0..1 for resolution-independence. */
export interface Stroke {
  id: string;
  memberId: string;
  color: string;
  width: number;
  points: Point[];
  /** Defaults to 'pen' when absent (back-compat with older boards). */
  tool?: StrokeTool;
  createdAt: ISODateTime;
}

/** A draggable text sticky on the board. */
export interface StickyNote {
  id: string;
  memberId: string;
  text: string;
  color: string;
  /** Normalised top-left position 0..1. */
  x: number;
  y: number;
  createdAt: ISODateTime;
}

export interface DoodleBoard {
  id: string;
  roomId: string;
  strokes: Stroke[];
  /** Optional sticky notes (older boards omit this). */
  notes?: StickyNote[];
}

/** A chat message in the room discussion. */
export interface Message {
  id: string;
  roomId: string;
  authorId: string;
  text: string;
  createdAt: ISODateTime;
}

/** The complete persisted state for a single room. */
export interface RoomState {
  room: Room;
  polls: SchedulePoll[];
  inventory: InventoryItem[];
  activities: Activity[];
  events: PlannedEvent[];
  doodle: DoodleBoard;
  /** Room discussion. Optional for backward-compatibility with older states. */
  messages?: Message[];
  /** Per-member calendar availability shared for poll overlays. Optional. */
  availability?: MemberAvailability[];
}
