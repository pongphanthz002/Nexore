import type {
  Assignment, AssignmentGroup, AttendanceSummary, GradeConfig, StudentScore,
} from '@/services/teacher-database.service';
import {
  assignmentIdsInOrder, buildColumns, computeBreakdown, DEFAULT_THRESHOLDS, getFieldValue, round2,
} from './grade-calculation';
import { THAI_MONTHS_SHORT } from './timetable';

/**
 * Class statistics for the teacher home dashboard.
 *
 * Reads are kept low by storing one small summary document per subject in the Teacher DB
 * (`gradeSummaries/{subjectId}`, written by the grades page from the data it already has in
 * memory) next to the existing `attendanceSummaries/{subjectId}`. The home page then needs two
 * document reads per subject, whatever the class size or number of assignments.
 */

export const GRADE_SUMMARY_VERSION = 2;

export interface GradeSummaryStudent {
  name: string;
  number: string;
  classroom: string;
  total: number;
  grade: string;
  /** visible assignments with no score */
  pending: number;
  /** ids of those assignments */
  pendingIds: string[];
  /** cells with a score (visible assignments + exams) */
  entered: number;
}

export interface GradeSummaryAssignment {
  id: string;
  title: string;
  maxScore: number;
  /** "YYYY-MM-DD": the deadline, else the day the assignment was created; "" when neither is known */
  due: string;
  /** students with a score */
  submitted: number;
  /** mean of entered scores; null when nobody has one */
  average: number | null;
}

export interface GradeSummary {
  subjectId: string;
  classroom: string;
  version: number;
  /** someone has at least one score: before that, totals and grades mean nothing */
  hasScores: boolean;
  /** visible assignments in column order */
  assignments: GradeSummaryAssignment[];
  students: Record<string, GradeSummaryStudent>;
  /** grade labels of the subject's scale, highest first */
  scale: string[];
  updatedAt?: unknown;
}

export interface RosterStudent {
  studentId: string;
  name: string;
  number: string;
  class: string;
}

function gradeScale(config: GradeConfig | null | undefined): string[] {
  const thresholds = config?.thresholds?.length ? config.thresholds : DEFAULT_THRESHOLDS;
  return [...thresholds].sort((a, b) => b.minScore - a.minScore).map(t => t.grade);
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** An assignment's due day: its deadline when it parses, else its creation day. */
export function dueDay(a: Pick<Assignment, 'deadline' | 'createdAt'>): string {
  const deadline = String(a.deadline || '');
  const m = deadline.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (deadline) {
    const parsed = new Date(deadline);
    if (!Number.isNaN(parsed.getTime())) return isoDay(parsed);
  }
  const created = a.createdAt as unknown;
  if (created instanceof Date && !Number.isNaN(created.getTime())) return isoDay(created);
  const ts = created as { toDate?: () => Date } | undefined;
  return typeof ts?.toDate === 'function' ? isoDay(ts.toDate()) : '';
}

export function buildGradeSummary(
  subjectId: string,
  classroom: string,
  roster: RosterStudent[],
  assignments: Assignment[],
  groups: AssignmentGroup[],
  config: GradeConfig | null | undefined,
  scores: StudentScore[],
): GradeSummary {
  const byId = new Map(scores.map(s => [s.studentId, s]));
  const orderedIds = assignmentIdsInOrder(buildColumns(assignments, groups));
  const visible = orderedIds
    .map(id => assignments.find(a => a.id === id))
    .filter((a): a is Assignment => !!a && a.isVisible);

  const students: Record<string, GradeSummaryStudent> = {};
  let hasScores = false;
  for (const s of roster) {
    const score = byId.get(s.studentId);
    const b = computeBreakdown(score, assignments, groups, config);
    const pendingIds = visible.filter(a => getFieldValue(score, `a:${a.id}`) === undefined).map(a => a.id);
    const entered = visible.length - pendingIds.length
      + (b.midtermRaw !== undefined ? 1 : 0) + (b.finalRaw !== undefined ? 1 : 0);
    if (entered > 0) hasScores = true;
    students[s.studentId] = {
      name: s.name || s.studentId,
      number: String(s.number ?? ''),
      classroom: s.class || classroom,
      total: b.total,
      grade: b.grade,
      pending: pendingIds.length,
      pendingIds,
      entered,
    };
  }

  const summaryAssignments = visible.map(a => {
    const values = roster
      .map(s => getFieldValue(byId.get(s.studentId), `a:${a.id}`))
      .filter((v): v is number => v !== undefined);
    return {
      id: a.id,
      title: a.title || 'ไม่มีชื่องาน',
      maxScore: a.maxScore || 0,
      due: dueDay(a),
      submitted: values.length,
      average: values.length ? round2(values.reduce((x, y) => x + y, 0) / values.length) : null,
    };
  });

  return {
    subjectId,
    classroom,
    version: GRADE_SUMMARY_VERSION,
    hasScores,
    assignments: summaryAssignments,
    students,
    scale: gradeScale(config),
  };
}

/** Compare summaries without their timestamp, to skip writes that change nothing. */
export function gradeSummaryFingerprint(summary: GradeSummary | null | undefined): string {
  if (!summary) return '';
  const rest = { ...summary };
  delete rest.updatedAt;
  const students = Object.keys(rest.students).sort().map(id => [id, rest.students[id]]);
  return JSON.stringify({ ...rest, students });
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export type AttendanceKind = 'present' | 'late' | 'leave' | 'absent';
export const ATTENDANCE_KINDS: AttendanceKind[] = ['present', 'late', 'leave', 'absent'];

/** มา (with กิจกรรม), สาย, ลา (ป่วย/กิจ), ขาด (with หนี) */
const KIND_OF: Record<string, AttendanceKind> = {
  'มา': 'present', 'กิจกรรม': 'present', 'สาย': 'late', 'ลาป่วย': 'leave', 'ลากิจ': 'leave', 'ขาด': 'absent', 'หนี': 'absent',
};

/** One checked session: student-hours per kind. */
export interface SessionMix extends Record<AttendanceKind, number> {
  /** "Wed 28/10", as attendance documents key their date */
  date: string;
  classroom: string;
}

/** Compact a subject's attendance summary to one row per session (blank statuses ignored). */
export function sessionMixes(summary: AttendanceSummary): SessionMix[] {
  const rows = new Map<string, SessionMix>();
  for (const [sessionId, session] of Object.entries(summary.sessions || {})) {
    rows.set(sessionId, { date: session.date, classroom: session.classroom, present: 0, late: 0, leave: 0, absent: 0 });
  }
  for (const statuses of Object.values(summary.students || {})) {
    for (const [sessionId, status] of Object.entries(statuses || {})) {
      const row = rows.get(sessionId);
      const kind = KIND_OF[status];
      if (row && kind) row[kind] += Number(summary.sessions[sessionId]?.hours) || 1;
    }
  }
  return Array.from(rows.values()).filter(r => r.present + r.late + r.leave + r.absent > 0);
}

/**
 * The calendar day of a session date like "Wed 28/10". Dates carry no year: it is the latest
 * such day that is not after `today`.
 */
export function sessionDay(date: string, today: Date): Date | null {
  const m = date.match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const d = new Date(today.getFullYear(), +m[2] - 1, +m[1]);
  if (Number.isNaN(d.getTime())) return null;
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59);
  if (d > end) d.setFullYear(d.getFullYear() - 1);
  return d;
}

// ---------------------------------------------------------------------------
// Teacher dashboard
// ---------------------------------------------------------------------------

/** What the home page keeps (and caches) per subject. */
export interface SubjectStatsInput {
  subjectId: string;
  subjectName: string;
  classroom: string;
  grades: GradeSummary | null;
  sessions: SessionMix[] | null;
}

export interface PodiumEntry {
  studentId: string;
  name: string;
  classroom: string;
  /** mean total over the subjects with scores */
  total: number;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'th');

/** Highest mean totals over the teacher's subjects that have scores. */
export function topScores(inputs: SubjectStatsInput[], count = 3): PodiumEntry[] {
  const rows = new Map<string, { name: string; classroom: string; totals: number[] }>();
  for (const input of inputs) {
    if (!input.grades?.hasScores) continue;
    for (const [id, s] of Object.entries(input.grades.students)) {
      const row = rows.get(id) ?? { name: s.name, classroom: s.classroom, totals: [] };
      row.totals.push(s.total);
      rows.set(id, row);
    }
  }
  return Array.from(rows.entries())
    .map(([studentId, r]) => ({ studentId, name: r.name, classroom: r.classroom, total: round2(r.totals.reduce((a, b) => a + b, 0) / r.totals.length) }))
    .sort((a, b) => b.total - a.total || byName(a, b))
    .slice(0, count);
}

export type PendingRange = 'month' | 'term';

export interface PendingTimeline {
  labels: string[];
  rows: { studentId: string; name: string; classroom: string; counts: number[] }[];
  /** largest count, for the chart's scale */
  max: number;
}

const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

/** Points of the pending chart: four weeks up to today, or month ends since the school year began (May). */
export function pendingPoints(range: PendingRange, today: Date): { at: Date; label: string }[] {
  if (range === 'month') {
    return [21, 14, 7, 0].map(back => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
      return { at: endOfDay(d), label: `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]}` };
    });
  }
  const startYear = today.getMonth() >= 4 ? today.getFullYear() : today.getFullYear() - 1;
  const points: { at: Date; label: string }[] = [];
  for (let d = new Date(startYear, 4, 1); d <= today; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    points.push({ at: endOfDay(monthEnd < today ? monthEnd : today), label: THAI_MONTHS_SHORT[d.getMonth()] });
  }
  return points.slice(-6);
}

/**
 * Pending work that is due (deadline passed, or no deadline and already given) at each point,
 * for the students with the most of it today. Counts only work still without a score now.
 */
export function pendingTimeline(inputs: SubjectStatsInput[], range: PendingRange, today: Date, count = 5): PendingTimeline {
  const points = pendingPoints(range, today);
  const rows = new Map<string, { name: string; classroom: string; dues: number[] }>();
  for (const input of inputs) {
    const g = input.grades;
    if (!g) continue;
    const dueOf = new Map(g.assignments.map(a => [a.id, a.due]));
    for (const [id, s] of Object.entries(g.students)) {
      for (const assignmentId of s.pendingIds || []) {
        const due = dueOf.get(assignmentId);
        if (!due) continue;
        const [y, m, d] = due.split('-').map(Number);
        const row = rows.get(id) ?? { name: s.name, classroom: s.classroom, dues: [] };
        row.dues.push(new Date(y, m - 1, d).getTime());
        rows.set(id, row);
      }
    }
  }
  const ranked = Array.from(rows.entries())
    .map(([studentId, r]) => ({
      studentId, name: r.name, classroom: r.classroom,
      counts: points.map(p => r.dues.filter(t => t <= p.at.getTime()).length),
    }))
    .filter(r => r.counts[r.counts.length - 1] > 0)
    .sort((a, b) => b.counts[b.counts.length - 1] - a.counts[a.counts.length - 1] || byName(a, b))
    .slice(0, count);
  return { labels: points.map(p => p.label), rows: ranked, max: Math.max(0, ...ranked.flatMap(r => r.counts)) };
}

export type AttendanceRange = 'week' | 'month' | 'term';

export interface RoomAttendance {
  room: string;
  hours: number;
  /** share of checked student-hours, 0–100 with one decimal */
  pct: Record<AttendanceKind, number>;
}

export interface AttendanceComparison {
  rooms: RoomAttendance[];
  /** share over every room */
  overall: Record<AttendanceKind, number>;
  /** the room with the highest share of each kind */
  peaks: { kind: AttendanceKind; room: string; value: number }[];
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

function inRange(day: Date, range: AttendanceRange, today: Date): boolean {
  if (range === 'term') return true;
  if (range === 'month') return day.getFullYear() === today.getFullYear() && day.getMonth() === today.getMonth();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  return day >= monday && day <= endOfDay(today);
}

/** มา / สาย / ลา / ขาด per room (the session's classroom) over the teacher's subjects. */
export function attendanceByRoom(inputs: SubjectStatsInput[], range: AttendanceRange, today: Date): AttendanceComparison {
  const sums = new Map<string, Record<AttendanceKind, number>>();
  for (const input of inputs) {
    for (const s of input.sessions || []) {
      const day = sessionDay(s.date, today);
      if (!day || !inRange(day, range, today)) continue;
      const room = s.classroom || input.classroom;
      const sum = sums.get(room) ?? { present: 0, late: 0, leave: 0, absent: 0 };
      ATTENDANCE_KINDS.forEach(k => { sum[k] += s[k]; });
      sums.set(room, sum);
    }
  }
  const all = { present: 0, late: 0, leave: 0, absent: 0 };
  const rooms = Array.from(sums.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'th', { numeric: true }))
    .map(([room, sum]) => {
      const hours = ATTENDANCE_KINDS.reduce((t, k) => t + sum[k], 0);
      ATTENDANCE_KINDS.forEach(k => { all[k] += sum[k]; });
      return { room, hours, pct: Object.fromEntries(ATTENDANCE_KINDS.map(k => [k, pct(sum[k], hours)])) as Record<AttendanceKind, number> };
    });
  const total = ATTENDANCE_KINDS.reduce((t, k) => t + all[k], 0);
  const peaks = rooms.length === 0 ? [] : ATTENDANCE_KINDS.map(kind => {
    const best = rooms.reduce((a, b) => (b.pct[kind] > a.pct[kind] ? b : a));
    return { kind, room: best.room, value: best.pct[kind] };
  });
  return { rooms, overall: Object.fromEntries(ATTENDANCE_KINDS.map(k => [k, pct(all[k], total)])) as Record<AttendanceKind, number>, peaks };
}
