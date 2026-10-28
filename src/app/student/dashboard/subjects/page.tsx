'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { studentDatabaseService, StudentSubjectInfo, StudentGradeInfo, StudentGradeDetail, StudentAttendanceInfo } from '@/services/student-database.service';
import { schoolDatabaseService } from '@/services/school-database.service';
import { allowAction } from '@/lib/firestore-helpers';
import StudentHeader from '@/components/StudentHeader';
import StudentFooter from '@/components/StudentFooter';
import {
  AssignmentSheet, AttendanceView, EASE, GradesView, ListSkeleton, SubjectHeader, SubjectList,
} from '@/components/StudentSubjectViews';

export default function StudentSubjectsPage() {
  const { userAccount } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const reduce = useReducedMotion();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [partialFailure, setPartialFailure] = useState(false);
  const [subjects, setSubjects] = useState<StudentSubjectInfo[]>([]);
  const [grades, setGrades] = useState<StudentGradeInfo[]>([]);
  const [attendance, setAttendance] = useState<StudentAttendanceInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grades' | 'attendance'>('grades');
  const [openItem, setOpenItem] = useState<StudentGradeDetail | null>(null);
  // ?subject=<id> (from the home page's pending work) opens that subject's grades once
  const deepLinkDone = useRef(false);

  const fetchData = useCallback(async (force = false) => {
    if (!force) setLoading(true);
    else setRefreshing(true);

    try {
      if (!userAccount?.schoolFirebaseConfig) {
        setError('ไม่พบข้อมูลโรงเรียน');
        return;
      }

      const studentData = await schoolDatabaseService.getStudentForAccount(userAccount.schoolFirebaseConfig, userAccount, force);
      if (!studentData) {
        setError('ไม่พบข้อมูลนักเรียน');
        return;
      }

      // Subjects, grades and attendance share one cached context (one set of reads)
      const {
        subjects: subjectsData,
        grades: gradesData,
        attendance: attendanceData,
        failedTeacherIds,
      } = await studentDatabaseService.getStudentSubjectOverview(userAccount.schoolFirebaseConfig, studentData, force);

      setSubjects(subjectsData);
      setGrades(gradesData);
      setAttendance(attendanceData);
      setPartialFailure(failedTeacherIds.length > 0);
      if (subjectsData.length === 1) setSelectedId(subjectsData[0].subjectId);
      if (!deepLinkDone.current) {
        deepLinkDone.current = true;
        const wanted = new URLSearchParams(window.location.search).get('subject');
        if (wanted && subjectsData.some(s => s.subjectId === wanted)) {
          setSelectedId(wanted);
          setViewMode('grades');
        }
      }
      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('โหลดข้อมูลไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userAccount]);

  useEffect(() => {
    if (userAccount?.userId) {
      fetchData();
    }
  }, [userAccount?.userId, fetchData]);

  // Manual retry re-reads from the server; throttled to avoid hammering Firestore
  const handleRetry = () => {
    if (!allowAction('student-subjects-refresh', 5_000)) return;
    fetchData(true);
  };

  const selected = subjects.find(s => s.subjectId === selectedId) || null;
  const gradeOf = (id: string) => grades.find(g => g.subjectId === id) || null;
  const attendanceOf = (id: string) => attendance.find(a => a.subjectId === id) || null;

  const openSubject = (id: string | null) => {
    setSelectedId(id);
    if (!id && window.location.search) window.history.replaceState(null, '', window.location.pathname);
    setViewMode('grades');
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 dark:bg-gray-900 dark:text-gray-50">
      <StudentHeader isDark={isDark} toggleTheme={toggleTheme} />

      <main className="mx-auto w-full max-w-7xl px-4 pb-32 pt-24 sm:px-6">
        {loading ? (
          <ListSkeleton />
        ) : !selected ? (
          <SubjectList
            subjects={subjects}
            gradeOf={gradeOf}
            attendanceOf={attendanceOf}
            error={error}
            partialFailure={partialFailure}
            refreshing={refreshing}
            onRetry={handleRetry}
            onOpen={openSubject}
          />
        ) : (
          <div className="space-y-4">
            {subjects.length > 1 && (
              <button
                type="button"
                onClick={() => openSubject(null)}
                className="-ml-2 inline-flex h-11 items-center gap-1 rounded-full pl-1 pr-4 text-[15px] font-medium text-gray-700 transition-colors hover:bg-gray-200/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <ChevronLeft size={20} /> วิชาทั้งหมด
              </button>
            )}

            <SubjectHeader subject={selected} isDark={isDark} />

            <div role="tablist" aria-label="ข้อมูลวิชา" className="grid grid-cols-2 gap-1 rounded-full bg-gray-200/70 p-1 dark:bg-gray-800 sm:max-w-sm">
              {([['grades', 'คะแนน'], ['attendance', 'เวลาเรียน']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === mode}
                  onClick={() => setViewMode(mode)}
                  className={`h-10 rounded-full text-[15px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${
                    viewMode === mode
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
                key={viewMode}
                role="tabpanel"
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
              >
                {viewMode === 'grades'
                  ? <GradesView grade={gradeOf(selected.subjectId)} subject={selected} isDark={isDark} onOpen={setOpenItem} />
                  : <AttendanceView info={attendanceOf(selected.subjectId)} />}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </main>

      <AssignmentSheet item={openItem} onClose={() => setOpenItem(null)} />
      <StudentFooter isDark={isDark} />
    </div>
  );
}
