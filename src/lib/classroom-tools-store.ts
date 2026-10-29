import { STORAGE_KEYS } from '@/config/storage.keys';
import type { GroupMode } from './classroom-tools';

/**
 * Per-room memory of the classroom tools, in localStorage only (never Firestore): who has been
 * called today (so the picker doesn't repeat), the "repeats allowed" switch, and the last groups.
 * A room is the sorted subject IDs of what is open (a merged period is one room).
 */

export interface RoomToolState {
  /** "YYYY-MM-DD" the `called` list belongs to; a new day starts a new round */
  calledDate?: string;
  called?: string[];
  allowRepeat?: boolean;
  pickCount?: number;
  groups?: { mode: GroupMode; n: number; ids: string[][]; balanced: boolean };
  groupMode?: GroupMode;
  groupN?: number;
}

const MAX_ROOMS = 40;

export const roomKeyOf = (subjectIds: string[]) => [...subjectIds].sort().join(',');

export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function readAll(): Record<string, RoomToolState & { at?: number }> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CLASSROOM_TOOLS);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function readRoomState(roomKey: string): RoomToolState {
  const state = readAll()[roomKey] ?? {};
  if (state.calledDate !== todayKey()) return { ...state, called: [], calledDate: todayKey() };
  return state;
}

export function writeRoomState(roomKey: string, patch: Partial<RoomToolState>): void {
  try {
    const all = readAll();
    all[roomKey] = { ...readRoomState(roomKey), ...patch, at: Date.now() };
    // Keep the most recently used rooms only
    const keys = Object.keys(all).sort((a, b) => (all[b].at ?? 0) - (all[a].at ?? 0));
    keys.slice(MAX_ROOMS).forEach(k => { delete all[k]; });
    localStorage.setItem(STORAGE_KEYS.CLASSROOM_TOOLS, JSON.stringify(all));
  } catch {
    // Storage full or blocked: the tools still work, they just forget
  }
}
