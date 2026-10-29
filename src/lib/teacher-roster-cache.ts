import { STORAGE_KEYS } from '@/config/storage.keys';
import type { StudentData, SubjectData, TeacherFirebaseConfig } from '@/services/school-database.service';

/**
 * The teacher's own record, subjects and enrolled students, kept in localStorage so the grades
 * and attendance pages open at once instead of waiting on two School DB round trips. Shown up
 * to MAX_AGE; re-read in the background once older than FRESH. Any School DB write through
 * `schoolDatabaseService` clears it (see its invalidate methods), and sign-out removes it.
 */

/** Shown without re-reading while younger than this. */
export const TEACHER_ROSTER_FRESH_MS = 10 * 60 * 1000;
/** Older copies are ignored: the page waits for a fresh read. */
const TEACHER_ROSTER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Bump when the cached shape changes, so older copies are ignored. */
const TEACHER_ROSTER_VERSION = 1;

export interface TeacherRoster {
  teacher: TeacherFirebaseConfig | null;
  subjects: SubjectData[];
  students: StudentData[];
}

interface CachedTeacherRoster extends TeacherRoster {
  version: number;
  /** `${schoolProjectId}:${teacherId}` */
  owner: string;
  savedAt: number;
}

export function readTeacherRoster(owner: string): (TeacherRoster & { savedAt: number }) | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TEACHER_ROSTER);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedTeacherRoster;
    if (cached.version !== TEACHER_ROSTER_VERSION || cached.owner !== owner) return null;
    if (!Array.isArray(cached.subjects) || !Array.isArray(cached.students)) return null;
    if (Date.now() - cached.savedAt > TEACHER_ROSTER_MAX_AGE_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

export function writeTeacherRoster(owner: string, roster: TeacherRoster): void {
  // Only the fields the pages use: keeps the copy small and leaves out emails/uids
  const students = roster.students.map(s => ({ studentId: s.studentId, name: s.name, number: s.number, class: s.class }));
  const value = { version: TEACHER_ROSTER_VERSION, owner, savedAt: Date.now(), ...roster, students };
  try {
    localStorage.setItem(STORAGE_KEYS.TEACHER_ROSTER, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the pages still work, they just read again next time
  }
}

export function invalidateTeacherRoster(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.TEACHER_ROSTER);
  } catch {
    // ignore
  }
}
