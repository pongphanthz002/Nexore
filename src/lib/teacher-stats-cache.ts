import { STORAGE_KEYS } from '@/config/storage.keys';
import type { SubjectStatsInput } from './class-stats';

/**
 * The teacher home statistics are kept in localStorage so moving between tabs (or reopening
 * the app) does not re-read every summary. Saving scores or attendance clears it, so the next
 * visit to the home page reads fresh summaries.
 */

/** Shown without re-reading while younger than this. */
export const TEACHER_STATS_FRESH_MS = 10 * 60 * 1000;

/** Bump when `SubjectStatsInput` changes shape, so older cached copies are ignored. */
export const TEACHER_STATS_VERSION = 3;

export interface CachedTeacherStats {
  version: number;
  /** `${schoolProjectId}:${teacherId}` */
  owner: string;
  savedAt: number;
  inputs: SubjectStatsInput[];
}

export function readTeacherStats(owner: string): CachedTeacherStats | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TEACHER_STATS);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedTeacherStats;
    return cached.version === TEACHER_STATS_VERSION && cached.owner === owner && Array.isArray(cached.inputs) ? cached : null;
  } catch {
    return null;
  }
}

export function writeTeacherStats(value: CachedTeacherStats): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TEACHER_STATS, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the page still works, it just reads again next time
  }
}

export function invalidateTeacherStats(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.TEACHER_STATS);
  } catch {
    // ignore
  }
}
