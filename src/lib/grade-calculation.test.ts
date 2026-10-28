import { describe, expect, it } from 'vitest';
import type { Assignment, AssignmentGroup, GradeConfig, StudentScore } from '@/services/teacher-database.service';
import {
  assignmentIdsInOrder,
  buildColumns,
  collectedCapacity,
  computeBreakdown,
  defaultGradeConfig,
  examMax,
  getFieldValue,
  gradeFor,
  sortAssignments,
} from './grade-calculation';

const date = new Date(2026, 0, 1);

function assignment(id: string, maxScore: number, extra: Partial<Assignment> = {}): Assignment {
  return {
    id, subjectId: 'S1', classroom: '4/1', title: id, description: '', deadline: '',
    maxScore, isVisible: true, createdAt: date, updatedAt: date, ...extra,
  };
}

function group(id: string, rawScore: number, extra: Partial<AssignmentGroup> = {}): AssignmentGroup {
  return { id, subjectId: 'S1', classroom: '4/1', name: id, rawScore, assignmentIds: [], createdAt: date, updatedAt: date, ...extra };
}

function score(assignmentScores: Record<string, number>, extra: Partial<StudentScore> = {}): StudentScore {
  return { studentId: 'st1', subjectId: 'S1', classroom: '4/1', assignmentScores, updatedAt: date, ...extra };
}

function config(extra: Partial<GradeConfig> = {}): GradeConfig {
  return { ...defaultGradeConfig('S1'), ...extra };
}

describe('computeBreakdown', () => {
  it('treats a missing score as pending 0 and a stored 0 as a real score', () => {
    const list = [assignment('a', 10), assignment('b', 10)];
    const result = computeBreakdown(score({ a: 0 }), list, [], config());
    expect(result.collected).toBe(0);
    expect(result.pending).toBe(1);
  });

  it('counts every visible assignment as pending when the student has no score doc', () => {
    const result = computeBreakdown(undefined, [assignment('a', 10), assignment('b', 5)], [], config());
    expect(result.total).toBe(0);
    expect(result.pending).toBe(2);
    expect(result.grade).toBe('0');
  });

  it('ignores hidden assignments in totals and pending', () => {
    const list = [assignment('a', 10), assignment('hidden', 10, { isVisible: false })];
    const result = computeBreakdown(score({ a: 8, hidden: 10 }), list, [], config());
    expect(result.collected).toBe(8);
    expect(result.pending).toBe(0);
  });

  it('ignores scores of assignments that no longer exist', () => {
    const result = computeBreakdown(score({ a: 8, deleted: 10 }), [assignment('a', 10)], [], config());
    expect(result.collected).toBe(8);
  });

  it('scales a group to its rawScore', () => {
    const list = [assignment('a', 10, { groupId: 'g' }), assignment('b', 10, { groupId: 'g' }), assignment('c', 5)];
    const result = computeBreakdown(score({ a: 5, b: 10, c: 4 }), list, [group('g', 30)], config());
    expect(result.groups.g).toBe(22.5);
    expect(result.collected).toBe(26.5);
  });

  it('scales a group only over its visible members', () => {
    const list = [assignment('a', 10, { groupId: 'g' }), assignment('b', 10, { groupId: 'g', isVisible: false })];
    const result = computeBreakdown(score({ a: 5, b: 0 }), list, [group('g', 20)], config());
    expect(result.groups.g).toBe(10);
  });

  it('counts an assignment whose group was deleted as a plain assignment', () => {
    const result = computeBreakdown(score({ a: 7 }), [assignment('a', 10, { groupId: 'gone' })], [], config());
    expect(result.collected).toBe(7);
  });

  it('scales exams from their max to their proportion', () => {
    const result = computeBreakdown(
      score({}, { midtermScore: 25, finalScore: 40 }), [], [],
      config({ midtermMax: 50, finalMax: 40 }),
    );
    expect(result.midtermRaw).toBe(25);
    expect(result.midterm).toBe(10);
    expect(result.final).toBe(20);
    expect(result.total).toBe(30);
  });

  it('uses exam scores as points when no max is set', () => {
    const result = computeBreakdown(score({}, { midtermScore: 15 }), [], [], config());
    expect(result.midterm).toBe(15);
    expect(result.finalRaw).toBeUndefined();
  });

  it('flags collected points over the proportion without scaling them down', () => {
    const result = computeBreakdown(score({ a: 70 }), [assignment('a', 70)], [], config());
    expect(result.collected).toBe(70);
    expect(result.isExceeding).toBe(true);
  });

  it('gives the grade for the rounded total', () => {
    const list = [assignment('a', 60)];
    const result = computeBreakdown(score({ a: 60 }, { midtermScore: 10, finalScore: 10 }), list, [], config());
    expect(result.total).toBe(80);
    expect(result.grade).toBe('4');
  });
});

describe('gradeFor', () => {
  it('uses the default thresholds', () => {
    expect(gradeFor(80, null)).toBe('4');
    expect(gradeFor(79.99, null)).toBe('3.5');
    expect(gradeFor(50, null)).toBe('1');
    expect(gradeFor(49.99, null)).toBe('0');
  });

  it('sorts custom thresholds before matching', () => {
    const custom = config({
      thresholds: [
        { grade: 'ผ่าน', minScore: 50, color: '' },
        { grade: 'ดีเยี่ยม', minScore: 90, color: '' },
        { grade: 'ไม่ผ่าน', minScore: 0, color: '' },
      ],
    });
    expect(gradeFor(95, custom)).toBe('ดีเยี่ยม');
    expect(gradeFor(60, custom)).toBe('ผ่าน');
    expect(gradeFor(10, custom)).toBe('ไม่ผ่าน');
  });
});

describe('score fields', () => {
  it('reads only finite numbers', () => {
    const s = score({ a: 3, b: NaN }, { midtermScore: 0 });
    expect(getFieldValue(s, 'a:a')).toBe(3);
    expect(getFieldValue(s, 'a:b')).toBeUndefined();
    expect(getFieldValue(s, 'midterm')).toBe(0);
    expect(getFieldValue(s, 'final')).toBeUndefined();
    expect(getFieldValue(undefined, 'a:a')).toBeUndefined();
  });

  it('falls back to the proportion when an exam max is missing or 0', () => {
    expect(examMax(config({ midtermMax: 0 }), 'midterm')).toBe(20);
    expect(examMax(config({ finalMax: 100 }), 'final')).toBe(100);
    expect(examMax(null, 'final')).toBe(20);
  });
});

describe('collectedCapacity', () => {
  it('counts each group once at its rawScore and skips hidden assignments', () => {
    const list = [
      assignment('a', 10, { groupId: 'g' }),
      assignment('b', 10, { groupId: 'g' }),
      assignment('c', 5),
      assignment('d', 5, { isVisible: false }),
      assignment('e', 10, { groupId: 'empty', isVisible: false }),
    ];
    expect(collectedCapacity(list, [group('g', 15), group('empty', 50)])).toBe(20);
  });
});

describe('column layout', () => {
  it('sorts by order, then puts assignments without an order last by creation time', () => {
    const list = [
      assignment('late', 1, { createdAt: new Date(2026, 1, 1) }),
      assignment('second', 1, { order: 1 }),
      assignment('early', 1, { createdAt: new Date(2025, 1, 1) }),
      assignment('first', 1, { order: 0 }),
    ];
    expect(sortAssignments(list).map(a => a.id)).toEqual(['first', 'second', 'early', 'late']);
  });

  it('keeps a group together where its first assignment is, scaled column last by default', () => {
    const list = [
      assignment('a', 1, { order: 0 }),
      assignment('g1', 1, { order: 1, groupId: 'g' }),
      assignment('b', 1, { order: 2 }),
      assignment('g2', 1, { order: 3, groupId: 'g' }),
    ];
    const columns = buildColumns(list, [group('g', 10)]);
    expect(columns.map(c => (c.kind === 'assignment' ? c.assignment.id : `scaled:${c.group.id}`)))
      .toEqual(['a', 'g1', 'g2', 'scaled:g', 'b']);
    expect(assignmentIdsInOrder(columns)).toEqual(['a', 'g1', 'g2', 'b']);
  });

  it('puts the scaled column at scaledPosition, clamped to the block', () => {
    const list = [assignment('g1', 1, { order: 0, groupId: 'g' }), assignment('g2', 1, { order: 1, groupId: 'g' })];
    const ids = (position: number) => buildColumns(list, [group('g', 10, { scaledPosition: position })])
      .map(c => (c.kind === 'assignment' ? c.assignment.id : 'scaled'));
    expect(ids(0)).toEqual(['scaled', 'g1', 'g2']);
    expect(ids(1)).toEqual(['g1', 'scaled', 'g2']);
    expect(ids(9)).toEqual(['g1', 'g2', 'scaled']);
  });
});
