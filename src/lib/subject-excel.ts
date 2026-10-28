import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { ScheduleSlot, SubjectData } from '@/services/school-database.service';

/**
 * The admin subject sheet. The same columns are downloaded and uploaded, so an admin can
 * download, edit and upload again. Older files ("วัน" / "เวลา" / "จำนวนชั่วโมง", no new
 * columns) still upload: a column missing from the file leaves that field untouched.
 */
export const SUBJECT_COLUMNS = {
  teacherId: 'เลขประจำตัวครู',
  subjectId: 'รหัสอ้างอิงระบบ',
  subjectCode: 'รหัสวิชา',
  subjectName: 'วิชา',
  subjectType: 'ประเภทวิชา',
  classroom: 'ห้อง',
  room: 'ห้องที่สอน',
  students: 'นักเรียน',
} as const;
const SLOT_COLUMNS = [1, 2, 3].map(n => ({ day: `วัน${n}`, time: `เวลา${n}`, hours: `ชั่วโมง${n}` }));
const LEGACY_SLOT = { day: 'วัน', time: 'เวลา', hours: 'จำนวนชั่วโมง' };
const DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];

const HEADERS = [
  SUBJECT_COLUMNS.teacherId, SUBJECT_COLUMNS.subjectId, SUBJECT_COLUMNS.subjectCode, SUBJECT_COLUMNS.subjectName,
  SUBJECT_COLUMNS.subjectType, SUBJECT_COLUMNS.classroom, SUBJECT_COLUMNS.room,
  ...SLOT_COLUMNS.flatMap(s => [s.day, s.time, s.hours]),
  SUBJECT_COLUMNS.students,
];
const WIDTHS = [16, 26, 12, 28, 12, 16, 14, 11, 14, 9, 11, 14, 9, 11, 14, 9, 40];

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

const slotsOf = (s: SubjectData): ScheduleSlot[] =>
  s.schedules && s.schedules.length > 0 ? s.schedules : s.day ? [{ day: s.day, time: s.time, duration: s.duration }] : [];

/** Download every subject (or an empty template) in the upload layout. */
export async function downloadSubjectSheet(subjects: SubjectData[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('วิชาเรียน', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = HEADERS.map((header, i) => ({ header, width: WIDTHS[i] }));

  const sorted = [...subjects].sort((a, b) =>
    a.teacherId.localeCompare(b.teacherId) || a.subjectName.localeCompare(b.subjectName, 'th') || a.classroom.localeCompare(b.classroom, 'th'));
  for (const s of sorted) {
    const slots = slotsOf(s);
    ws.addRow([
      s.teacherId, s.subjectId, s.subjectCode || '', s.subjectName,
      s.subjectType === 'elective' ? 'เพิ่มเติม' : 'พื้นฐาน', s.classroom, s.room || '',
      ...SLOT_COLUMNS.flatMap((_, i) => slots[i] ? [slots[i].day, slots[i].time, Number(slots[i].duration || 1)] : ['', '', '']),
      s.subjectType === 'elective' ? (s.studentIds || []).join(', ') : '',
    ]);
  }

  const lastRow = Math.max(ws.rowCount, 200);
  ws.getRow(1).height = 30;
  for (let r = 1; r <= ws.rowCount; r++) {
    ws.getRow(r).eachCell({ includeEmpty: true }, (cell, col) => {
      const header = r === 1;
      const locked = col === 2;   // รหัสอ้างอิงระบบ: matches the row to its subject, never edit
      cell.font = { name: FONT, size: FONT_SIZE, bold: header, color: { argb: locked && !header ? 'FF94A3B8' : 'FF1F2937' } };
      cell.alignment = { vertical: 'middle', horizontal: col === 4 || col === 17 ? 'left' : 'center', wrapText: header };
      cell.border = BORDER;
      if (header) cell.fill = fill(locked ? 'FFE2E8F0' : col >= 8 && col <= 16 ? 'FFE0F2FE' : 'FFF1F5F9');
      else if (locked) cell.fill = fill('FFF8FAFC');
    });
  }
  ws.getCell('B1').note = 'ห้ามแก้ไข ใช้จับคู่แถวกับวิชาในระบบ เว้นว่างสำหรับวิชาใหม่';
  ws.getCell('G1').note = 'เว้นว่างเพื่อใช้ห้องประจำของครู';
  ws.getCell('Q1').note = 'เฉพาะวิชาเพิ่มเติม: เลขประจำตัวนักเรียน คั่นด้วยจุลภาค';
  // Drop-downs for the fixed choices
  const list = (values: string[]): ExcelJS.DataValidation => ({ type: 'list', allowBlank: true, formulae: [`"${values.join(',')}"`] });
  for (let r = 2; r <= lastRow; r++) {
    ws.getCell(r, 5).dataValidation = list(['พื้นฐาน', 'เพิ่มเติม']);
    for (const col of [8, 11, 14]) ws.getCell(r, col).dataValidation = list(DAYS);
    for (const col of [10, 13, 16]) ws.getCell(r, col).dataValidation = list(['1', '2', '3']);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, subjects.length ? 'รายชื่อวิชาเรียน.xlsx' : 'รายชื่อวิชาเรียน_template.xlsx');
}

/** One uploaded row; a field is undefined when its column is missing from the file. */
export interface ParsedSubjectRow {
  index: number;
  teacherId: string;
  subjectId?: string;
  subjectCode?: string;
  subjectName: string;
  subjectType?: 'basic' | 'elective';
  classroom: string;
  room?: string;
  /** Filled slots in file order; undefined when the file has no time columns. */
  schedules?: ScheduleSlot[];
  /** Only the old one-slot layout: update the first slot and keep the rest. */
  legacySlot: boolean;
  studentIds?: string[];
}

/** Read the first sheet of an uploaded subject file. Cells are coerced to strings (IDs may parse as numbers). */
export function parseSubjectRows(headers: string[], rows: Record<string, unknown>[]): ParsedSubjectRow[] {
  const has = (col: string) => headers.includes(col);
  const str = (row: Record<string, unknown>, col: string) => String(row[col] ?? '').trim();
  const newSlots = has(SLOT_COLUMNS[0].day);
  const legacySlot = !newSlots && has(LEGACY_SLOT.day);

  return rows.map((row, index) => {
    const typeRaw = str(row, SUBJECT_COLUMNS.subjectType);
    const slotCols = newSlots ? SLOT_COLUMNS : legacySlot ? [LEGACY_SLOT] : [];
    const schedules = slotCols
      .map(c => ({ day: str(row, c.day), time: str(row, c.time), duration: str(row, c.hours) || '1' }))
      .filter(s => s.day && s.time);
    return {
      index,
      teacherId: str(row, SUBJECT_COLUMNS.teacherId),
      subjectId: has(SUBJECT_COLUMNS.subjectId) ? str(row, SUBJECT_COLUMNS.subjectId) || undefined : undefined,
      subjectCode: has(SUBJECT_COLUMNS.subjectCode) ? str(row, SUBJECT_COLUMNS.subjectCode) : undefined,
      subjectName: str(row, SUBJECT_COLUMNS.subjectName),
      // Blank type keeps the existing one, so an old template can't turn electives into basic subjects
      subjectType: typeRaw === 'เพิ่มเติม' ? 'elective' : typeRaw === 'พื้นฐาน' ? 'basic' : undefined,
      classroom: str(row, SUBJECT_COLUMNS.classroom),
      room: has(SUBJECT_COLUMNS.room) ? str(row, SUBJECT_COLUMNS.room) : undefined,
      schedules: slotCols.length ? schedules : undefined,
      legacySlot,
      studentIds: has(SUBJECT_COLUMNS.students)
        ? str(row, SUBJECT_COLUMNS.students).split(/[,\s]+/).map(id => id.trim()).filter(Boolean)
        : undefined,
    };
  });
}
