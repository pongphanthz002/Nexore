'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { StudentData, SubjectData } from '@/services/school-database.service';
import type { StudentAttendanceInfo, StudentGradeDetail, StudentSubjectInfo } from '@/services/student-database.service';
import {
  teacherDatabaseService, type Assignment, type AssignmentGroup, type AttendanceSummary, type GradeConfig, type StudentScore,
} from '@/services/teacher-database.service';
import type { FirebaseConfig } from '@/types/firebase.types';
import { buildStudentGradeInfo } from '@/lib/student-grade-info';
import { summarizeAttendance } from '@/lib/attendance';
import { TtlCache } from '@/lib/firestore-helpers';
import type { SubjectHue } from '@/lib/timetable';
import { useTheme } from '@/contexts/ThemeContext';
import Modal from '@/components/Modal';
import { AssignmentSheet, AttendanceView, EASE, GradesView, SubjectHeader } from '@/components/StudentSubjectViews';

/**
 * Per-student popup on the teacher grades page. It shows exactly what the student sees on their
 * own subject page (same views, same numbers): scores come from what the grades page already
 * loaded, attendance from the subject's summary doc (1 read, cached 2 minutes).
 */

const attendanceCache = new TtlCache<AttendanceSummary | null>(2 * 60 * 1000);

interface Props {
  student: StudentData | null;
  subject: SubjectData | null;
  teacher: { teacherId: string; name: string; defaultRoom?: string } | null;
  hue: SubjectHue;
  assignments: Assignment[];
  groups: AssignmentGroup[];
  config: GradeConfig | null;
  scores: StudentScore[];
  dbConfig: FirebaseConfig | undefined;
  onClose: () => void;
}

export default function StudentSubjectSheet({ student, subject, teacher, hue, assignments, groups, config, scores, dbConfig, onClose }: Props) {
  const { isDark } = useTheme();
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<'grades' | 'attendance'>('grades');
  const [openItem, setOpenItem] = useState<StudentGradeDetail | null>(null);
  const [summary, setSummary] = useState<AttendanceSummary | null | 'loading'>('loading');
  const subjectId = subject?.subjectId;

  // A new student opens on the grades tab
  useEffect(() => { if (student) setTab('grades'); }, [student]);

  useEffect(() => {
    if (!student || !subjectId) return;
    if (!dbConfig) { setSummary(null); return; }
    let cancelled = false;
    const key = `${dbConfig.projectId}:${subjectId}`;
    setSummary(attendanceCache.get(key) ?? 'loading');
    attendanceCache
      .getOrLoad(key, () => teacherDatabaseService.getAttendanceSummary(dbConfig, subjectId))
      .then(result => { if (!cancelled) setSummary(result); })
      .catch(err => { console.error('Error loading attendance summary:', err); if (!cancelled) setSummary(null); });
    return () => { cancelled = true; };
  }, [student, subjectId, dbConfig]);

  const info: StudentSubjectInfo | null = useMemo(() => subject && ({
    subjectId: subject.subjectId,
    subjectName: subject.subjectName,
    classroom: subject.classroom,
    teacherId: subject.teacherId,
    teacherName: teacher?.name || '-',
    day: subject.day,
    time: subject.time,
    duration: subject.duration,
    schedules: subject.schedules,
    subjectCode: subject.subjectCode || '',
    room: subject.room || teacher?.defaultRoom || '',
    hue,
  }), [subject, teacher, hue]);

  const grade = useMemo(() => {
    if (!student || !subject) return null;
    const score = scores.find(s => s.studentId === student.studentId);
    return buildStudentGradeInfo(score, assignments, groups, config, subject);
  }, [student, subject, scores, assignments, groups, config]);

  const attendance: StudentAttendanceInfo | null = useMemo(() => {
    if (!student || !subject || !summary || summary === 'loading') return null;
    const statuses = summary.students?.[student.studentId] || {};
    const sessions = Object.entries(statuses)
      .filter(([id]) => summary.sessions?.[id])
      .map(([id, status]) => ({ date: summary.sessions[id].date, hours: summary.sessions[id].hours, status }));
    return { subjectId: subject.subjectId, subjectName: subject.subjectName, classroom: subject.classroom, stats: summarizeAttendance(sessions) };
  }, [summary, student, subject]);

  return (
    <>
      <Modal open={!!student && !!info} onClose={onClose} size="4xl" sheet surface="muted" labelledBy="student-sheet-title" className="p-4 sm:p-6">
        {student && info && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-gray-900 text-base font-semibold text-white dark:bg-white dark:text-gray-900">
                {student.number || '–'}
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="student-sheet-title" className="truncate text-xl font-semibold leading-snug">{student.name}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">เลขที่ {student.number || '–'} · ชั้น {student.class}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="ปิด"
                className="grid h-11 w-11 flex-none place-items-center rounded-full bg-gray-200/70 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <SubjectHeader subject={info} isDark={isDark} />

            <div role="tablist" aria-label="ข้อมูลวิชา" className="grid grid-cols-2 gap-1 rounded-full bg-gray-200/70 p-1 dark:bg-gray-800 sm:max-w-sm">
              {([['grades', 'คะแนน'], ['attendance', 'เวลาเรียน']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={tab === mode}
                  onClick={() => setTab(mode)}
                  className={`h-10 rounded-full text-[15px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${
                    tab === mode
                      ? 'bg-white text-gray-900 dark:bg-gray-600 dark:text-white'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                role="tabpanel"
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
              >
                {tab === 'grades' ? (
                  <GradesView grade={grade} subject={info} isDark={isDark} onOpen={setOpenItem} />
                ) : summary === 'loading' ? (
                  <div className="h-40 animate-pulse rounded-[22px] bg-white dark:bg-gray-800" aria-label="กำลังโหลดเวลาเรียน" />
                ) : (
                  <AttendanceView info={attendance} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </Modal>
      <AssignmentSheet item={openItem} onClose={() => setOpenItem(null)} />
    </>
  );
}
