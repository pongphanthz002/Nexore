import { describe, expect, it } from 'vitest';
import type { SubjectData } from '@/services/school-database.service';
import {
  attendanceDateKey,
  attendanceDue,
  attendanceHref,
  buildHueMap,
  checkedKey,
  dateOfWeekday,
  entriesForDay,
  formatMinutes,
  parseTimeRange,
  rangeTicks,
  visibleDays,
  weekRange,
  type TimetableEntry,
  type TimetableTeacher,
} from './timetable';

const date = new Date(2026, 0, 1);
const MONDAY = 1;

function subject(subjectId: string, extra: Partial<SubjectData> = {}): SubjectData {
  return {
    subjectId, teacherId: 'T1', subjectName: 'คณิตศาสตร์', classroom: '4/1', day: '', time: '',
    createdAt: date, updatedAt: date, ...extra,
  };
}

const teachers = new Map<string, TimetableTeacher>([['T1', { teacherId: 'T1', name: 'ครูเอ', defaultRoom: '321' }]]);
const slot = (day: string, time: string, duration = '1') => ({ day, time, duration });

describe('parseTimeRange', () => {
  it('accepts colons, dots and spaces', () => {
    expect(parseTimeRange('08:30-09:20')).toEqual({ start: 510, end: 560 });
    expect(parseTimeRange('8.30 - 9.20')).toEqual({ start: 510, end: 560 });
  });

  it('rejects empty, malformed and backwards ranges', () => {
    expect(parseTimeRange(undefined)).toBeNull();
    expect(parseTimeRange('08:30')).toBeNull();
    expect(parseTimeRange('10:00-09:00')).toBeNull();
    expect(parseTimeRange('09:00-09:00')).toBeNull();
  });

  it('formats minutes back to HH:MM', () => {
    expect(formatMinutes(510)).toBe('08:30');
    expect(formatMinutes(0)).toBe('00:00');
  });
});

describe('entriesForDay', () => {
  it('merges rooms a teacher teaches at the same time into one entry', () => {
    const subjects = [
      subject('S1', { classroom: '4/1', schedules: [slot('จันทร์', '08:30-09:20')] }),
      subject('S2', { classroom: '4/2', schedules: [slot('จันทร์', '08:30-09:20')] }),
      subject('S3', { classroom: '4/3', schedules: [slot('จันทร์', '09:20-10:10')] }),
    ];
    const entries = entriesForDay(subjects, MONDAY, 'teacher', teachers, buildHueMap(subjects));
    expect(entries).toHaveLength(2);
    expect(entries[0].classrooms).toEqual(['4/1', '4/2']);
    expect(entries[0].subjects.map(s => s.subjectId)).toEqual(['S1', 'S2']);
  });

  it('does not merge for students', () => {
    const subjects = [
      subject('S1', { schedules: [slot('จันทร์', '08:30-09:20')] }),
      subject('S2', { schedules: [slot('จันทร์', '08:30-09:20')] }),
    ];
    expect(entriesForDay(subjects, MONDAY, 'student', teachers, new Map())).toHaveLength(2);
  });

  it('reads legacy day/time, sorts by start and skips other days and bad times', () => {
    const subjects = [
      subject('late', { day: 'จันทร์', time: '13:00-14:00', duration: '2' }),
      subject('early', { schedules: [slot('จันทร์', '08:00-09:00'), slot('อังคาร', '10:00-11:00')] }),
      subject('broken', { schedules: [slot('จันทร์', 'ทั้งวัน')] }),
    ];
    const entries = entriesForDay(subjects, MONDAY, 'student', teachers, new Map());
    expect(entries.map(e => e.subjects[0].subjectId)).toEqual(['early', 'late']);
    expect(entries[1].hours).toBe(2);
  });

  it("falls back to the teacher's default room", () => {
    const subjects = [
      subject('S1', { schedules: [slot('จันทร์', '08:30-09:20')] }),
      subject('S2', { room: 'ห้องแล็บ', schedules: [slot('จันทร์', '10:00-11:00')] }),
    ];
    const entries = entriesForDay(subjects, MONDAY, 'student', teachers, new Map());
    expect(entries.map(e => e.room)).toEqual(['321', 'ห้องแล็บ']);
    expect(entries[0].teacherName).toBe('ครูเอ');
  });

  it('gives each subject name its own hue, in order', () => {
    const hues = buildHueMap([
      subject('a', { subjectName: 'คณิต' }), subject('b', { subjectName: 'ไทย' }), subject('c', { subjectName: 'คณิต' }),
    ]);
    expect(hues.get('คณิต')).toBe('blue');
    expect(hues.get('ไทย')).toBe('green');
  });
});

function entry(start: number, end: number, subjects: SubjectData[] = [subject('S1')]): TimetableEntry {
  return {
    key: `${start}`, day: MONDAY, subjectName: 'คณิตศาสตร์', subjectCode: '', subjects,
    classrooms: subjects.map(s => s.classroom), room: '', teacherName: '', start, end, hours: 1, hue: 'blue',
  };
}

describe('week layout', () => {
  it('uses one half-hour-rounded range for the whole week', () => {
    expect(weekRange([[entry(500, 560)], [], [entry(800, 905)]])).toEqual({ from: 480, to: 930 });
    expect(weekRange([[], []])).toEqual({ from: 480, to: 960 });
  });

  it('ticks the range start and every full hour', () => {
    expect(rangeTicks(510, 720)).toEqual([510, 540, 600, 660, 720]);
    expect(rangeTicks(480, 600)).toEqual([480, 540, 600]);
  });

  it('shows weekdays, and weekend days only with periods or when today', () => {
    const week = new Map<number, TimetableEntry[]>([[6, [entry(500, 560)]], [0, []]]);
    expect(visibleDays(week, MONDAY)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(visibleDays(new Map(), 0)).toEqual([1, 2, 3, 4, 5, 0]);
  });

  it('finds dates of the current Monday-first week', () => {
    const wednesday = new Date(2026, 9, 28);
    expect(dateOfWeekday(1, wednesday).getDate()).toBe(26);
    expect(dateOfWeekday(0, wednesday).getDate()).toBe(1);
    expect(attendanceDateKey(wednesday)).toBe('Wed 28/10');
  });
});

describe('attendance bar', () => {
  const rooms = [subject('S1', { classroom: '4/1' }), subject('S2', { classroom: '4/2' })];

  it('is due during the period until every room is checked', () => {
    const today = [entry(510, 560, rooms)];
    expect(attendanceDue(today, 509, new Set())).toBeNull();
    expect(attendanceDue(today, 510, new Set())).toBe(today[0]);
    expect(attendanceDue(today, 530, new Set([checkedKey('S1', '4/1')]))).toBe(today[0]);
    expect(attendanceDue(today, 530, new Set([checkedKey('S1', '4/1'), checkedKey('S2', '4/2')]))).toBeNull();
    expect(attendanceDue(today, 560, new Set())).toBeNull();
  });

  it('links to the attendance page with every room of the period', () => {
    expect(attendanceHref(entry(510, 560, rooms)))
      .toBe('/teacher/dashboard/schedules?mode=attendance&subjectIds=S1%2CS2&hours=1');
  });
});
