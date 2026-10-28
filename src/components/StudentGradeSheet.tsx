'use client';

import { useEffect, useMemo, useState } from 'react';
import type { StudentData, SubjectData } from '@/services/school-database.service';
import {
  teacherDatabaseService, type Assignment, type AssignmentGroup, type AttendanceSummary, type GradeConfig, type StudentScore,
} from '@/services/teacher-database.service';
import type { FirebaseConfig } from '@/types/firebase.types';
import { buildColumns, computeBreakdown, examMax, getFieldValue } from '@/lib/grade-calculation';
import { attendanceHoursByStudent, attendanceRate, classPosition } from '@/lib/class-stats';
import { ATTENDANCE_THRESHOLD } from '@/lib/attendance';
import { TtlCache } from '@/lib/firestore-helpers';
import { useTheme } from '@/contexts/ThemeContext';
import Modal, { ModalHeader } from '@/components/Modal';
import { formatScore } from '@/components/ScoreGrid';
import { Bar, CARD, Marker, META, MIX_COLORS, StackedBar, fmt } from '@/components/stats/charts';

/**
 * Per-student popup on the teacher grades page: grade and rank, the student against the class
 * average, attendance and every assignment. Scores come from what the page already loaded;
 * attendance costs one read per subject (the subject's summary doc, cached 2 minutes).
 */

const attendanceCache = new TtlCache<AttendanceSummary | null>(2 * 60 * 1000);

const STUDENT_COLOR = { light: '#2563eb', dark: '#3b82f6' };

interface Props {
  student: StudentData | null;
  subject: SubjectData | null;
  roster: StudentData[];
  assignments: Assignment[];
  groups: AssignmentGroup[];
  config: GradeConfig | null;
  scores: StudentScore[];
  dbConfig: FirebaseConfig | undefined;
  onClose: () => void;
}

export default function StudentGradeSheet({ student, subject, roster, assignments, groups, config, scores, dbConfig, onClose }: Props) {
  const { isDark } = useTheme();
  const [attendance, setAttendance] = useState<AttendanceSummary | null | 'loading'>('loading');
  const subjectId = subject?.subjectId;

  useEffect(() => {
    if (!student || !subjectId) return;
    if (!dbConfig) { setAttendance(null); return; }
    let cancelled = false;
    setAttendance(attendanceCache.get(`${dbConfig.projectId}:${subjectId}`) ?? 'loading');
    attendanceCache
      .getOrLoad(`${dbConfig.projectId}:${subjectId}`, () => teacherDatabaseService.getAttendanceSummary(dbConfig, subjectId))
      .then(summary => { if (!cancelled) setAttendance(summary); })
      .catch(err => { console.error('Error loading attendance summary:', err); if (!cancelled) setAttendance(null); });
    return () => { cancelled = true; };
  }, [student, subjectId, dbConfig]);

  const data = useMemo(() => {
    if (!student) return null;
    const score = scores.find(s => s.studentId === student.studentId);
    const breakdown = computeBreakdown(score, assignments, groups, config);
    const position = classPosition(student.studentId, roster, assignments, groups, config, scores);
    return { score, breakdown, position };
  }, [student, scores, assignments, groups, config, roster]);

  const hours = useMemo(() => {
    if (!student || !attendance || attendance === 'loading') return null;
    return attendanceHoursByStudent(attendance)[student.studentId] ?? null;
  }, [attendance, student]);

  const studentColor = isDark ? STUDENT_COLOR.dark : STUDENT_COLOR.light;
  const proportions = config?.proportions ?? { collected: 60, midterm: 20, final: 20 };

  return (
    <Modal open={!!student} onClose={onClose} size="2xl" sheet labelledBy="student-sheet-title" className="p-5 sm:p-6">
      {student && data && (
        <div className="space-y-4">
          <ModalHeader
            id="student-sheet-title"
            title={student.name}
            subtitle={`เลขที่ ${student.number || '–'} · ห้อง ${student.class}${subject ? ` · ${subject.subjectName}` : ''}`}
            onClose={onClose}
          />

          {/* Grade, total, rank */}
          <div className={`${CARD} grid grid-cols-3 divide-x divide-gray-200 dark:divide-gray-700`}>
            <div className="p-4">
              <p className={`text-sm ${META}`}>เกรด</p>
              <p className="text-5xl font-semibold leading-tight">{data.breakdown.grade}</p>
            </div>
            <div className="p-4">
              <p className={`text-sm ${META}`}>คะแนนรวม</p>
              <p className="text-3xl font-semibold leading-tight">{fmt(data.breakdown.total)}<span className={`ml-1 text-base font-normal ${META}`}>/ 100</span></p>
              <p className={`text-[13px] ${META}`}>เฉลี่ยห้อง {fmt(data.position.classAverage.total)}</p>
            </div>
            <div className="p-4">
              <p className={`text-sm ${META}`}>อันดับในห้อง</p>
              <p className="text-3xl font-semibold leading-tight">{data.position.rank}<span className={`ml-1 text-base font-normal ${META}`}>/ {data.position.of}</span></p>
              <p className={`text-[13px] ${data.breakdown.pending > 0 ? 'font-medium text-red-600 dark:text-red-400' : META}`}>
                {data.breakdown.pending > 0 ? `ค้าง ${data.breakdown.pending} งาน` : 'ส่งงานครบ'}
              </p>
            </div>
          </div>

          {/* Student vs class average */}
          <section className={`${CARD} p-5`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[17px] font-semibold">เทียบกับค่าเฉลี่ยห้อง</h3>
              <div className={`flex items-center gap-4 text-[13px] ${META}`}>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: studentColor }} />นักเรียน</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-[2px] rounded-full bg-gray-900 dark:bg-white" />ค่าเฉลี่ยห้อง</span>
              </div>
            </div>
            <div className="space-y-4">
              {[
                { label: 'คะแนนเก็บ', value: data.breakdown.collected, avg: data.position.classAverage.collected, max: proportions.collected },
                { label: 'กลางภาค', value: data.breakdown.midterm, avg: data.position.classAverage.midterm, max: proportions.midterm, missing: data.breakdown.midtermRaw === undefined },
                { label: 'ปลายภาค', value: data.breakdown.final, avg: data.position.classAverage.final, max: proportions.final, missing: data.breakdown.finalRaw === undefined },
              ].map((row, i) => (
                <div key={row.label}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[15px]">
                    <span className="font-medium">{row.label}</span>
                    <span className="tabular-nums">
                      {row.missing ? <span className={META}>ยังไม่กรอก</span> : <span className="font-semibold">{fmt(row.value)}</span>}
                      <span className={META}> / {fmt(row.max)} · เฉลี่ย {fmt(row.avg)}</span>
                    </span>
                  </div>
                  <Bar ratio={row.max ? row.value / row.max : 0} color={studentColor} className="h-2.5" delay={i * 0.06}>
                    <Marker ratio={row.max ? row.avg / row.max : 0} title={`ค่าเฉลี่ยห้อง ${fmt(row.avg)}`} />
                  </Bar>
                </div>
              ))}
            </div>
          </section>

          {/* Attendance */}
          <section className={`${CARD} p-5`}>
            <h3 className="mb-3 text-[17px] font-semibold">เวลาเรียน</h3>
            {attendance === 'loading' ? (
              <div className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-700" aria-label="กำลังโหลด" />
            ) : !hours || attendanceRate(hours) === null ? (
              <p className={`text-sm ${META}`}>ยังไม่มีการเช็คชื่อในวิชานี้</p>
            ) : (
              <AttendanceBlock hours={hours} isDark={isDark} />
            )}
          </section>

          {/* Assignments */}
          <section className={`${CARD} p-5`}>
            <h3 className="mb-1 text-[17px] font-semibold">รายละเอียดชิ้นงาน</h3>
            <p className={`mb-3 text-[13px] ${META}`}>แถบคือคะแนนที่ได้ ขีดคือค่าเฉลี่ยของคนที่ส่งแล้ว</p>
            <AssignmentRows
              score={data.score}
              assignments={assignments}
              groups={groups}
              groupPoints={data.breakdown.groups}
              averages={data.position.assignmentAverages}
              color={studentColor}
            />
            <ExamRows config={config} score={data.score} />
          </section>

          <p className={`pb-1 text-center text-xs ${META}`}>
            ข้อมูล ณ วันที่ {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      )}
    </Modal>
  );
}

function AttendanceBlock({ hours, isDark }: { hours: { present: number; leave: number; absent: number }; isDark: boolean }) {
  const rate = attendanceRate(hours) ?? 0;
  const low = rate < ATTENDANCE_THRESHOLD;
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <p className="text-3xl font-semibold">
            <span className={low ? 'text-red-600 dark:text-red-400' : ''}>{fmt(rate)}%</span>
          </p>
          <p className={`text-[13px] ${low ? 'font-medium text-red-600 dark:text-red-400' : META}`}>
            {low ? `ต่ำกว่าเกณฑ์ ${ATTENDANCE_THRESHOLD}%` : `ผ่านเกณฑ์ ${ATTENDANCE_THRESHOLD}%`}
          </p>
        </div>
        <Bar ratio={rate / 100} color={isDark ? MIX_COLORS.present.dark : MIX_COLORS.present.light} className="h-2.5">
          <Marker ratio={ATTENDANCE_THRESHOLD / 100} title={`เกณฑ์ ${ATTENDANCE_THRESHOLD}%`} />
        </Bar>
      </div>
      <StackedBar
        isDark={isDark}
        segments={(['present', 'leave', 'absent'] as const).map(key => ({ key, label: MIX_COLORS[key].label, value: hours[key], color: MIX_COLORS[key] }))}
      />
    </div>
  );
}

function AssignmentRows({ score, assignments, groups, groupPoints, averages, color }: {
  score: StudentScore | undefined;
  assignments: Assignment[];
  groups: AssignmentGroup[];
  groupPoints: Record<string, number>;
  averages: Record<string, number | null>;
  color: string;
}) {
  const columns = buildColumns(assignments.filter(a => a.isVisible), groups);
  if (columns.length === 0) return <p className={`py-2 text-sm ${META}`}>ยังไม่มีชิ้นงาน</p>;

  const row = (a: Assignment, indent: boolean) => {
    const value = getFieldValue(score, `a:${a.id}`);
    const avg = averages[a.id];
    return (
      <li key={a.id} className={`py-2.5 ${indent ? 'pl-4' : ''}`}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-[15px]">{a.title}</p>
          <p className="flex-none tabular-nums">
            {value === undefined
              ? <span className="font-medium text-red-600 dark:text-red-400">ยังไม่ส่ง</span>
              : <span className="font-semibold">{formatScore(value)}</span>}
            <span className={`text-[13px] ${META}`}> / {formatScore(a.maxScore)}</span>
          </p>
        </div>
        <Bar ratio={a.maxScore ? (value ?? 0) / a.maxScore : 0} color={color} className="mt-1.5 h-1.5">
          {avg !== null && avg !== undefined && a.maxScore > 0 && <Marker ratio={avg / a.maxScore} title={`ค่าเฉลี่ย ${fmt(avg)}`} />}
        </Bar>
      </li>
    );
  };

  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
      {columns.map(col => {
        if (col.kind === 'assignment') return col.group ? null : row(col.assignment, false);
        return (
          <li key={col.group.id} className="py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-medium">{col.group.name}</p>
              <p className="tabular-nums">
                <span className="font-semibold">{fmt(groupPoints[col.group.id] ?? 0, 2)}</span>
                <span className={`text-[13px] ${META}`}> / {formatScore(col.group.rawScore)} (ทอนแล้ว)</span>
              </p>
            </div>
            <ul className="mt-1 border-l-2 border-gray-100 dark:border-gray-700">
              {col.members.map(m => row(m, true))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

function ExamRows({ config, score }: { config: GradeConfig | null; score: StudentScore | undefined }) {
  const exams = [
    { field: 'midterm' as const, label: 'สอบกลางภาค' },
    { field: 'final' as const, label: 'สอบปลายภาค' },
  ];
  return (
    <ul className="mt-1 divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-700/70 dark:border-gray-700/70">
      {exams.map(e => {
        const value = getFieldValue(score, e.field);
        return (
          <li key={e.field} className="flex items-baseline justify-between gap-3 py-2.5">
            <p className="text-[15px]">{e.label}</p>
            <p className="tabular-nums">
              {value === undefined ? <span className={META}>ยังไม่กรอก</span> : <span className="font-semibold">{formatScore(value)}</span>}
              <span className={`text-[13px] ${META}`}> / {formatScore(examMax(config, e.field))}</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
