import type { Assignment, AssignmentGroup, GradeConfig, StudentScore } from '@/services/teacher-database.service';
import type { StudentGradeDetail, StudentGradeInfo, StudentGradeRow } from '@/services/student-database.service';
import { buildColumns, computeBreakdown, DEFAULT_THRESHOLDS, isScored } from './grade-calculation';

/**
 * What the student subject view shows for one student in one subject. Used by the student's
 * own page and by the teacher's per-student popup, so both show the same thing.
 */
export function buildStudentGradeInfo(
  score: StudentScore | undefined,
  assignments: Assignment[],
  groups: AssignmentGroup[],
  config: GradeConfig | null | undefined,
  subject: { subjectId: string; subjectName: string; classroom: string },
): StudentGradeInfo {
  const visible = assignments.filter(a => a.isVisible);
  const breakdown = computeBreakdown(score, visible, groups, config);
  const columns = buildColumns(visible, groups);
  const ordered = columns.flatMap(c => (c.kind === 'assignment' ? [c.assignment] : []));
  const details: StudentGradeDetail[] = ordered.map(a => {
    const value = score?.assignmentScores?.[a.id];
    return {
      label: a.title,
      score: isScored(value) ? value : null,
      max: a.maxScore || 0,
      description: a.description || '',
      deadline: a.deadline || '',
    };
  });
  const detailOf = new Map(ordered.map((a, i) => [a.id, details[i]]));
  const rows: StudentGradeRow[] = columns.flatMap((c): StudentGradeRow[] => {
    if (c.kind === 'groupScaled') {
      return [{
        kind: 'group', id: c.group.id, name: c.group.name, points: breakdown.groups[c.group.id] ?? 0,
        max: c.group.rawScore || 0, items: c.members.map(m => detailOf.get(m.id)!).filter(Boolean),
      }];
    }
    return c.group ? [] : [{ kind: 'assignment', item: detailOf.get(c.assignment.id)! }];
  });

  return {
    subjectId: subject.subjectId,
    subjectName: subject.subjectName,
    classroom: subject.classroom,
    collectedScore: breakdown.collected,
    midtermScore: breakdown.midterm,
    finalScore: breakdown.final,
    totalScore: breakdown.total,
    grade: breakdown.grade,
    unsent: breakdown.pending,
    maxima: config?.proportions ?? { collected: 60, midterm: 20, final: 20 },
    midtermEntered: breakdown.midtermRaw !== undefined,
    finalEntered: breakdown.finalRaw !== undefined,
    scale: (config?.thresholds?.length ? config.thresholds : DEFAULT_THRESHOLDS)
      .map(t => ({ grade: t.grade, minScore: t.minScore }))
      .sort((a, b) => a.minScore - b.minScore),
    details,
    rows,
  };
}
