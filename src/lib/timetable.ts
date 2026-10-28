import type { SubjectData } from '@/services/school-database.service';

/**
 * Timetable model shared by the teacher and student timetable (home card + full screen)
 * and the attendance bar. Subjects store Thai day names and "08:30-09:20" time ranges.
 */

export type TimetableRole = 'teacher' | 'student';

/** getDay() index → the Thai day name stored on subjects. */
export const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'] as const;
export const THAI_DAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const;
export const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** Monday-first week, the order of the day dots. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export interface TimetableEntry {
  key: string;
  day: number;
  subjectName: string;
  subjectCode: string;
  /** Subjects taught together in this period (same subject name, same time); usually one. */
  subjects: SubjectData[];
  classrooms: string[];
  room: string;
  teacherName: string;
  start: number;
  end: number;
  hours: number;
  hue: SubjectHue;
}

/** Teacher info a timetable needs: the name students see and the room subjects fall back to. */
export interface TimetableTeacher {
  teacherId: string;
  name: string;
  defaultRoom?: string;
}

/** "08:30-09:20", "8.30 - 9.20" → minutes since midnight. */
export function parseTimeRange(time: string | undefined): { start: number; end: number } | null {
  if (!time) return null;
  const m = time.replace(/\./g, ':').replace(/\s+/g, '').match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const start = +m[1] * 60 + +m[2];
  const end = +m[3] * 60 + +m[4];
  return end > start ? { start, end } : null;
}

export const formatMinutes = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** "พุธ 28 ต.ค." for a weekday of the current week (Monday-first). */
export function dayDateLabel(day: number, today = new Date()): string {
  const date = dateOfWeekday(day, today);
  return `${THAI_DAYS[day]} ${date.getDate()} ${THAI_MONTHS_SHORT[date.getMonth()]}`;
}

export function dateOfWeekday(day: number, today = new Date()): Date {
  const offset = WEEK_ORDER.indexOf(day) - WEEK_ORDER.indexOf(today.getDay());
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  d.setDate(d.getDate() + offset);
  return d;
}

/** Attendance documents key their date as "Wed 28/10". */
export function attendanceDateKey(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`;
}

export const roomLabel = (room: string) => (/^\d/.test(room) ? `ห้อง ${room}` : room);

/** A subject's slots (schedules, or the legacy single day/time). */
function slotsOf(subject: SubjectData) {
  const slots = subject.schedules && subject.schedules.length > 0
    ? subject.schedules
    : [{ day: subject.day, time: subject.time, duration: subject.duration }];
  return slots.filter(s => s.day && s.time);
}

// ---------------------------------------------------------------------------
// Subject colours (palette B): one hue per subject name, in a stable order.
// ---------------------------------------------------------------------------

export type SubjectHue = 'blue' | 'green' | 'orange' | 'pink' | 'teal' | 'cyan' | 'amber' | 'lime';
const HUE_ORDER: SubjectHue[] = ['blue', 'green', 'orange', 'pink', 'teal', 'cyan', 'amber', 'lime'];

/** [100, 300, 500, 700, 900] steps of each Tailwind hue. */
const HUES: Record<SubjectHue, [string, string, string, string, string]> = {
  blue:   ['#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a8a'],
  green:  ['#dcfce7', '#86efac', '#22c55e', '#15803d', '#14532d'],
  orange: ['#ffedd5', '#fdba74', '#f97316', '#c2410c', '#7c2d12'],
  pink:   ['#fce7f3', '#f9a8d4', '#ec4899', '#be185d', '#831843'],
  teal:   ['#ccfbf1', '#5eead4', '#14b8a6', '#0f766e', '#134e4a'],
  cyan:   ['#cffafe', '#67e8f9', '#06b6d4', '#0e7490', '#164e63'],
  amber:  ['#fef3c7', '#fcd34d', '#f59e0b', '#b45309', '#78350f'],
  lime:   ['#ecfccb', '#bef264', '#84cc16', '#4d7c0f', '#365314'],
};

function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v * t + B[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
}

/** CSS variables for a subject block: --sb background, --sbar side bar, --st name, --sbig big line. */
export function hueVars(hue: SubjectHue, isDark: boolean): React.CSSProperties {
  const c = HUES[hue];
  const vars = isDark
    ? { '--sb': mix(c[2], '#262a33', 0.24), '--sbar': c[2], '--st': c[1], '--sbig': '#ffffff', '--smeta': 'rgb(255 255 255 / 0.72)' }
    : { '--sb': c[0], '--sbar': c[2], '--st': c[3], '--sbig': c[4], '--smeta': '#4b5563' };
  return vars as React.CSSProperties;
}

/** A subject's colour for chart marks (the 500 step). */
export function hueColor(hue: SubjectHue): string {
  return HUES[hue][2];
}

export function buildHueMap(subjects: { subjectName: string }[]): Map<string, SubjectHue> {
  const map = new Map<string, SubjectHue>();
  for (const s of subjects) {
    if (!map.has(s.subjectName)) map.set(s.subjectName, HUE_ORDER[map.size % HUE_ORDER.length]);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

/**
 * One day's periods. For a teacher, a subject taught to several rooms at the same time
 * (same name, same start and end) becomes one entry with every room.
 */
export function entriesForDay(
  subjects: SubjectData[],
  day: number,
  role: TimetableRole,
  teachers: Map<string, TimetableTeacher>,
  hues: Map<string, SubjectHue>,
): TimetableEntry[] {
  const dayName = THAI_DAYS[day];
  const byKey = new Map<string, TimetableEntry>();
  for (const subject of subjects) {
    for (const slot of slotsOf(subject)) {
      if (slot.day !== dayName) continue;
      const range = parseTimeRange(slot.time);
      if (!range) continue;
      const teacher = teachers.get(subject.teacherId);
      const key = role === 'teacher'
        ? `${subject.subjectName}|${range.start}|${range.end}`
        : `${subject.subjectId}|${range.start}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.subjects.push(subject);
        existing.classrooms.push(subject.classroom);
        continue;
      }
      byKey.set(key, {
        key,
        day,
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode || '',
        subjects: [subject],
        classrooms: [subject.classroom],
        room: subject.room || teacher?.defaultRoom || '',
        teacherName: teacher?.name || '',
        start: range.start,
        end: range.end,
        hours: parseInt(slot.duration || subject.duration || '1') || 1,
        hue: hues.get(subject.subjectName) || 'blue',
      });
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.start - b.start);
}

/** One range for every day of the week, from the whole week's periods, rounded to half hours. */
export function weekRange(weekEntries: TimetableEntry[][]): { from: number; to: number } {
  let lo = Infinity, hi = -Infinity;
  for (const list of weekEntries) for (const e of list) { lo = Math.min(lo, e.start); hi = Math.max(hi, e.end); }
  if (lo === Infinity) return { from: 8 * 60, to: 16 * 60 };
  return { from: Math.floor(lo / 30) * 30, to: Math.ceil(hi / 30) * 30 };
}

/** Range start, then every full hour up to the end. */
export function rangeTicks(from: number, to: number): number[] {
  const ticks = [from];
  for (let m = Math.ceil((from + 1) / 60) * 60; m <= to; m += 60) ticks.push(m);
  return ticks;
}

export const periodCount = (list: TimetableEntry[]) => list.reduce((sum, e) => sum + e.hours, 0);

/** Days shown in the full-screen view: Monday–Friday, weekend days only when they have periods (or are today). */
export function visibleDays(week: Map<number, TimetableEntry[]>, today: number): number[] {
  return WEEK_ORDER.filter(d => (d >= 1 && d <= 5) || (week.get(d)?.length ?? 0) > 0 || d === today);
}

/** "subjectId|classroom" for attendance already recorded today. */
export const checkedKey = (subjectId: string, classroom: string) => `${subjectId}|${classroom}`;

/** The teacher's period that is running now and not yet checked in every room. */
export function attendanceDue(today: TimetableEntry[], now: number, checked: Set<string>): TimetableEntry | null {
  return today.find(e =>
    now >= e.start && now < e.end && e.subjects.some(s => !checked.has(checkedKey(s.subjectId, s.classroom))),
  ) ?? null;
}

/** Query string that opens the normal attendance page for a period (all its rooms, today, its hours). */
export function attendanceHref(entry: TimetableEntry): string {
  const ids = entry.subjects.map(s => s.subjectId).join(',');
  return `/teacher/dashboard/schedules?mode=attendance&subjectIds=${encodeURIComponent(ids)}&hours=${entry.hours}`;
}

// ---------------------------------------------------------------------------
// Subject picker (grades and attendance pages)
// ---------------------------------------------------------------------------

/** One subject the teacher teaches, with every room it is taught to. */
export interface SubjectGroup {
  key: string;
  subjectName: string;
  subjectCode: string;
  hue: SubjectHue;
  /** One subject per classroom, sorted by classroom. */
  rooms: SubjectData[];
}

/** Subjects grouped by name and code (one room each, the first doc wins), sorted by name. */
export function subjectGroups(subjects: SubjectData[], hues: Map<string, SubjectHue>): SubjectGroup[] {
  const byKey = new Map<string, SubjectGroup>();
  for (const subject of subjects) {
    const key = `${subject.subjectName}|${subject.subjectCode || ''}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, subjectName: subject.subjectName, subjectCode: subject.subjectCode || '', hue: hues.get(subject.subjectName) || 'blue', rooms: [] };
      byKey.set(key, group);
    }
    if (!group.rooms.some(r => r.classroom === subject.classroom)) group.rooms.push(subject);
  }
  const groups = Array.from(byKey.values());
  for (const g of groups) g.rooms.sort((a, b) => a.classroom.localeCompare(b.classroom, 'th', { numeric: true }));
  return groups.sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'th') || a.subjectCode.localeCompare(b.subjectCode, 'th'));
}

/** A period of today relative to now (minutes since midnight). */
export function periodState(entry: { start: number; end: number }, now: number): 'past' | 'current' | 'upcoming' {
  if (now >= entry.end) return 'past';
  return now >= entry.start ? 'current' : 'upcoming';
}
