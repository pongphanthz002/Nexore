'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { schoolDatabaseService, StudentData, SubjectData } from '@/services/school-database.service';
import { teacherDatabaseService } from '@/services/teacher-database.service';
import { AttendanceBar, TimetableCard } from './TimetableCard';
import { TimetableFullscreen } from './TimetableFullscreen';
import {
  attendanceDateKey, attendanceDue, attendanceHref, buildHueMap, checkedKey, dayDateLabel, entriesForDay,
  TimetableEntry, TimetableRole, TimetableTeacher, visibleDays, weekRange, WEEK_ORDER,
} from '@/lib/timetable';

/** Current day and minute, refreshed every 30 s and when the app comes back to the foreground. */
function useNow() {
  const read = () => { const d = new Date(); return { day: d.getDay(), minutes: d.getHours() * 60 + d.getMinutes() }; };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const tick = () => setNow(read());
    const id = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, []);
  return now;
}

interface TodayTimetableProps {
  role: TimetableRole;
  /** Student role: the signed-in student's record (classroom + electives). */
  studentInfo?: Pick<StudentData, 'studentId' | 'class'> | null;
}

/**
 * Home-page timetable for teachers and students: today's card (plus the attendance bar for
 * teachers) and the full-screen week view it opens.
 */
export default function TodayTimetable({ role, studentInfo }: TodayTimetableProps) {
  const { userAccount } = useAuth();
  const { isDark } = useTheme();
  const router = useRouter();
  const now = useNow();
  const [subjects, setSubjects] = useState<SubjectData[]>([]);
  const [teachers, setTeachers] = useState<Map<string, TimetableTeacher>>(new Map());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const config = userAccount?.schoolFirebaseConfig;
    if (!config || !userAccount?.userId) return;
    if (role === 'student' && !studentInfo?.class) return;
    let cancelled = false;

    (async () => {
      try {
        if (role === 'teacher') {
          const [own, teacher] = await Promise.all([
            schoolDatabaseService.getSubjectsForTeacher(config, userAccount.userId),
            schoolDatabaseService.getTeacherConfig(config, userAccount.userId),
          ]);
          if (cancelled) return;
          setSubjects(own);
          setTeachers(new Map([[userAccount.userId, { teacherId: userAccount.userId, name: teacher?.name || userAccount.name, defaultRoom: teacher?.defaultRoom }]]));
          setLoading(false);
          // Periods already checked today hide the attendance bar
          const todays = await teacherDatabaseService.getAttendanceByDate(teacher?.firebaseConfig || config, attendanceDateKey(new Date()));
          if (!cancelled) setChecked(new Set(todays.map(a => checkedKey(a.subjectId, a.classroom))));
        } else if (studentInfo) {
          const own = await schoolDatabaseService.getSubjectsForStudent(config, studentInfo as StudentData);
          const people = await schoolDatabaseService.getTeachersByIds(config, Array.from(new Set(own.map(s => s.teacherId))));
          if (cancelled) return;
          setSubjects(own);
          setTeachers(new Map(people.map(t => [t.teacherId, { teacherId: t.teacherId, name: t.name, defaultRoom: t.defaultRoom }])));
          setLoading(false);
        }
      } catch (error) {
        console.error('Error loading timetable:', error);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [role, userAccount, studentInfo]);

  const week = useMemo(() => {
    const hues = buildHueMap(subjects);
    return new Map<number, TimetableEntry[]>(WEEK_ORDER.map(d => [d, entriesForDay(subjects, d, role, teachers, hues)]));
  }, [subjects, teachers, role]);
  const range = useMemo(() => weekRange(Array.from(week.values())), [week]);
  const today = week.get(now.day) ?? [];
  const due = role === 'teacher' ? attendanceDue(today, now.minutes, checked) : null;
  const next = useMemo(() => {
    for (let i = 1; i <= 7; i++) { const list = week.get((now.day + i) % 7); if (list?.length) return list[0]; }
    return null;
  }, [week, now.day]);

  const openAttendance = (entry: TimetableEntry) => router.push(attendanceHref(entry));

  if (loading) {
    return <div className="h-64 w-full animate-pulse rounded-[22px] bg-white dark:bg-gray-800" aria-label="กำลังโหลดตาราง" />;
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <AnimatePresence initial={false}>
        {due && <AttendanceBar key={due.key} entry={due} now={now.minutes} isDark={isDark} onOpen={() => openAttendance(due)} />}
      </AnimatePresence>
      <TimetableCard
        role={role}
        entries={today}
        range={range}
        now={now.minutes}
        dateLabel={dayDateLabel(now.day)}
        next={next}
        isDark={isDark}
        onOpen={() => setOpen(true)}
      />
      <AnimatePresence>
        {open && (
          <TimetableFullscreen
            role={role}
            week={week}
            days={visibleDays(week, now.day)}
            today={now.day}
            now={now.minutes}
            range={range}
            isDark={isDark}
            due={due}
            onCheck={openAttendance}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
