'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, Dices, Maximize2, Repeat, Users, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTeacherRoster } from '@/hooks/useTeacherRoster';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import type { SubjectData, StudentData } from '@/services/school-database.service';
import { teacherDatabaseService } from '@/services/teacher-database.service';
import { buildSubjectGradeSummary } from '@/services/teacher-stats.service';
import SubjectPicker from '@/components/SubjectPicker';
import ComingSoon from '@/components/ComingSoon';
import Avatar from '@/components/Avatar';
import Modal, { ModalHeader } from '@/components/Modal';
import { Bone, SkeletonCard, SkeletonGroup } from '@/components/Skeleton';
import GachaMachine from '@/components/classroom/GachaMachine';
import GroupMaker from '@/components/classroom/GroupMaker';
import { Segmented, personLine, type ToolPerson } from '@/components/classroom/controls';
import {
  attendanceDateKey, buildHueMap, entriesForDay, hueVars, periodState, roomLabel, type TimetableTeacher,
} from '@/lib/timetable';
import { roomKeyOf } from '@/lib/classroom-tools-store';

/**
 * Classroom tools (teacher "เพิ่มเติม" → เครื่องมือในห้องเรียน): random picker and group maker
 * over one room, or every room of a merged period. Opens on the period being taught now;
 * outside a period the teacher picks a room. Students marked absent or on leave today are left
 * out (the teacher can change that), and the subject's totals, computed now from its scores with
 * the shared grade calculation (4 reads), balance the groups.
 */

/** Statuses that mean the student isn't in the room today. */
const AWAY = new Set(['ขาด', 'ลาป่วย', 'ลากิจ', 'หนี']);

type Tab = 'pick' | 'groups';

const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

const studentsOf = (subject: SubjectData, students: StudentData[]) => students.filter(s =>
  subject.subjectType === 'elective' && subject.studentIds?.length
    ? subject.studentIds.includes(s.studentId)
    : s.class === subject.classroom);

export default function ClassroomToolsPage() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { userAccount } = useAuth();
  const { isDark } = useTheme();
  const { can, loading: accessLoading } = useFeatureAccess();
  const { teacher, subjects, students, loading } = useTeacherRoster();

  const [selection, setSelection] = useState<SubjectData[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [tab, setTab] = useState<Tab>('pick');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [away, setAway] = useState<Set<string>>(new Set());
  const [scores, setScores] = useState<Map<string, number> | null>(null);
  const [showRoster, setShowRoster] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const timetableTeacher: TimetableTeacher | null = teacher
    ? { teacherId: teacher.teacherId, name: teacher.name, defaultRoom: teacher.defaultRoom }
    : null;
  const hues = useMemo(() => buildHueMap(subjects), [subjects]);

  // Open on the period being taught now, once the roster is here
  useEffect(() => {
    if (loading || selection || choosing) return;
    const teachers = new Map<string, TimetableTeacher>(timetableTeacher ? [[timetableTeacher.teacherId, timetableTeacher]] : []);
    const today = entriesForDay(subjects, new Date().getDay(), 'teacher', teachers, hues);
    const current = today.find(e => periodState(e, nowMinutes()) === 'current');
    if (current) setSelection(current.subjects);
    else setChoosing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- decide once when the roster first arrives
  }, [loading]);

  const pool: ToolPerson[] = useMemo(() => {
    if (!selection) return [];
    const seen = new Map<string, ToolPerson>();
    for (const subject of selection) {
      for (const s of studentsOf(subject, students)) {
        if (!seen.has(s.studentId)) {
          seen.set(s.studentId, { studentId: s.studentId, name: s.name, number: s.number, classroom: s.class, photoURL: s.photoURL });
        }
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.classroom.localeCompare(b.classroom, 'th', { numeric: true }) || (parseInt(a.number) || 0) - (parseInt(b.number) || 0));
  }, [selection, students]);

  const roomKey = selection ? roomKeyOf(selection.map(s => s.subjectId)) : '';
  const rooms = selection ? Array.from(new Set(selection.map(s => s.classroom))) : [];
  const showRoom = rooms.length > 1;

  // Today's attendance (who is away) and the subject's scores, for the open room
  useEffect(() => {
    if (!selection || !userAccount?.schoolFirebaseConfig) return;
    const dbConfig = teacher?.firebaseConfig || userAccount.schoolFirebaseConfig;
    let cancelled = false;
    setAway(new Set());
    setExcluded(new Set());
    setScores(null);
    const date = attendanceDateKey(new Date());
    Promise.all(selection.map(async subject => {
      const [session, summary] = await Promise.all([
        teacherDatabaseService.getAttendance(dbConfig, subject.subjectId, subject.classroom, date).catch(() => null),
        buildSubjectGradeSummary(dbConfig, subject, students).catch(err => {
          console.error('Error computing totals for groups:', err);
          return null;
        }),
      ]);
      return { session, summary };
    })).then(found => {
      if (cancelled) return;
      const awayIds = new Set<string>();
      const totals = new Map<string, number>();
      for (const { session, summary } of found) {
        session?.records?.forEach(r => { if (AWAY.has(r.status)) awayIds.add(r.studentId); });
        if (summary?.hasScores) Object.entries(summary.students).forEach(([id, st]) => totals.set(id, st.total));
      }
      setAway(awayIds);
      setExcluded(new Set(awayIds));
      setScores(totals.size ? totals : null);
    });
    return () => { cancelled = true; };
  }, [selection, teacher, userAccount, students]);

  const present = pool.filter(p => !excluded.has(p.studentId));

  // Fullscreen: the browser's own where it exists (not iPhone), always a covering layer
  useEffect(() => {
    if (!fullscreen) return;
    document.documentElement.requestFullscreen?.().catch(() => {});
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [fullscreen]);

  const wrap = (children: React.ReactNode) => (
    <div className="px-4 pt-2 text-gray-900 sm:px-6 dark:text-gray-50">
      <div className="mx-auto max-w-5xl space-y-6">{children}</div>
    </div>
  );

  const back = (
    <button
      type="button"
      onClick={() => router.push('/teacher/dashboard/additional')}
      className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
    >
      <ChevronLeft size={18} /> เพิ่มเติม
    </button>
  );

  if (!accessLoading && !can('classroomTools')) {
    return wrap(<ComingSoon icon={Dices} title="เครื่องมือในห้องเรียน" message="ระบบนี้ยังไม่เปิดให้ใช้งาน" />);
  }

  if (loading && subjects.length === 0) {
    return wrap(
      <SkeletonGroup label="กำลังโหลดห้องเรียน" className="space-y-6">
        <Bone className="h-8 w-56" />
        <SkeletonCard lines={2} />
        <SkeletonCard className="h-80" />
      </SkeletonGroup>,
    );
  }

  if (choosing || !selection) {
    return wrap(
      <>
        {back}
        <header className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">เลือกห้องเรียน</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">ตอนนี้ไม่ใช่คาบที่สอน เลือกห้องที่จะใช้เครื่องมือ</p>
          </div>
          {selection && (
            <button type="button" onClick={() => setChoosing(false)} className="h-10 rounded-xl bg-surface px-4 text-sm font-semibold shadow-neu-sm active:shadow-neu-in-sm">
              ยกเลิก
            </button>
          )}
        </header>
        <SubjectPicker
          subjects={subjects}
          teacher={timetableTeacher}
          countStudents={s => studentsOf(s, students).length}
          onSelect={s => { setSelection([s]); setChoosing(false); }}
        />
      </>,
    );
  }

  const first = selection[0];
  const hue = hues.get(first.subjectName) || 'blue';
  const groupTitle = [`${first.subjectName}${first.subjectCode ? ` (${first.subjectCode})` : ''}`, rooms.join(', ')].join(' · ');

  const tool = (big: boolean) => tab === 'pick'
    ? <GachaMachine people={present} roomKey={roomKey} showRoom={showRoom} big={big} />
    : <GroupMaker people={present} scores={scores} roomKey={roomKey} showRoom={showRoom} title={groupTitle} big={big} />;

  return wrap(
    <>
      {back}

      {/* Room bar */}
      <section className="flex flex-wrap items-center gap-3 rounded-[24px] bg-surface p-4 shadow-neu-lg" style={hueVars(hue, isDark)}>
        <span className="h-12 w-1.5 flex-none rounded-full bg-[var(--sbar)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight">{first.subjectName}</h1>
          <p className="truncate text-sm text-gray-500 dark:text-gray-400">
            {rooms.map(roomLabel).join(', ')}{first.subjectCode ? ` · ${first.subjectCode}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowRoster(true)}
            className="flex h-10 items-center gap-2 rounded-xl bg-surface px-3 text-sm font-semibold shadow-neu-sm transition-shadow active:shadow-neu-in-sm"
          >
            <Users size={16} />
            <span className="tabular-nums">{present.length}/{pool.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setChoosing(true)}
            className="flex h-10 items-center gap-2 rounded-xl bg-surface px-3 text-sm font-semibold shadow-neu-sm transition-shadow active:shadow-neu-in-sm"
          >
            <Repeat size={16} /> เปลี่ยนห้อง
          </button>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Segmented
          label="เครื่องมือ"
          value={tab}
          options={[['pick', 'สุ่มเรียก'], ['groups', 'จัดกลุ่ม']] as const}
          onChange={setTab}
          className="flex-1 sm:max-w-sm"
        />
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          aria-label="เต็มจอ"
          title="เต็มจอ"
          className="grid h-12 w-12 flex-none place-items-center rounded-full bg-surface text-gray-700 shadow-neu-sm transition-shadow active:shadow-neu-in-sm dark:text-gray-200"
        >
          <Maximize2 size={20} />
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          role="tabpanel"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {!fullscreen && tool(false)}
        </motion.div>
      </AnimatePresence>

      {fullscreen && createPortal(
        <div className="fixed inset-0 z-[90] overflow-y-auto bg-surface text-gray-900 dark:text-gray-50" role="dialog" aria-modal="true" aria-label="เต็มจอ">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-surface/95 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="min-w-0">
              <div className="truncate text-xl font-bold">{first.subjectName}</div>
              <div className="truncate text-sm text-gray-500 dark:text-gray-400">{rooms.map(roomLabel).join(', ')} · {present.length} คน</div>
            </div>
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              aria-label="ออกจากเต็มจอ"
              className="grid h-12 w-12 flex-none place-items-center rounded-full bg-surface shadow-neu-sm active:shadow-neu-in-sm"
            >
              <X size={22} />
            </button>
          </div>
          <div className="px-5 pb-10 pt-4">
            {tab === 'groups' && <p className="sr-only">ผลการจัดกลุ่มล่าสุด</p>}
            {tool(true)}
          </div>
        </div>,
        document.body,
      )}

      <Modal open={showRoster} onClose={() => setShowRoster(false)} sheet size="md" labelledBy="roster-title">
        <ModalHeader
          id="roster-title"
          title="นักเรียนในห้อง"
          subtitle={`ใช้ ${present.length} จาก ${pool.length} คน · แตะเพื่อเอาออกหรือใส่คืน`}
          onClose={() => setShowRoster(false)}
        />
        {away.size > 0 && (
          <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">คนที่ขาดหรือลาวันนี้ ({away.size} คน) ถูกเอาออกให้แล้ว</p>
        )}
        <ul className="space-y-2">
          {pool.map(p => {
            const out = excluded.has(p.studentId);
            return (
              <li key={p.studentId}>
                <button
                  type="button"
                  aria-pressed={!out}
                  onClick={() => setExcluded(prev => {
                    const next = new Set(prev);
                    if (next.has(p.studentId)) next.delete(p.studentId); else next.add(p.studentId);
                    return next;
                  })}
                  className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-[opacity,box-shadow] ${out ? 'opacity-45 shadow-neu-in-sm' : 'bg-surface shadow-neu-sm'}`}
                >
                  <Avatar src={p.photoURL} name={p.name} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-semibold ${out ? 'line-through' : ''}`}>{p.name}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      {personLine(p, showRoom)}{away.has(p.studentId) ? ' · ขาด/ลาวันนี้' : ''}
                    </span>
                  </span>
                  <span className={`text-xs font-semibold ${out ? 'text-gray-500' : 'text-emerald-700 dark:text-emerald-400'}`}>{out ? 'ไม่อยู่' : 'อยู่'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Modal>
    </>,
  );
}
