'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Avatar from '@/components/Avatar';
import { googlePhotoURL } from '@/lib/google-photo';
import { hueVars } from '@/lib/timetable';
import { schoolDatabaseService } from '@/services/school-database.service';
import { studentDatabaseService, type StudentSubjectInfo } from '@/services/student-database.service';
import StudentHeader from '@/components/StudentHeader';
import StudentFooter from '@/components/StudentFooter';
import { BookOpen, ChevronRight, Files } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

export default function StudentProfilePage() {
  const router = useRouter();
  const { userAccount, user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [subjects, setSubjects] = useState<StudentSubjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchStudentInfo = useCallback(async () => {
    setLoading(true);
    try {
      if (!userAccount?.schoolFirebaseConfig) return;

      const studentData = await schoolDatabaseService.getStudentForAccount(userAccount.schoolFirebaseConfig, userAccount);
      setStudentInfo(studentData);

      if (studentData?.class) {
        setSubjects(await studentDatabaseService.getStudentSubjects(userAccount.schoolFirebaseConfig, studentData));
      }
    } catch (err) {
      console.error('Error fetching student info:', err);
    } finally {
      setLoading(false);
    }
  }, [userAccount]);

  useEffect(() => {
    if (userAccount) fetchStudentInfo();
  }, [userAccount, fetchStudentInfo]);

  const handleCopySchoolId = () => {
    if (userAccount?.schoolId) {
      navigator.clipboard.writeText(userAccount.schoolId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // One chip per subject name, in its timetable hue
  const subjectChips = Array.from(new Map(subjects.map(s => [s.subjectName, s.hue])).entries());
  const name = studentInfo?.name || userAccount?.name;

  return (
    <div className="min-h-screen bg-surface font-sans text-gray-900 dark:text-gray-50">
      <StudentHeader isDark={isDark} toggleTheme={toggleTheme} />

      <main className="mx-auto max-w-3xl space-y-8 px-4 pb-32 pt-28 sm:px-6">

        {/* Identity */}
        <section className="rounded-2xl bg-surface p-5 shadow-neu-lg sm:p-6">
          <div className="flex items-start gap-4">
            <Avatar src={googlePhotoURL(user)} name={name} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-bold leading-tight">
                {loading && !name ? 'กำลังโหลด…' : name || '-'}
              </h1>
              <p className="truncate text-sm text-gray-500 dark:text-gray-400">{userAccount?.email || '-'}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-red-700 dark:text-red-300">นักเรียน</span>
                {studentInfo?.studentId && (
                  <span className="rounded-full bg-gray-500/10 px-2.5 py-0.5 font-mono text-gray-600 dark:text-gray-300">{studentInfo.studentId}</span>
                )}
              </div>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3 shadow-neu-in-sm">
              <dt className="text-xs font-semibold text-gray-500 dark:text-gray-400">ห้องเรียน</dt>
              <dd className="mt-0.5 text-lg font-bold">{studentInfo?.class || '–'}</dd>
            </div>
            <div className="rounded-xl p-3 shadow-neu-in-sm">
              <dt className="text-xs font-semibold text-gray-500 dark:text-gray-400">เลขที่</dt>
              <dd className="mt-0.5 text-lg font-bold">{studentInfo?.number || '–'}</dd>
            </div>
          </dl>
        </section>

        {/* Learning */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">การเรียน</h2>
          <button
            type="button"
            onClick={() => router.push('/student/dashboard/subjects')}
            className="w-full rounded-2xl bg-surface p-5 text-left shadow-neu-lg transition-shadow active:shadow-neu-in-sm"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-red-600 shadow-neu-in-sm dark:text-red-400">
                <BookOpen size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold leading-tight">วิชาที่เรียน</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {loading && subjects.length === 0 ? 'กำลังโหลด…' : `${subjectChips.length} วิชา`}
                </div>
              </div>
              <span className="flex-none text-sm font-semibold text-red-700 dark:text-red-400">ดูคะแนน</span>
              <ChevronRight size={18} className="flex-none text-gray-400" />
            </div>
            {subjectChips.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {subjectChips.map(([subjectName, hue]) => (
                  <span
                    key={subjectName}
                    style={hueVars(hue, isDark)}
                    className="timetable-block rounded-lg py-1 pl-3 pr-2.5 text-sm font-semibold text-[var(--st)]"
                  >
                    {subjectName}
                  </span>
                ))}
              </div>
            )}
          </button>
        </section>

        {/* Account */}
        {userAccount?.schoolId && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">บัญชีและระบบ</h2>
            <div className="overflow-hidden rounded-2xl bg-surface shadow-neu-lg">
              <button type="button" onClick={handleCopySchoolId} className="flex w-full items-center gap-3 p-4 text-left active:bg-black/5 dark:active:bg-white/5">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl shadow-neu-in-sm"><Files size={18} /></span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">School ID</div>
                  <div className="truncate font-mono text-sm text-gray-500 dark:text-gray-400">{userAccount.schoolId}</div>
                </div>
                <span className="flex-none text-sm font-semibold text-gray-500 dark:text-gray-400">{copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
              </button>
            </div>
          </section>
        )}
      </main>

      <StudentFooter isDark={isDark} />
    </div>
  );
}
