import type {
  Assignment, AssignmentGroup, AttendanceSummary, GradeConfig, StudentScore,
} from '@/services/teacher-database.service';
import {
  assignmentIdsInOrder, buildColumns, computeBreakdown, DEFAULT_THRESHOLDS, getFieldValue, round2,
} from './grade-calculation';
import { ATTENDANCE_THRESHOLD } from './attendance';

/**
 * Class statistics for the teacher home page and the per-student popup.
 *
 * Reads are kept low by storing one small summary document per subject in the Teacher DB
 * (`gradeSummaries/{subjectId}`, written by the grades page from the data it already has in
 * memory) next to the existing `attendanceSummaries/{subjectId}`. The home page then needs two
 * document reads per subject, whatever the class size or number of assignments.
 */

export const GRADE_SUMMARY_VERSION = 1;

export interface GradeSummaryStudent {
  name: string;
  number: string;
  classroom: string;
  total: number;
  grade: string;
  /** visible assignments with no score */
  pending: number;
  /** cells with a score (visible assignments + exams) */
  entered: number;
}

export interface GradeSummaryAssignment {
  id: string;
  title: string;
  maxScore: number;
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
    const entered = visible.filter(a => getFieldValue(score, `a:${a.id}`) !== undefined).length
      + (b.midtermRaw !== undefined ? 1 : 0) + (b.finalRaw !== undefined ? 1 : 0);
    if (entered > 0) hasScores = true;
    students[s.studentId] = {
      name: s.name || s.studentId,
      number: String(s.number ?? ''),
      classroom: s.class || classroom,
      total: b.total,
      grade: b.grade,
      pending: b.pending,
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

export interface AttendanceHours {
  /** มา + สาย + กิจกรรม */
  present: number;
  /** ลาป่วย + ลากิจ */
  leave: number;
  /** ขาด + หนี */
  absent: number;
}

const PRESENT = new Set(['มา', 'สาย', 'กิจกรรม']);
const LEAVE = new Set(['ลาป่วย', 'ลากิจ']);
const ABSENT = new Set(['ขาด', 'หนี']);

export const attendanceTotal = (h: AttendanceHours) => h.present + h.leave + h.absent;

/** Present share in % (one decimal), null before any recorded session. */
export function attendanceRate(h: AttendanceHours | undefined): number | null {
  if (!h) return null;
  const total = attendanceTotal(h);
  return total > 0 ? Math.round((h.present / total) * 1000) / 10 : null;
}

/** Hours per student from a subject's attendance summary (blank statuses ignored). */
export function attendanceHoursByStudent(summary: AttendanceSummary): Record<string, AttendanceHours> {
  const out: Record<string, AttendanceHours> = {};
  for (const [studentId, sessions] of Object.entries(summary.students || {})) {
    const h: AttendanceHours = { present: 0, leave: 0, absent: 0 };
    for (const [sessionId, status] of Object.entries(sessions || {})) {
      const hours = Number(summary.sessions?.[sessionId]?.hours) || 1;
      if (PRESENT.has(status)) h.present += hours;
      else if (LEAVE.has(status)) h.leave += hours;
      else if (ABSENT.has(status)) h.absent += hours;
    }
    out[studentId] = h;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Teacher overview
// ---------------------------------------------------------------------------

/** What the home page keeps (and caches) per subject. */
export interface SubjectStatsInput {
  subjectId: string;
  subjectName: string;
  classroom: string;
  grades: GradeSummary | null;
  attendance: Record<string, AttendanceHours> | null;
}

export interface StudentStatRow {
  studentId: string;
  name: string;
  number: string;
  classroom: string;
  /** mean total over the subjects with scores; null when none */
  total: number | null;
  /** the grade, only when one subject is selected */
  grade: string | null;
  pending: number;
  hours: AttendanceHours;
  rate: number | null;
}

export interface SubjectStatRow {
  subjectId: string;
  subjectName: string;
  classroom: string;
  averageTotal: number | null;
  attendanceRate: number | null;
  pending: number;
  students: number;
}

export interface AssignmentStatRow {
  id: string;
  title: string;
  submitted: number;
  students: number;
  /** submitted share in % */
  rate: number;
}

export interface TeacherStats {
  studentCount: number;
  averageTotal: number | null;
  /** mean of numeric grades over (student, subject) pairs with scores */
  gradePointAverage: number | null;
  pendingTotal: number;
  studentsWithPending: number;
  attendanceRate: number | null;
  belowThreshold: number;
  podium: StudentStatRow[];
  mostPending: StudentStatRow[];
  mostAbsent: StudentStatRow[];
  /** grade label → count, lowest grade first */
  grades: { label: string; count: number }[];
  attendanceMix: AttendanceHours;
  subjects: SubjectStatRow[];
  /** single subject only: lowest submission first */
  assignments: AssignmentStatRow[];
  /** at least one subject has scores */
  hasScores: boolean;
  /** at least one recorded attendance hour */
  hasAttendance: boolean;
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'th');

function gradeSortValue(label: string): number {
  const n = parseFloat(label);
  return Number.isFinite(n) ? n : -1;
}

/**
 * Everything the home statistics show. `subjectId` narrows to one subject; otherwise a
 * student's numbers are averaged (score) or summed (pending work, hours) over the
 * teacher's subjects they take.
 */
export function computeTeacherStats(inputs: SubjectStatsInput[], subjectId?: string | null): TeacherStats {
  const list = subjectId ? inputs.filter(i => i.subjectId === subjectId) : inputs;
  const single = !!subjectId && list.length === 1;

  const rows = new Map<string, StudentStatRow & { totals: number[] }>();
  const rowFor = (id: string, fallback?: Partial<StudentStatRow>) => {
    let row = rows.get(id);
    if (!row) {
      row = {
        studentId: id, name: fallback?.name || id, number: fallback?.number || '', classroom: fallback?.classroom || '',
        total: null, grade: null, pending: 0, hours: { present: 0, leave: 0, absent: 0 }, rate: null, totals: [],
      };
      rows.set(id, row);
    } else if (fallback?.name && row.name === id) {
      Object.assign(row, { name: fallback.name, number: fallback.number || row.number, classroom: fallback.classroom || row.classroom });
    }
    return row;
  };

  const gradeCounts = new Map<string, number>();
  const gradePoints: number[] = [];
  const mix: AttendanceHours = { present: 0, leave: 0, absent: 0 };
  const subjects: SubjectStatRow[] = [];

  for (const input of list) {
    const g = input.grades;
    const roster = g ? Object.keys(g.students) : [];
    const rosterSet = new Set(roster);
    const totals: number[] = [];
    let pending = 0;

    if (g) {
      for (const label of g.scale) if (!gradeCounts.has(label)) gradeCounts.set(label, 0);
      for (const [id, s] of Object.entries(g.students)) {
        const row = rowFor(id, s);
        row.pending += s.pending;
        pending += s.pending;
        if (g.hasScores) {
          row.totals.push(s.total);
          totals.push(s.total);
          gradeCounts.set(s.grade, (gradeCounts.get(s.grade) ?? 0) + 1);
          const point = parseFloat(s.grade);
          if (Number.isFinite(point)) gradePoints.push(point);
          if (single) row.grade = s.grade;
        }
      }
    }

    const subjectHours: AttendanceHours = { present: 0, leave: 0, absent: 0 };
    for (const [id, h] of Object.entries(input.attendance || {})) {
      // Without a roster, keep everyone; with one, drop students who left the subject
      if (g && !rosterSet.has(id)) continue;
      const row = rowFor(id);
      row.hours.present += h.present; row.hours.leave += h.leave; row.hours.absent += h.absent;
      subjectHours.present += h.present; subjectHours.leave += h.leave; subjectHours.absent += h.absent;
    }
    mix.present += subjectHours.present; mix.leave += subjectHours.leave; mix.absent += subjectHours.absent;

    const avg = mean(totals);
    subjects.push({
      subjectId: input.subjectId,
      subjectName: input.subjectName,
      classroom: input.classroom,
      averageTotal: avg === null ? null : round2(avg),
      attendanceRate: attendanceRate(subjectHours),
      pending,
      students: roster.length || Object.keys(input.attendance || {}).length,
    });
  }

  const students: StudentStatRow[] = Array.from(rows.values()).map(({ totals, ...row }) => {
    const avg = mean(totals);
    return { ...row, total: avg === null ? null : round2(avg), rate: attendanceRate(row.hours) };
  });

  const withTotal = students.filter(s => s.total !== null);
  const rates = students.map(s => s.rate).filter((r): r is number => r !== null);
  const avgTotal = mean(withTotal.map(s => s.total as number));
  const gpa = mean(gradePoints);

  const assignments: AssignmentStatRow[] = single && list[0].grades
    ? list[0].grades.assignments.map(a => {
        const count = Object.keys(list[0].grades!.students).length;
        return { id: a.id, title: a.title, submitted: a.submitted, students: count, rate: count ? Math.round((a.submitted / count) * 100) : 0 };
      }).sort((a, b) => a.rate - b.rate || a.title.localeCompare(b.title, 'th'))
    : [];

  return {
    studentCount: students.length,
    averageTotal: avgTotal === null ? null : round2(avgTotal),
    gradePointAverage: gpa === null ? null : Math.round(gpa * 100) / 100,
    pendingTotal: students.reduce((sum, s) => sum + s.pending, 0),
    studentsWithPending: students.filter(s => s.pending > 0).length,
    attendanceRate: attendanceRate(mix),
    belowThreshold: rates.filter(r => r < ATTENDANCE_THRESHOLD).length,
    podium: [...withTotal].sort((a, b) => (b.total as number) - (a.total as number) || byName(a, b)).slice(0, 3),
    mostPending: students.filter(s => s.pending > 0).sort((a, b) => b.pending - a.pending || byName(a, b)).slice(0, 5),
    mostAbsent: students
      .filter(s => s.hours.absent > 0)
      .sort((a, b) => b.hours.absent - a.hours.absent || (a.rate ?? 100) - (b.rate ?? 100) || byName(a, b))
      .slice(0, 5),
    grades: Array.from(gradeCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => gradeSortValue(a.label) - gradeSortValue(b.label)),
    attendanceMix: mix,
    subjects,
    assignments,
    hasScores: list.some(i => i.grades?.hasScores),
    hasAttendance: attendanceTotal(mix) > 0,
  };
}

// ---------------------------------------------------------------------------
// One student inside their class (per-student popup)
// ---------------------------------------------------------------------------

export interface ClassPosition {
  /** 1-based rank by total (ties share a rank) */
  rank: number;
  of: number;
  classAverage: { total: number; collected: number; midterm: number; final: number };
  /** assignmentId → mean of entered scores */
  assignmentAverages: Record<string, number | null>;
}

export function classPosition(
  studentId: string,
  roster: { studentId: string }[],
  assignments: Assignment[],
  groups: AssignmentGroup[],
  config: GradeConfig | null | undefined,
  scores: StudentScore[],
): ClassPosition {
  const byId = new Map(scores.map(s => [s.studentId, s]));
  const breakdowns = roster.map(s => ({ id: s.studentId, b: computeBreakdown(byId.get(s.studentId), assignments, groups, config) }));
  const own = breakdowns.find(x => x.id === studentId)?.b.total ?? 0;
  const avg = (pick: (b: (typeof breakdowns)[number]['b']) => number) =>
    round2(mean(breakdowns.map(x => pick(x.b))) ?? 0);

  const assignmentAverages: Record<string, number | null> = {};
  for (const a of assignments) {
    const values = roster
      .map(s => getFieldValue(byId.get(s.studentId), `a:${a.id}`))
      .filter((v): v is number => v !== undefined);
    assignmentAverages[a.id] = values.length ? round2(values.reduce((x, y) => x + y, 0) / values.length) : null;
  }

  return {
    rank: breakdowns.filter(x => x.b.total > own).length + 1,
    of: breakdowns.length,
    classAverage: {
      total: avg(b => b.total),
      collected: avg(b => b.collected),
      midterm: avg(b => b.midterm),
      final: avg(b => b.final),
    },
    assignmentAverages,
  };
}
