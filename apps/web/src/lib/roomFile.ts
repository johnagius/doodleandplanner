import { migrateRoomState, type RoomState } from '@dap/shared';

/** On-disk envelope for an exported room, so imports can be validated. */
export interface RoomFile {
  app: 'doodleandplanner';
  version: 1;
  exportedAt: string;
  state: RoomState;
}

export function serializeRoom(state: RoomState): string {
  const file: RoomFile = {
    app: 'doodleandplanner',
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
  };
  return JSON.stringify(file, null, 2);
}

/** Parse + validate an exported room file, returning the inner RoomState. */
export function parseRoomFile(text: string): RoomState {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON');
  }
  const file = data as Partial<RoomFile> | null;
  if (!file || file.app !== 'doodleandplanner' || !file.state) {
    throw new Error('Not a Doodle & Planner room file');
  }
  const state = file.state as RoomState;
  if (
    !state.room?.slug ||
    !Array.isArray(state.room.members) ||
    !Array.isArray(state.polls) ||
    !state.doodle
  ) {
    throw new Error('This room file is missing or malformed');
  }
  // Upgrade any older exported shape to the current schema.
  return migrateRoomState(state);
}

/** Trigger a browser download of the room as a JSON file. */
export function downloadRoom(state: RoomState): void {
  const blob = new Blob([serializeRoom(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `doodleandplanner-${state.room.slug}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
