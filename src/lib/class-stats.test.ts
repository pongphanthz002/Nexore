import { describe, expect, it } from 'vitest';
import type { Assignment, AttendanceSummary, StudentScore } from '@/services/teacher-database.service';
import {
  attendanceHoursByStudent, attendanceRate, buildGradeSummary, classPosition, computeTeacherStats,
  gradeSummaryFingerprint, type SubjectStatsInput,
} from './class-stats';
import { defaultGradeConfig } from './grade-calculation';

const date = new Date(2026, 0, 1);

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
  { studentId: 'c', name: 'ชาตรี', number: '3', class: '4/1' },
];

describe('buildGradeSummary', () => {
  const assignments = [assignment('w1', 10, { order: 0 }), assignment('w2', 10, { order: 1 }), assignment('hidden', 10, { isVisible: false })];
  const scores = [score('a', { w1: 10, w2: 8 }, { midtermScore: 20 }), score('b', { w1: 5 })];
  const summary = buildGradeSummary('S1', '4/1', roster, assignments, [], defaultGradeConfig('S1'), scores);

  it('stores each student’s total, grade, pending work and entered cells', () => {
    expect(summary.students.a).toMatchObject({ total: 38, pending: 0, entered: 3, name: 'อนันต์' });
    expect(summary.students.b).toMatchObject({ total: 5, pending: 1, entered: 1 });
    expect(summary.students.c).toMatchObject({ total: 0, pending: 2, entered: 0, grade: '0' });
    expect(summary.hasScores).toBe(true);
  });

  it('lists visible assignments in order with submission counts and averages', () => {
    expect(summary.assignments).toEqual([
      { id: 'w1', title: 'w1', maxScore: 10, submitted: 2, average: 7.5 },
      { id: 'w2', title: 'w2', maxScore: 10, submitted: 1, average: 8 },
    ]);
  });

  it('has no scores before anything is entered', () => {
    expect(buildGradeSummary('S1', '4/1', roster, assignments, [], null, []).hasScores).toBe(false);
  });

  it('fingerprints ignore the timestamp and student order', () => {
    const shuffled = { ...summary, students: { c: summary.students.c, b: summary.students.b, a: summary.students.a }, updatedAt: date };
    expect(gradeSummaryFingerprint(shuffled)).toBe(gradeSummaryFingerprint(summary));
  });
});

describe('attendance hours', () => {
  const summary: AttendanceSummary = {
    subjectId: 'S1', version: 1, updatedAt: date,
    sessions: { s1: { date: 'Mon 2/6', hours: 2, classroom: '4/1' }, s2: { date: 'Tue 3/6', hours: 1, classroom: '4/1' } },
    students: { a: { s1: 'มา', s2: 'สาย' }, b: { s1: 'ขาด', s2: 'ลาป่วย' }, c: { s1: '', s2: 'หนี' } },
  };

  it('groups statuses into present, leave and absent hours', () => {
    const hours = attendanceHoursByStudent(summary);
    expect(hours.a).toEqual({ present: 3, leave: 0, absent: 0 });
    expect(hours.b).toEqual({ present: 0, leave: 1, absent: 2 });
    expect(hours.c).toEqual({ present: 0, leave: 0, absent: 1 });
    expect(attendanceRate(hours.a)).toBe(100);
    expect(attendanceRate({ present: 0, leave: 0, absent: 0 })).toBeNull();
  });
});

describe('computeTeacherStats', () => {
  const assignments = [assignment('w1', 10)];
  const s1 = buildGradeSummary('S1', '4/1', roster, assignments, [], null, [
    score('a', { w1: 10 }, { midtermScore: 20, finalScore: 20 }), score('b', { w1: 4 }),
  ]);
  const s2 = buildGradeSummary('S2', '4/1', roster.slice(0, 2), assignments, [], null, [score('a', { w1: 2 })]);
  const inputs: SubjectStatsInput[] = [
    { subjectId: 'S1', subjectName: 'คณิต', classroom: '4/1', grades: s1, attendance: { a: { present: 10, leave: 0, absent: 0 }, b: { present: 6, leave: 1, absent: 3 }, gone: { present: 0, leave: 0, absent: 9 } } },
    { subjectId: 'S2', subjectName: 'ไทย', classroom: '4/1', grades: s2, attendance: null },
  ];

  it('ranks the podium by mean total and drops students who left a subject', () => {
    const stats = computeTeacherStats(inputs);
    expect(stats.studentCount).toBe(3);
    expect(stats.podium.map(s => s.studentId)).toEqual(['a', 'b', 'c']);
    expect(stats.podium[0].total).toBe(26); // (50 + 2) / 2
    expect(stats.mostAbsent.map(s => s.studentId)).toEqual(['b']);
    expect(stats.attendanceMix).toEqual({ present: 16, leave: 1, absent: 3 });
    expect(stats.belowThreshold).toBe(1);
  });

  it('sums pending work over subjects', () => {
    const stats = computeTeacherStats(inputs);
    expect(stats.mostPending.map(s => [s.studentId, s.pending])).toEqual([['c', 1], ['b', 1]]); // ties by Thai name: ชาตรี before บุษบา
    expect(stats.pendingTotal).toBe(2);
  });

  it('narrows to one subject with grades and assignment submission', () => {
    const stats = computeTeacherStats(inputs, 'S1');
    expect(stats.podium[0].grade).toBe('1'); // 50 points
    expect(stats.grades.find(g => g.label === '0')?.count).toBe(2);
    expect(stats.assignments).toEqual([{ id: 'w1', title: 'w1', submitted: 2, students: 3, rate: 67 }]);
  });
});

describe('classPosition', () => {
  it('ranks a student with ties sharing a rank', () => {
    const assignments = [assignment('w1', 10)];
    const scores = [score('a', { w1: 8 }), score('b', { w1: 8 }), score('c', { w1: 2 })];
    expect(classPosition('c', roster, assignments, [], null, scores).rank).toBe(3);
    const pos = classPosition('b', roster, assignments, [], null, scores);
    expect(pos.rank).toBe(1);
    expect(pos.classAverage.total).toBe(6);
    expect(pos.assignmentAverages.w1).toBe(6);
  });
});
