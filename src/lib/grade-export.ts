import type ExcelJS from 'exceljs';
import type { StudentData } from '@/services/school-database.service';
import type { Assignment, AssignmentGroup, GradeConfig, StudentScore } from '@/services/teacher-database.service';
import { buildColumns, computeBreakdown, examMax, getFieldValue, round2 } from '@/lib/grade-calculation';

interface SubjectSheetInput {
  subjectName: string;
  classroom: string;
  students: StudentData[];
  assignments: Assignment[];
  groups: AssignmentGroup[];
  scores: StudentScore[];
  config: GradeConfig;
}

const FONT = 'TH SarabunPSK';
const FONT_SIZE = 16;
const BORDER_COLOR = { argb: 'FFCBD5E1' };
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: BORDER_COLOR },
  left: { style: 'thin', color: BORDER_COLOR },
  bottom: { style: 'thin', color: BORDER_COLOR },
  right: { style: 'thin', color: BORDER_COLOR },
};
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

type HeaderCol = {
  /** Top header (merged across a group, or over both rows for single columns) */
  top: string;
  /** Second header row; undefined → `top` spans both rows */
  sub?: string;
  groupId?: string;
  tone: 'base' | 'group' | 'scaled' | 'exam' | 'summary';
  value: (score: StudentScore | undefined, b: ReturnType<typeof computeBreakdown>) => number | string | null;
};

/**
 * Add one subject's sheet laid out like the teacher's grade grid: assignments in the
 * teacher's order, group names merged over their columns with the scaled column inside
 * the group, then the exams and the totals. Blank scores stay blank. Only assignments
 * visible to students are exported (hidden ones don't count toward totals either).
 */
export function addSubjectSheet(workbook: ExcelJS.Workbook, input: SubjectSheetInput): void {
  const { subjectName, classroom, students, groups, config } = input;
  const assignments = input.assignments.filter(a => a.isVisible);
  const scoreById = new Map(input.scores.map(s => [s.studentId, s]));

  const cols: HeaderCol[] = [];
  for (const c of buildColumns(assignments, groups)) {
    if (c.kind === 'assignment') {
      const a = c.assignment;
      const label = `${a.title} (เต็ม ${a.maxScore})`;
      cols.push({
        top: c.group ? c.group.name : label,
        sub: c.group ? label : undefined,
        groupId: c.group?.id,
        tone: c.group ? 'group' : 'base',
        value: s => getFieldValue(s, `a:${a.id}`) ?? null,
      });
    } else {
      cols.push({
        top: c.group.name,
        sub: `ทอนเหลือ ${c.group.rawScore}`,
        groupId: c.group.id,
        tone: 'scaled',
        value: (_s, b) => b.groups[c.group.id] ?? 0,
      });
    }
  }
  for (const exam of ['midterm', 'final'] as const) {
    const max = examMax(config, exam);
    const proportion = config.proportions[exam];
    const label = exam === 'midterm' ? 'กลางภาค' : 'ปลายภาค';
    cols.push({
      top: `${label} (เต็ม ${max}${max !== proportion ? ` → ${proportion}` : ''})`,
      tone: 'exam',
      value: s => getFieldValue(s, exam) ?? null,
    });
  }
  cols.push({ top: `คะแนนเก็บ (${config.proportions.collected})`, tone: 'summary', value: (_s, b) => b.collected });
  cols.push({ top: 'รวม (100)', tone: 'summary', value: (_s, b) => b.total });
  cols.push({ top: 'เกรด', tone: 'summary', value: (_s, b) => b.grade });

  const sheetName = `${subjectName} (${classroom})`.replace(/[:\\/?*[\]]/g, '_').substring(0, 31);
  const ws = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }] });

  ws.addRow(['เลขที่', 'ชื่อ - สกุล', ...cols.map(c => c.top)]);
  ws.addRow(['', '', ...cols.map(c => c.sub ?? '')]);

  // Merges: fixed and single columns span both rows; groups span their columns in row 1
  ws.mergeCells(1, 1, 2, 1);
  ws.mergeCells(1, 2, 2, 2);
  for (let i = 0; i < cols.length; i++) {
    const col = i + 3;
    if (!cols[i].groupId) { ws.mergeCells(1, col, 2, col); continue; }
    let end = i;
    while (end + 1 < cols.length && cols[end + 1].groupId === cols[i].groupId) end++;
    if (end > i) ws.mergeCells(1, col, 1, end + 3);
    i = end;
  }

  const toneFill: Record<HeaderCol['tone'], [string, string]> = {
    base: ['FFF1F5F9', 'FFFFFFFF'],
    group: ['FFF3E8FF', 'FFFFFFFF'],
    scaled: ['FFE9D5FF', 'FFFAF5FF'],
    exam: ['FFE0E7FF', 'FFFFFFFF'],
    summary: ['FFBBF7D0', 'FFF0FDF4'],
  };

  for (const r of [1, 2]) {
    const row = ws.getRow(r);
    row.height = r === 1 ? 30 : 30;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const tone = colNumber <= 2 ? 'base' : cols[colNumber - 3]?.tone ?? 'base';
      cell.font = { name: FONT, size: FONT_SIZE, bold: true, color: { argb: 'FF1F2937' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = BORDER;
      cell.fill = fill(colNumber <= 2 ? 'FFE2E8F0' : toneFill[tone][0]);
    });
  }

  for (const student of students) {
    const score = scoreById.get(student.studentId);
    const b = computeBreakdown(score, assignments, groups, config);
    const values = cols.map(c => {
      const v = c.value(score, b);
      return typeof v === 'number' ? round2(v) : v;
    });
    const row = ws.addRow([student.number, student.name, ...values]);
    row.height = 24;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const col = cols[colNumber - 3];
      const strong = col?.tone === 'scaled' || col?.tone === 'summary';
      cell.font = { name: FONT, size: FONT_SIZE, bold: strong, color: { argb: 'FF1F2937' } };
      cell.alignment = { vertical: 'middle', horizontal: colNumber === 2 ? 'left' : 'center' };
      cell.border = BORDER;
      if (col) cell.fill = fill(toneFill[col.tone][1]);
    });
  }

  ws.getColumn(1).width = 8;
  ws.getColumn(2).width = 30;
  for (let i = 0; i < cols.length; i++) ws.getColumn(i + 3).width = 16;
}
