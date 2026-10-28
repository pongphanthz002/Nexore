import type { Assignment, AssignmentGroup, GradeConfig, GradeThreshold, StudentScore } from '@/services/teacher-database.service';

/**
 * The one place scores are turned into totals and grades. The teacher grades page,
 * the student subjects page and the Excel export all use these functions so every
 * screen shows the same numbers.
 *
 * Rules:
 * - A blank score (missing key / field) means "not entered yet": it counts as 0 in
 *   totals but is reported as pending. A stored 0 is a real score.
 * - Hidden assignments (isVisible === false) are ignored in every total.
 * - A group scales the sum of its visible assignments to `rawScore`.
 * - Midterm/final are entered out of `midtermMax`/`finalMax` and scaled to their
 *   proportion. Without a max, the max equals the proportion (raw score = points).
 * - Collected points over the collected proportion are flagged, never scaled down.
 */

export const DEFAULT_THRESHOLDS: GradeThreshold[] = [
  { grade: '4', minScore: 80, color: 'text-green-500' },
  { grade: '3.5', minScore: 75, color: 'text-green-400' },
  { grade: '3', minScore: 70, color: 'text-emerald-500' },
  { grade: '2.5', minScore: 65, color: 'text-emerald-400' },
  { grade: '2', minScore: 60, color: 'text-yellow-500' },
  { grade: '1.5', minScore: 55, color: 'text-yellow-400' },
  { grade: '1', minScore: 50, color: 'text-orange-500' },
  { grade: '0', minScore: 0, color: 'text-red-500' },
];

export function defaultGradeConfig(subjectId: string): GradeConfig {
  return {
    subjectId,
    proportions: { collected: 60, midterm: 20, final: 20 },
    thresholds: DEFAULT_THRESHOLDS.map(t => ({ ...t })),
    updatedAt: new Date(),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A score cell: an assignment, the midterm exam or the final exam. */
export type ScoreField = `a:${string}` | 'midterm' | 'final';

export function assignmentField(assignmentId: string): ScoreField {
  return `a:${assignmentId}`;
}

export function isScored(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function getFieldValue(score: StudentScore | undefined, field: ScoreField): number | undefined {
  if (!score) return undefined;
  const value = field === 'midterm' ? score.midtermScore
    : field === 'final' ? score.finalScore
    : score.assignmentScores?.[field.slice(2)];
  return isScored(value) ? value : undefined;
}

export function examMax(config: GradeConfig | null | undefined, exam: 'midterm' | 'final'): number {
  if (!config) return 20;
  const max = exam === 'midterm' ? config.midtermMax : config.finalMax;
  return max && max > 0 ? max : config.proportions[exam];
}

/** Highest score a cell accepts. */
export function fieldMax(field: ScoreField, assignments: Assignment[], config: GradeConfig | null | undefined): number {
  if (field === 'midterm' || field === 'final') return examMax(config, field);
  return assignments.find(a => a.id === field.slice(2))?.maxScore ?? 0;
}

export function gradeFor(total: number, config: GradeConfig | null | undefined): string {
  const thresholds = config?.thresholds?.length ? config.thresholds : DEFAULT_THRESHOLDS;
  const match = [...thresholds].sort((a, b) => b.minScore - a.minScore).find(t => total >= t.minScore);
  return match ? match.grade : '0';
}

export function gradeColor(grade: string, config: GradeConfig | null | undefined): string {
  const thresholds = config?.thresholds?.length ? config.thresholds : DEFAULT_THRESHOLDS;
  return thresholds.find(t => t.grade === grade)?.color || 'text-gray-500';
}

/** Visible assignments with no score entered for this student. */
export function pendingAssignments(score: StudentScore | undefined, assignments: Assignment[]): Assignment[] {
  return assignments.filter(a => a.isVisible && !isScored(score?.assignmentScores?.[a.id]));
}

export interface ScoreBreakdown {
  /** groupId → scaled points (rounded) */
  groups: Record<string, number>;
  collected: number;
  midtermRaw: number | undefined;
  finalRaw: number | undefined;
  /** exam points after scaling to their proportion */
  midterm: number;
  final: number;
  total: number;
  grade: string;
  /** collected points exceed the collected proportion */
  isExceeding: boolean;
  pending: number;
}

export function computeBreakdown(
  score: StudentScore | undefined,
  assignments: Assignment[],
  groups: AssignmentGroup[],
  config: GradeConfig | null | undefined,
): ScoreBreakdown {
  const groupIds = new Set(groups.map(g => g.id));
  const visible = assignments.filter(a => a.isVisible);
  const valueOf = (a: Assignment) => {
    const v = score?.assignmentScores?.[a.id];
    return isScored(v) ? v : 0;
  };

  const groupPoints: Record<string, number> = {};
  let collected = 0;
  for (const group of groups) {
    const members = visible.filter(a => a.groupId === group.id);
    const totalMax = members.reduce((sum, a) => sum + (a.maxScore || 0), 0);
    const raw = members.reduce((sum, a) => sum + valueOf(a), 0);
    const points = totalMax > 0 ? (raw / totalMax) * (group.rawScore || 0) : 0;
    groupPoints[group.id] = round2(points);
    collected += points;
  }
  for (const a of visible) {
    if (!a.groupId || !groupIds.has(a.groupId)) collected += valueOf(a);
  }

  const midtermRaw = getFieldValue(score, 'midterm');
  const finalRaw = getFieldValue(score, 'final');
  const proportions = config?.proportions ?? { collected: 60, midterm: 20, final: 20 };
  const midterm = ((midtermRaw ?? 0) / examMax(config, 'midterm')) * proportions.midterm;
  const final = ((finalRaw ?? 0) / examMax(config, 'final')) * proportions.final;
  const total = round2(collected + midterm + final);

  return {
    groups: groupPoints,
    collected: round2(collected),
    midtermRaw,
    finalRaw,
    midterm: round2(midterm),
    final: round2(final),
    total,
    grade: gradeFor(total, config),
    isExceeding: collected > proportions.collected + 1e-9,
    pending: pendingAssignments(score, assignments).length,
  };
}

/** Full collected points the current assignments and groups can give (visible only). */
export function collectedCapacity(assignments: Assignment[], groups: AssignmentGroup[]): number {
  const groupIds = new Set(groups.map(g => g.id));
  const visible = assignments.filter(a => a.isVisible);
  let capacity = 0;
  for (const group of groups) {
    if (visible.some(a => a.groupId === group.id)) capacity += group.rawScore || 0;
  }
  for (const a of visible) {
    if (!a.groupId || !groupIds.has(a.groupId)) capacity += a.maxScore || 0;
  }
  return round2(capacity);
}

// ---------------------------------------------------------------------------
// Column layout shared by the grid and the Excel export
// ---------------------------------------------------------------------------

export type SheetColumn =
  | { kind: 'assignment'; assignment: Assignment; group?: AssignmentGroup }
  | { kind: 'groupScaled'; group: AssignmentGroup; members: Assignment[] };

function orderKey(a: Assignment): number {
  if (typeof a.order === 'number') return a.order;
  const created = a.createdAt as unknown;
  if (created instanceof Date) return created.getTime();
  const ts = created as { toMillis?: () => number } | undefined;
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : 0;
}

/** Assignments in the teacher's order (`order`, falling back to creation time). */
export function sortAssignments(assignments: Assignment[]): Assignment[] {
  return [...assignments].sort((a, b) => {
    const hasA = typeof a.order === 'number';
    const hasB = typeof b.order === 'number';
    if (hasA !== hasB) return hasA ? -1 : 1;
    return orderKey(a) - orderKey(b) || a.id.localeCompare(b.id);
  });
}

/**
 * Columns in display order. A group's assignments sit together where its first
 * assignment is, with the group's scaled column at `scaledPosition` inside the
 * block (default: after the last assignment).
 */
export function buildColumns(assignments: Assignment[], groups: AssignmentGroup[]): SheetColumn[] {
  const groupById = new Map(groups.map(g => [g.id, g]));
  const sorted = sortAssignments(assignments);
  const columns: SheetColumn[] = [];
  const emitted = new Set<string>();

  for (const a of sorted) {
    const group = a.groupId ? groupById.get(a.groupId) : undefined;
    if (!group) {
      columns.push({ kind: 'assignment', assignment: a });
      continue;
    }
    if (emitted.has(group.id)) continue;
    emitted.add(group.id);
    const members = sorted.filter(m => m.groupId === group.id);
    const pos = Math.max(0, Math.min(group.scaledPosition ?? members.length, members.length));
    members.slice(0, pos).forEach(m => columns.push({ kind: 'assignment', assignment: m, group }));
    columns.push({ kind: 'groupScaled', group, members });
    members.slice(pos).forEach(m => columns.push({ kind: 'assignment', assignment: m, group }));
  }
  return columns;
}

/** Assignment ids in display order (what `order` should be rewritten to). */
export function assignmentIdsInOrder(columns: SheetColumn[]): string[] {
  return columns.flatMap(c => (c.kind === 'assignment' ? [c.assignment.id] : []));
}
