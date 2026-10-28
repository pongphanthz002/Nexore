import { describe, expect, it } from 'vitest';
import type { Assignment, AttendanceSummary, StudentScore } from '@/services/teacher-database.service';
import {
  attendanceByRoom, buildGradeSummary, dueDay, gradeSummaryFingerprint, pendingPoints, pendingTimeline,
  sessionDay, sessionMixes, topScores, type SubjectStatsInput,
} from './class-stats';
import { defaultGradeConfig } from './grade-calculation';

const date = new Date(2026, 0, 1);
const today = new Date(2026, 9, 28); // Wed 28 Oct 2026

function assignment(id: string, maxScore: number, extra: Partial<Assignment> = {}): Assignment {
  return {
    id, subjectId: 'S1', classroom: '4/1', title: id, description: '', deadline: '',
    maxScore, isVisible: true, createdAt: date, updatedAt: date, ...extra,
  };
}

function score(studentId: string, assignmentScores: Record<string, number>, extra: Partial<StudentScore> = {}): StudentScore {
  return { studentId, subjectId: 'S1', classroom: '4/1', assignmentScores, updatedAt: date, ...extra };
}

const roster = [
  { studentId: 'a', name: 'อนันต์', number: '1', class: '4/1' },
  { studentId: 'b', name: 'บุษบา', number: '2', class: '4/1' },
  { studentId: 'c', name: 'ชาตรี', number: '3', class: '4/2' },
];

describe('buildGradeSummary', () => {
  const assignments = [
    assignment('w1', 10, { order: 0, deadline: '2026-10-01' }),
    assignment('w2', 10, { order: 1 }),
    assignment('hidden', 10, { isVisible: false }),
  ];
  const scores = [score('a', { w1: 10, w2: 8 }, { midtermScore: 20 }), score('b', { w1: 5 })];
  const summary = buildGradeSummary('S1', '4/1', roster, assignments, [], defaultGradeConfig('S1'), scores);

  it('stores each student’s total, grade, pending work and entered cells', () => {
    expect(summary.students.a).toMatchObject({ total: 38, pending: 0, pendingIds: [], entered: 3, name: 'อนันต์' });
    expect(summary.students.b).toMatchObject({ total: 5, pending: 1, pendingIds: ['w2'], entered: 1 });
    expect(summary.students.c).toMatchObject({ total: 0, pendingIds: ['w1', 'w2'], classroom: '4/2', grade: '0' });
    expect(summary.hasScores).toBe(true);
  });

  it('lists visible assignments in order with due days, submissions and averages', () => {
    expect(summary.assignments).toEqual([
      { id: 'w1', title: 'w1', maxScore: 10, due: '2026-10-01', submitted: 2, average: 7.5 },
      { id: 'w2', title: 'w2', maxScore: 10, due: '2026-01-01', submitted: 1, average: 8 },
    ]);
  });

  it('fingerprints ignore the timestamp and student order', () => {
    const shuffled = { ...summary, students: { c: summary.students.c, b: summary.students.b, a: summary.students.a }, updatedAt: date };
    expect(gradeSummaryFingerprint(shuffled)).toBe(gradeSummaryFingerprint(summary));
  });
});

describe('dueDay', () => {
  it('uses the deadline, else the creation day', () => {
    expect(dueDay({ deadline: '2026-11-05T10:00', createdAt: date })).toBe('2026-11-05');
    expect(dueDay({ deadline: '', createdAt: new Date(2026, 5, 9) })).toBe('2026-06-09');
    expect(dueDay({ deadline: 'ไม่กำหนด', createdAt: undefined as unknown as Date })).toBe('');
  });
});

describe('attendance', () => {
  const summary: AttendanceSummary = {
    subjectId: 'S1', version: 1, updatedAt: date,
    sessions: { s1: { date: 'Mon 26/10', hours: 2, classroom: '4/1' }, s2: { date: 'Tue 1/9', hours: 1, classroom: '4/1' } },
    students: { a: { s1: 'มา', s2: 'สาย' }, b: { s1: 'ขาด', s2: 'ลาป่วย' }, c: { s1: '', s2: 'หนี' } },
  };

  it('compacts a summary to student-hours per kind and session', () => {
    expect(sessionMixes(summary)).toEqual([
      { date: 'Mon 26/10', classroom: '4/1', present: 2, late: 0, leave: 0, absent: 2 },
      { date: 'Tue 1/9', classroom: '4/1', present: 0, late: 1, leave: 1, absent: 1 },
    ]);
  });

  it('places year-less dates on or before today', () => {
    expect(sessionDay('Mon 26/10', today)).toEqual(new Date(2026, 9, 26));
    expect(sessionDay('Fri 4/12', today)).toEqual(new Date(2025, 11, 4));
  });

  it('compares rooms over a range and finds each kind’s peak room', () => {
    const inputs: SubjectStatsInput[] = [
      { subjectId: 'S1', subjectName: 'คณิต', classroom: '4/1', grades: null, sessions: sessionMixes(summary) },
      { subjectId: 'S2', subjectName: 'ไทย', classroom: '4/2', grades: null, sessions: [{ date: 'Tue 27/10', classroom: '4/2', present: 9, late: 1, leave: 0, absent: 0 }] },
    ];
    const week = attendanceByRoom(inputs, 'week', today);
    expect(week.rooms.map(r => [r.room, r.hours])).toEqual([['4/1', 4], ['4/2', 10]]);
    expect(week.rooms[0].pct).toEqual({ present: 50, late: 0, leave: 0, absent: 50 });
    expect(week.peaks.find(p => p.kind === 'absent')).toEqual({ kind: 'absent', room: '4/1', value: 50 });
    expect(week.overall.present).toBe(78.6);
    expect(attendanceByRoom(inputs, 'term', today).rooms[0].hours).toBe(7);
  });
});

describe('dashboard', () => {
  const assignments = [
    assignment('w1', 10, { deadline: '2026-10-05' }),
    assignment('w2', 10, { deadline: '2026-10-20' }),
    assignment('w3', 10, { deadline: '2026-11-30' }),
  ];
  const s1 = buildGradeSummary('S1', '4/1', roster, assignments, [], null, [
    score('a', { w1: 10, w2: 10, w3: 10 }, { midtermScore: 20, finalScore: 20 }), score('b', { w1: 4 }),
  ]);
  const s2 = buildGradeSummary('S2', '4/1', roster.slice(0, 2), [assignment('x', 10, { deadline: '2026-09-15' })], [], null, [score('a', { x: 2 })]);
  const inputs: SubjectStatsInput[] = [
    { subjectId: 'S1', subjectName: 'คณิต', classroom: '4/1', grades: s1, sessions: null },
    { subjectId: 'S2', subjectName: 'ไทย', classroom: '4/1', grades: s2, sessions: null },
  ];

  it('ranks the podium by mean total over subjects with scores', () => {
    expect(topScores(inputs).map(s => [s.studentId, s.total])).toEqual([['a', 36], ['b', 2], ['c', 0]]); // a: (70 + 2) / 2
  });

  it('counts pending work due by each point, ranked by today', () => {
    const month = pendingTimeline(inputs, 'month', today);
    expect(month.labels).toEqual(['7 ต.ค.', '14 ต.ค.', '21 ต.ค.', '28 ต.ค.']);
    // b: w2 (20 Oct) + x (15 Sep); c: w1 (5 Oct) + w2 (20 Oct); w3 is not due yet
    expect(month.rows.map(r => [r.studentId, r.counts])).toEqual([['c', [1, 1, 2, 2]], ['b', [1, 1, 2, 2]]]);
    expect(month.max).toBe(2);
  });

  it('uses month ends since May for the term', () => {
    expect(pendingPoints('term', today).map(p => p.label)).toEqual(['พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.']);
    expect(pendingPoints('term', new Date(2027, 1, 10)).map(p => p.label)).toEqual(['ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.']);
  });
});
