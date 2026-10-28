'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useState, useMemo } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import type { StudentSubjectInfo, StudentGradeInfo, StudentGradeDetail, StudentAttendanceInfo } from '@/services/student-database.service';
import { hueVars, parseTimeRange, formatMinutes, roomLabel, THAI_DAYS_SHORT, THAI_MONTHS_SHORT } from '@/lib/timetable';
import { ATTENDANCE_THRESHOLD, STATUS_ORDER, WEEKDAYS, type AttendanceStats } from '@/lib/attendance';
import { ATTENDANCE_STATUSES } from '@/components/AttendanceStatusSelect';
import Modal from '@/components/Modal';

/**
 * Views of the student subjects page: the subject list, a subject's header, its grades and
 * attendance, and the assignment sheet. Flat surfaces, subject hue from the timetable.
 */

export const EASE = [0.2, 0.8, 0.2, 1] as const;
/** Soft UI: big cards rise from the page, small ones (tiles, history entries) sink into it */
const CARD = 'rounded-[22px] bg-surface shadow-neu';
const WELL = 'rounded-[22px] shadow-neu-in-sm';
const META = 'text-gray-600 dark:text-gray-400';
const HISTORY_PREVIEW = 12;

const statusStyle = (status: string) => ATTENDANCE_STATUSES.find(s => s.value === status);
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));

/** "Wed 5/11" → "พ. 5 พ.ย." */
function sessionDateLabel(date: string): string {
  const [day, dm] = date.split(' ');
  const [d, m] = (dm || '').split('/').map(Number);
  const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(day);
  if (!d || !m) return date;
  return `${dayIndex >= 0 ? THAI_DAYS_SHORT[dayIndex] + '. ' : ''}${d} ${THAI_MONTHS_SHORT[m - 1] || ''}`;
}

/** "2026-10-30" → { label: "30 ต.ค.", daysLeft } */
function parseDeadline(deadline: string): { label: string; daysLeft: number } | null {
  const m = deadline.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return deadline ? { label: deadline, daysLeft: Infinity } : null;
  const due = new Date(+m[1], +m[2] - 1, +m[3]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { label: `${due.getDate()} ${THAI_MONTHS_SHORT[due.getMonth()]}`, daysLeft: Math.round((due.getTime() - today.getTime()) / 86_400_000) };
}

function deadlineText(item: StudentGradeDetail): { text: string; urgent: boolean } | null {
  const due = parseDeadline(item.deadline);
  if (!due) return null;
  if (item.score !== null || !Number.isFinite(due.daysLeft)) return { text: `กำหนดส่ง ${due.label}`, urgent: false };
  if (due.daysLeft < 0) return { text: `เลยกำหนด ${-due.daysLeft} วัน (${due.label})`, urgent: true };
  if (due.daysLeft === 0) return { text: `ส่งวันนี้ (${due.label})`, urgent: true };
  if (due.daysLeft === 1) return { text: `ส่งพรุ่งนี้ (${due.label})`, urgent: false };
  return { text: `กำหนดส่ง ${due.label} · อีก ${due.daysLeft} วัน`, urgent: false };
}

function scheduleLines(subject: StudentSubjectInfo): string[] {
  const slots = subject.schedules?.length ? subject.schedules : [{ day: subject.day, time: subject.time }];
  return slots.filter(s => s.day && s.time).map(s => {
    const range = parseTimeRange(s.time);
    return `${s.day} ${range ? `${formatMinutes(range.start)}–${formatMinutes(range.end)}` : s.time}`;
  });
}

// ---------------------------------------------------------------------------
// Subject list
// ---------------------------------------------------------------------------

interface SubjectListProps {
  subjects: StudentSubjectInfo[];
  gradeOf: (id: string) => StudentGradeInfo | null;
  attendanceOf: (id: string) => StudentAttendanceInfo | null;
  error: string | null;
  partialFailure: boolean;
  refreshing: boolean;
  onRetry: () => void;
  onOpen: (id: string) => void;
}

const totalOf = (g: StudentGradeInfo) => g.maxima.collected + g.maxima.midterm + g.maxima.final;

export function SubjectList({ subjects, gradeOf, attendanceOf, error, partialFailure, refreshing, onRetry, onOpen }: SubjectListProps) {
  const { isDark } = useTheme();
  const reduce = useReducedMotion();
  const pending = subjects.reduce((sum, s) => sum + (gradeOf(s.subjectId)?.unsent || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold leading-tight">วิชาเรียน</h1>
          {!error && (
            <p className={`mt-1 text-[15px] ${META}`}>
              {subjects.length} วิชา
              {pending > 0 && <> · <span className="font-medium text-red-700 dark:text-red-400">งานค้าง {pending} งาน</span></>}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={refreshing}
          aria-label="รีเฟรชคะแนนและเวลาเรียน"
          title="รีเฟรช"
          className="grid h-11 w-11 flex-none place-items-center rounded-full bg-surface text-gray-600 shadow-neu-sm transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 active:shadow-neu-in-sm disabled:text-gray-400 dark:text-gray-300"
        >
          <RefreshCw size={22} className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} />
        </button>
      </div>

      {error && (
        <div className={`${CARD} p-5`}>
          <p className="text-[15px] font-medium">{error}</p>
          <button type="button" onClick={onRetry} disabled={refreshing} className="mt-2 h-10 text-[15px] font-semibold text-blue-700 disabled:opacity-50 dark:text-blue-400">
            {refreshing ? 'กำลังโหลด…' : 'ลองใหม่'}
          </button>
        </div>
      )}

      {!error && partialFailure && (
        <div className="flex items-center justify-between gap-3 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <span>บางวิชาโหลดคะแนนไม่สำเร็จ</span>
          <button type="button" onClick={onRetry} disabled={refreshing} className="h-9 shrink-0 font-semibold disabled:opacity-50">
            {refreshing ? 'กำลังโหลด…' : 'ลองใหม่'}
          </button>
        </div>
      )}

      {!error && subjects.length === 0 && (
        <div className={`${CARD} p-6`}>
          <p className="text-[17px] font-semibold">ยังไม่มีวิชาเรียน</p>
          <p className={`mt-1 text-sm ${META}`}>วิชาจะขึ้นที่นี่เมื่อครูของวิชาลงทะเบียนเข้าใช้ระบบแล้ว</p>
        </div>
      )}

      {subjects.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subjects.map((subject, i) => {
            const grade = gradeOf(subject.subjectId);
            const stats = attendanceOf(subject.subjectId)?.stats;
            const low = stats?.percentage != null && stats.percentage < ATTENDANCE_THRESHOLD;
            const alerts = [grade?.unsent ? `งานค้าง ${grade.unsent} งาน` : '', low ? `มาเรียน ${fmt(stats!.percentage!)}%` : ''].filter(Boolean);
            return (
              <motion.li
                key={subject.subjectId}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.04, ease: EASE }}
              >
                <button
                  type="button"
                  onClick={() => onOpen(subject.subjectId)}
                  style={hueVars(subject.hue, isDark)}
                  className={`flex h-full w-full flex-col gap-3 rounded-[22px] p-4 text-left transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 active:shadow-neu-in-sm ${
                    grade?.unsent ? 'bg-red-50/70 shadow-[inset_0_0_0_1.5px_rgb(248_113_113/0.55),var(--neu-raised)] dark:bg-red-950/30' : 'bg-surface shadow-neu'
                  }`}
                >
                  <span className="flex w-full items-start gap-3">
                    <span aria-hidden className="mt-0.5 h-11 w-1.5 flex-none rounded-full bg-[var(--sbar)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[17px] font-semibold leading-snug">{subject.subjectName}</span>
                      <span className={`mt-0.5 block truncate text-sm ${META}`}>
                        {[subject.subjectCode, subject.teacherName !== '-' && `ครู ${subject.teacherName}`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="flex-none text-right">
                      <span className="block text-[28px] font-semibold leading-none tabular-nums text-[var(--st)]">
                        {grade ? grade.grade : <span className="text-gray-400 dark:text-gray-500">—</span>}
                      </span>
                      <span className={`mt-1 block text-xs ${META}`}>เกรด</span>
                    </span>
                  </span>
                  <span className="block w-full">
                    {grade ? (
                      <>
                        <span className="mb-1.5 flex items-baseline justify-between text-sm">
                          <span className={META}>คะแนนรวม</span>
                          <span className="tabular-nums"><span className="font-semibold">{fmt(grade.totalScore)}</span><span className={META}> / {fmt(totalOf(grade))}</span></span>
                        </span>
                        <Bar value={grade.totalScore} max={totalOf(grade)} className="bg-[var(--sbar)]" />
                      </>
                    ) : (
                      <span className={`text-sm ${META}`}>ยังไม่มีคะแนน</span>
                    )}
                  </span>
                  {alerts.length > 0 && (
                    <span className="text-sm font-medium text-red-700 dark:text-red-400">{alerts.join(' · ')}</span>
                  )}
                </button>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="กำลังโหลดวิชาเรียน">
      <div>
        <h1 className="text-2xl font-semibold leading-tight">วิชาเรียน</h1>
        <div className="mt-2 h-4 w-24 rounded-full bg-gray-300/60 dark:bg-white/10" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} className={`${CARD} space-y-4 p-4`}>
            <div className="flex items-start gap-3">
              <span className="h-11 w-1.5 rounded-full bg-gray-300/60 dark:bg-white/10" />
              <span className="flex-1 space-y-2">
                <span className="block h-4 w-2/5 rounded-full bg-gray-300/60 dark:bg-white/10" />
                <span className="block h-3 w-1/3 rounded-full bg-gray-300/40 dark:bg-white/5" />
              </span>
              <span className="h-7 w-8 rounded-md bg-gray-300/60 dark:bg-white/10" />
            </div>
            <span className="block h-2 rounded-full shadow-neu-in-xs" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subject detail
// ---------------------------------------------------------------------------

export function SubjectHeader({ subject, isDark }: { subject: StudentSubjectInfo; isDark: boolean }) {
  const slots = scheduleLines(subject);
  return (
    <section style={hueVars(subject.hue, isDark)} className="rounded-[22px] bg-[var(--sb)] p-5 shadow-neu lg:flex lg:items-end lg:justify-between lg:gap-8 lg:p-6">
      <div>
        {subject.subjectCode && <p className="text-sm font-medium text-[var(--st)]">{subject.subjectCode}</p>}
        <h1 className="text-2xl font-semibold leading-tight text-[var(--sbig)] lg:text-[28px]">{subject.subjectName}</h1>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px] text-[var(--smeta)] lg:mt-0 lg:flex lg:gap-8">
        {subject.teacherName !== '-' && <div className="contents lg:block"><dt>ครู</dt><dd className="text-[var(--sbig)]">{subject.teacherName}</dd></div>}
        {subject.room && <div className="contents lg:block"><dt>ห้องเรียน</dt><dd className="text-[var(--sbig)]">{roomLabel(subject.room)}</dd></div>}
        {slots.length > 0 && <div className="contents lg:block"><dt>เวลาเรียน</dt><dd className="text-[var(--sbig)]">{slots.map(slot => <span key={slot} className="block">{slot}</span>)}</dd></div>}
      </dl>
    </section>
  );
}

function Bar({ value, max, className, thick = false }: { value: number; max: number; className: string; thick?: boolean }) {
  const reduce = useReducedMotion();
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <span className={`block overflow-hidden rounded-full shadow-neu-in-xs ${thick ? 'h-2.5' : 'h-2'}`}>
      <motion.span
        className={`block h-full origin-left rounded-full ${className}`}
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: ratio }}
        transition={{ duration: 0.6, ease: EASE }}
      />
    </span>
  );
}

/** The subject's grade steps with the current one filled, and the points to the next step. */
function GradeLadder({ grade }: { grade: StudentGradeInfo }) {
  const current = [...grade.scale].reverse().find(s => grade.totalScore >= s.minScore);
  const next = grade.scale.find(s => s.minScore > grade.totalScore);
  return (
    <div>
      <ol className="flex gap-1" aria-label="เกณฑ์เกรด">
        {grade.scale.map(step => {
          const isCurrent = step === current;
          const passed = !isCurrent && current !== undefined && step.minScore < current.minScore;
          return (
            <li key={step.grade} className="min-w-0 flex-1 text-center" aria-current={isCurrent ? 'step' : undefined}>
              <span className={`block text-sm tabular-nums ${isCurrent ? 'font-semibold text-[var(--sbig)]' : 'text-[var(--smeta)]'}`}>{step.grade}</span>
              <span className={`mt-1 block h-2 rounded-full ${isCurrent ? 'bg-[var(--sbar)]' : passed ? 'bg-[var(--sbar)] opacity-35' : 'bg-white/80 dark:bg-white/10'}`} />
              <span className="mt-1 block text-[11px] tabular-nums text-[var(--smeta)]">{step.minScore}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[15px] text-[var(--sbig)]">
        {next
          ? <>อีก <span className="font-semibold tabular-nums">{fmt(Math.round((next.minScore - grade.totalScore) * 100) / 100)}</span> คะแนน ได้เกรด <span className="font-semibold">{next.grade}</span></>
          : 'ได้เกรดสูงสุดแล้ว'}
      </p>
    </div>
  );
}

function StatTile({ label, value, max, entered = true }: { label: string; value: number; max: number; entered?: boolean }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className={`${WELL} flex flex-col p-3.5 sm:p-5`}>
      <p className={`text-sm ${META}`}>{label}</p>
      <p className="mt-1.5 tabular-nums sm:mt-2">
        {entered
          ? <span className="text-[26px] font-semibold leading-none sm:text-4xl">{fmt(value)}</span>
          : <span className="text-[26px] font-semibold leading-none text-gray-500 dark:text-gray-400 sm:text-4xl">—</span>}
        <span className={`block text-sm sm:ml-1 sm:inline sm:text-lg ${META}`}>/ {fmt(max)}</span>
      </p>
      <div className="mt-auto pt-3">
        <Bar value={entered ? value : 0} max={max} className="bg-[var(--sbar)]" />
        <p className={`mt-1.5 text-xs ${META}`}>{entered ? `${pct}%` : 'ยังไม่มีคะแนน'}</p>
      </div>
    </div>
  );
}

export function GradesView({ grade, subject, isDark, onOpen }: {
  grade: StudentGradeInfo | null;
  subject: StudentSubjectInfo;
  isDark: boolean;
  onOpen: (item: StudentGradeDetail) => void;
}) {
  if (!grade) {
    return (
      <div className={`${CARD} p-5`}>
        <p className="text-[17px] font-semibold">ยังไม่มีคะแนน</p>
        <p className={`mt-1 text-sm ${META}`}>คะแนนจะขึ้นที่นี่เมื่อครูลงคะแนนวิชานี้</p>
      </div>
    );
  }

  const total = totalOf(grade);
  const scored = grade.details.filter(d => d.score !== null).length;

  return (
    <div style={hueVars(subject.hue, isDark)} className="grid gap-4 lg:grid-cols-12 lg:gap-5">
      <section aria-label="เกรดและคะแนนรวม" className="rounded-[22px] bg-[var(--sb)] p-5 shadow-neu lg:col-span-5 lg:row-span-2 lg:flex lg:flex-col lg:p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-[var(--smeta)]">เกรดตอนนี้</p>
            <p className="mt-1 text-[72px] font-semibold leading-[0.9] tracking-tight tabular-nums text-[var(--sbig)] lg:text-[96px]">{grade.grade}</p>
          </div>
          <div className="pb-1 text-right">
            <p className="text-sm text-[var(--smeta)]">คะแนนรวม</p>
            <p className="mt-1 tabular-nums text-[var(--sbig)]">
              <span className="text-4xl font-semibold leading-none lg:text-5xl">{fmt(grade.totalScore)}</span>
              <span className="text-lg text-[var(--smeta)]"> / {fmt(total)}</span>
            </p>
          </div>
        </div>
        <div className="mt-6 lg:mt-auto lg:pt-8">
          <GradeLadder grade={grade} />
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:col-span-7 lg:gap-4">
        <StatTile label="คะแนนเก็บ" value={grade.collectedScore} max={grade.maxima.collected} />
        <StatTile label="กลางภาค" value={grade.midtermScore} max={grade.maxima.midterm} entered={grade.midtermEntered} />
        <StatTile label="ปลายภาค" value={grade.finalScore} max={grade.maxima.final} entered={grade.finalEntered} />
      </div>

      <section className={`${CARD} p-5 lg:col-span-7`} aria-label="งานที่ได้คะแนนแล้ว">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px]">ได้คะแนนแล้ว <span className="font-semibold tabular-nums">{scored}</span> จาก {grade.details.length} งาน</p>
          {grade.unsent > 0
            ? <p className="text-[15px] font-medium text-red-700 dark:text-red-400">งานค้าง {grade.unsent} งาน</p>
            : grade.details.length > 0 && <p className="text-[15px] text-emerald-700 dark:text-emerald-400">ไม่มีงานค้าง</p>}
        </div>
        <div className="mt-3">
          <Bar value={scored} max={grade.details.length} className="bg-[var(--sbar)]" thick />
        </div>
      </section>

      <section className="space-y-2 pt-2 lg:col-span-12" aria-labelledby="assignments-heading">
        <h2 id="assignments-heading" className="px-1 text-[17px] font-semibold">งานและคะแนน</h2>
        {grade.details.length === 0 ? (
          <div className={`${CARD} p-5 text-[15px] ${META}`}>ครูยังไม่ได้เพิ่มงานในวิชานี้</div>
        ) : (
          <ul className={`${CARD} divide-y divide-gray-300/50 overflow-hidden dark:divide-white/5`}>
            {grade.rows.map((row, i) => row.kind === 'assignment' ? (
              <li key={`a-${i}`}><AssignmentRow item={row.item} onOpen={onOpen} /></li>
            ) : (
              <li key={row.id}>
                <div className="grid min-h-[56px] grid-cols-[1fr_auto] items-center gap-x-4 bg-[var(--sb)] px-4 py-3 md:grid-cols-[1fr_260px_120px] md:px-5">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-[var(--sbig)]">{row.name}</span>
                    <span className="mt-0.5 block text-[13px] text-[var(--smeta)] md:hidden">{row.items.length} งาน</span>
                  </span>
                  <span className="hidden text-sm text-[var(--smeta)] md:block">{row.items.length} งาน</span>
                  <span className="text-right tabular-nums text-[var(--sbig)]">
                    <span className="text-[17px] font-semibold">{fmt(row.points)}</span>
                    <span className="text-sm text-[var(--smeta)]"> / {fmt(row.max)}</span>
                  </span>
                </div>
                <ul className="divide-y divide-gray-300/50 dark:divide-white/5">
                  {row.items.map((item, j) => (
                    <li key={`${row.id}-${j}`}><AssignmentRow item={item} onOpen={onOpen} nested /></li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** One assignment in the score list. Inside a group it is indented and its raw score is set small. */
function AssignmentRow({ item, onOpen, nested = false }: { item: StudentGradeDetail; onOpen: (item: StudentGradeDetail) => void; nested?: boolean }) {
  const due = deadlineText(item);
  const missing = item.score === null;
  const red = 'text-red-700 dark:text-red-400';
  const sub = [missing && !due?.urgent ? 'ยังไม่มีคะแนน' : '', due?.text].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-4 py-3 pr-4 text-left transition-colors hover:bg-black/[0.03] focus-visible:bg-black/[0.03] focus-visible:outline-none active:bg-black/[0.06] dark:hover:bg-white/[0.04] dark:focus-visible:bg-white/[0.04] dark:active:bg-white/[0.07] md:grid-cols-[1fr_260px_120px] md:pr-5 ${
        nested ? 'min-h-[52px] pl-4 md:pl-5' : 'min-h-[60px] pl-4 md:pl-5'
      }`}
    >
      <span className={`flex min-w-0 items-center gap-3 ${nested ? 'pl-3' : ''}`}>
        {nested && <span aria-hidden className="h-8 w-[3px] flex-none self-stretch rounded-full bg-[var(--sbar)] opacity-40" />}
        <span className="min-w-0">
          <span className={`block truncate ${nested ? 'text-sm' : 'text-[15px]'} font-medium ${missing ? red : ''}`}>{item.label}</span>
          {sub && <span className={`mt-0.5 block truncate text-[13px] md:hidden ${missing ? red : META}`}>{sub}</span>}
        </span>
      </span>
      <span className={`hidden truncate text-sm md:block ${missing ? red : META}`}>{sub}</span>
      <span className="text-right tabular-nums">
        {missing
          ? <span className={`${nested ? 'text-[15px]' : 'text-[17px]'} font-semibold ${red}`}>—</span>
          : <span className={nested ? `text-[15px] ${META}` : 'text-[17px] font-semibold'}>{fmt(item.score!)}</span>}
        <span className={`text-sm ${missing ? red : META}`}> / {fmt(item.max)}</span>
      </span>
    </button>
  );
}

export function AttendanceView({ info }: { info: StudentAttendanceInfo | null }) {
  const [showAll, setShowAll] = useState(false);
  const stats: AttendanceStats | undefined = info?.stats;

  if (!stats || stats.totalHours === 0) {
    return (
      <div className={`${CARD} p-5`}>
        <p className="text-[17px] font-semibold">ยังไม่มีการเช็คชื่อ</p>
        <p className={`mt-1 text-sm ${META}`}>เวลาเรียนจะขึ้นที่นี่เมื่อครูเช็คชื่อวิชานี้</p>
      </div>
    );
  }

  const pct = stats.percentage ?? 0;
  const passing = pct >= ATTENDANCE_THRESHOLD;
  const used = STATUS_ORDER.filter(s => stats.hours[s] > 0);
  const maxMissed = Math.max(...WEEKDAYS.map(d => stats.missedByDay[d]));
  const history = showAll ? stats.history : stats.history.slice(0, HISTORY_PREVIEW);

  return (
    <div className="grid gap-4 md:grid-cols-12 lg:gap-5">
      <section className={`${CARD} p-5 lg:p-6 ${maxMissed > 0 ? 'md:col-span-7' : 'md:col-span-12'}`} aria-label="สรุปเวลาเรียน">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className={`text-sm ${META}`}>มาเรียน</p>
            <p className={`mt-1 text-5xl font-semibold leading-none tabular-nums lg:text-6xl ${passing ? '' : 'text-red-700 dark:text-red-400'}`}>{fmt(pct)}%</p>
          </div>
          <p className={`pb-0.5 text-right text-[15px] ${META}`}>
            {fmt(stats.presentHours)} จาก {fmt(stats.totalHours)} ชั่วโมง
          </p>
        </div>
        <p className={`mt-3 text-[15px] ${passing ? 'text-emerald-700 dark:text-emerald-400' : 'font-medium text-red-700 dark:text-red-400'}`}>
          {passing ? `ผ่านเกณฑ์ ${ATTENDANCE_THRESHOLD}% มีสิทธิ์สอบ` : `ต่ำกว่าเกณฑ์ ${ATTENDANCE_THRESHOLD}% อาจหมดสิทธิ์สอบ`}
        </p>

        <div className="relative mt-4">
          <div className="flex h-3 overflow-hidden rounded-full shadow-neu-in-xs" aria-hidden>
            {used.map(s => (
              <div key={s} className={statusStyle(s)?.dot} style={{ width: `${(stats.hours[s] / stats.totalHours) * 100}%` }} />
            ))}
          </div>
          <span aria-hidden className="absolute -top-1 h-5 w-0.5 rounded-full bg-gray-900 dark:bg-white" style={{ left: `${ATTENDANCE_THRESHOLD}%` }} />
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[15px] lg:grid-cols-3">
          {used.map(s => (
            <li key={s} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 flex-none rounded-full ${statusStyle(s)?.dot}`} />
              <span className="flex-1">{s}</span>
              <span className="tabular-nums font-medium">{fmt(stats.hours[s])} ชม.</span>
            </li>
          ))}
        </ul>
      </section>

      {maxMissed > 0 && (
        <section className={`${CARD} p-5 md:col-span-5 lg:p-6`} aria-labelledby="missed-heading">
          <h2 id="missed-heading" className="text-[17px] font-semibold">ขาดและลาวันไหน</h2>
          <p className={`mt-0.5 text-sm ${META}`}>ชั่วโมงที่ขาด หนี หรือลา แยกตามวัน</p>
          <div className="mt-4 grid grid-cols-5 items-end gap-3">
            {WEEKDAYS.map((d, i) => {
              const h = stats.missedByDay[d];
              return (
                <div key={d} className="flex flex-col items-center gap-1.5">
                  <span className="text-sm font-medium tabular-nums">{h > 0 ? fmt(h) : ''}</span>
                  <div className="flex h-24 w-full max-w-[48px] items-end overflow-hidden rounded-lg shadow-neu-in-sm">
                    <div className={`w-full rounded-lg ${h === maxMissed ? 'bg-red-500 dark:bg-red-400' : 'bg-gray-400 dark:bg-gray-500'}`} style={{ height: `${(h / maxMissed) * 100}%` }} />
                  </div>
                  <span className={`text-sm ${META}`}>{THAI_DAYS_SHORT[i + 1]}.</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-2 pt-2 md:col-span-12" aria-labelledby="history-heading">
        <div className="flex items-baseline justify-between px-1">
          <h2 id="history-heading" className="text-[17px] font-semibold">ประวัติการเข้าเรียน</h2>
          <span className={`text-sm ${META}`}>{stats.history.length} ครั้ง</span>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {history.map((h, i) => (
            <li key={`${h.date}-${i}`} className={`${WELL} flex min-h-[52px] items-center justify-between gap-3 rounded-2xl px-4`}>
              <span className="text-[15px]">
                {sessionDateLabel(h.date)}
                {h.hours > 1 && <span className={META}> · {h.hours} ชม.</span>}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${statusStyle(h.status)?.chip}`}>{h.status}</span>
            </li>
          ))}
        </ul>
        {stats.history.length > HISTORY_PREVIEW && (
          <button
            type="button"
            onClick={() => setShowAll(v => !v)}
            className="h-11 w-full rounded-full bg-surface text-[15px] font-semibold text-gray-700 shadow-neu-sm transition-shadow active:shadow-neu-in-sm dark:text-gray-300"
          >
            {showAll ? 'ย่อ' : `ดูทั้งหมด ${stats.history.length} ครั้ง`}
          </button>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assignment sheet (bottom sheet on phones, dialog on larger screens)
// ---------------------------------------------------------------------------

export function AssignmentSheet({ item, onClose }: { item: StudentGradeDetail | null; onClose: () => void }) {
  const due = useMemo(() => (item ? deadlineText(item) : null), [item]);

  return (
    <Modal open={!!item} onClose={onClose} sheet size="md" labelledBy="assignment-title" className="p-5">
      {item && (<>
            <div className="flex items-start justify-between gap-3">
              <h2 id="assignment-title" className="pt-1.5 text-xl font-semibold leading-snug">{item.label}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="ปิด"
                data-autofocus
                className="grid h-11 w-11 flex-none place-items-center rounded-full bg-surface text-gray-600 shadow-neu-sm transition-shadow active:shadow-neu-in-sm dark:text-gray-300"
              >
                <X size={20} />
              </button>
            </div>
            {item.score === null ? (
              <p className="mt-3 text-[17px]">
                <span className="font-medium">ยังไม่มีคะแนน</span>
                <span className={META}> · เต็ม {fmt(item.max)} คะแนน</span>
              </p>
            ) : (
              <p className="mt-3 tabular-nums">
                <span className="text-3xl font-semibold">{fmt(item.score)}</span>
                <span className={`ml-1 text-lg ${META}`}>/ {fmt(item.max)} คะแนน</span>
              </p>
            )}
            {due && <p className={`mt-2 text-[15px] ${due.urgent ? 'font-medium text-red-700 dark:text-red-400' : META}`}>{due.text}</p>}
            <p className={`mt-4 whitespace-pre-line text-[15px] leading-relaxed ${item.description ? '' : META}`}>
              {item.description || 'ครูไม่ได้ใส่รายละเอียดงานนี้'}
            </p>
      </>)}
    </Modal>
  );
}
