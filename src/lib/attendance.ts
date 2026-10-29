import type { AttendanceRecord } from '@/services/teacher-database.service';

/**
 * A student's attendance in one subject, counted in hours (a 2-hour session counts twice).
 * Present = มา + สาย + กิจกรรม, the same rule as the teacher's attendance page. Sessions
 * with no status yet are left out of every count.
 */

export type AttendanceStatus = Exclude<AttendanceRecord['status'], ''>;

export const STATUS_ORDER: AttendanceStatus[] = ['มา', 'สาย', 'กิจกรรม', 'ลาป่วย', 'ลากิจ', 'ขาด', 'หนี'];
const PRESENT: AttendanceStatus[] = ['มา', 'สาย', 'กิจกรรม'];
const MISSED: AttendanceStatus[] = ['ขาด', 'หนี', 'ลาป่วย', 'ลากิจ'];

/** Minimum attendance for the right to sit the final exam. */
export const ATTENDANCE_THRESHOLD = 80;

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface AttendanceSession {
  /** "Wed 28/10", as attendance documents key their date */
  date: string;
  hours: number;
  status: string;
}

export interface AttendanceStats {
  totalHours: number;
  presentHours: number;
  /** 0–100 with one decimal; null before any session is recorded */
  percentage: number | null;
  hours: Record<AttendanceStatus, number>;
  /** Hours missed (ขาด, หนี, ลาป่วย, ลากิจ) per weekday */
  missedByDay: Record<Weekday, number>;
  /** Newest first */
  history: { date: string; hours: number; status: AttendanceStatus }[];
}

const isStatus = (s: string): s is AttendanceStatus => (STATUS_ORDER as string[]).includes(s);

/**
 * Sort key for "Wed 28/10". Dates carry no year, so months from May (the start of the Thai
 * school year) sort before January–April.
 */
export function sessionDateKey(date: string): number {
  const m = date.match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return 0;
  const day = +m[1];
  const month = +m[2];
  return (month >= 5 ? month : month + 12) * 100 + day;
}

export function summarizeAttendance(sessions: AttendanceSession[]): AttendanceStats {
  const hours = Object.fromEntries(STATUS_ORDER.map(s => [s, 0])) as Record<AttendanceStatus, number>;
  const missedByDay = Object.fromEntries(WEEKDAYS.map(d => [d, 0])) as Record<Weekday, number>;
  const history: AttendanceStats['history'] = [];

  for (const session of sessions) {
    if (!isStatus(session.status)) continue;
    const h = Number(session.hours) || 1;
    hours[session.status] += h;
    history.push({ date: session.date, hours: h, status: session.status });
    const day = session.date.split(' ')[0] as Weekday;
    if (MISSED.includes(session.status) && day in missedByDay) missedByDay[day] += h;
  }

  const totalHours = STATUS_ORDER.reduce((sum, s) => sum + hours[s], 0);
  const presentHours = PRESENT.reduce((sum, s) => sum + hours[s], 0);
  history.sort((a, b) => sessionDateKey(b.date) - sessionDateKey(a.date));

  return {
    totalHours,
    presentHours,
    percentage: totalHours > 0 ? Math.round((presentHours / totalHours) * 1000) / 10 : null,
    hours,
    missedByDay,
    history,
  };
}

/** One student's hours per status in a subject, as the teacher's history table shows them. */
export interface StudentAttendanceTotals {
  present: number;
  absent: number;
  late: number;
  sickLeave: number;
  personalLeave: number;
  activity: number;
  skipped: number;
  total: number;
  /** (มา + สาย + กิจกรรม) / total, rounded; 0 before any session */
  percentage: number;
}

const TOTAL_FIELD: Record<AttendanceStatus, keyof StudentAttendanceTotals> = {
  'มา': 'present', 'ขาด': 'absent', 'สาย': 'late', 'ลาป่วย': 'sickLeave', 'ลากิจ': 'personalLeave', 'กิจกรรม': 'activity', 'หนี': 'skipped',
};

/** Totals from a subject's attendance summary (session hours + each student's statuses). Blank statuses are left out. */
export function studentAttendanceTotals(
  summary: { sessions: Record<string, { hours: number }>; students: Record<string, Record<string, string>> },
  studentId: string,
): StudentAttendanceTotals {
  const totals: StudentAttendanceTotals = { present: 0, absent: 0, late: 0, sickLeave: 0, personalLeave: 0, activity: 0, skipped: 0, total: 0, percentage: 0 };
  for (const [sessionId, status] of Object.entries(summary.students?.[studentId] || {})) {
    const session = summary.sessions?.[sessionId];
    if (!session || !status) continue;
    const h = Number(session.hours) || 1;
    totals.total += h;
    if (isStatus(status)) totals[TOTAL_FIELD[status]] += h;
  }
  const attended = totals.present + totals.late + totals.activity;
  totals.percentage = totals.total > 0 ? Math.round((attended / totals.total) * 100) : 0;
  return totals;
}
