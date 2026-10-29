'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, Coffee, Maximize2 } from 'lucide-react';
import { CardBlock, BlockState } from './TimetableBlock';
import {
  formatMinutes, hueVars, periodCount, rangeTicks, THAI_DAYS, TimetableEntry, TimetableRole,
} from '@/lib/timetable';

/** px per minute in the home card's vertical timeline */
const PX_PER_MIN = 1.4;
/** School lunch break, labelled in the card when no period overlaps it */
const LUNCH = { start: 11 * 60 + 50, end: 12 * 60 + 40 };

export const blockState = (entry: TimetableEntry, isToday: boolean, now: number): BlockState =>
  !isToday ? 'other' : now >= entry.end ? 'past' : now >= entry.start ? 'current' : 'upcoming';

interface TimetableCardProps {
  role: TimetableRole;
  entries: TimetableEntry[];
  range: { from: number; to: number };
  now: number;
  dateLabel: string;
  /** First period after today, for the empty state. */
  next: TimetableEntry | null;
  isDark: boolean;
  onOpen: () => void;
}

/** Today's whole timetable on the home page; tapping it opens the full-screen week view. */
export function TimetableCard({ role, entries, range, now, dateLabel, next, isDark, onOpen }: TimetableCardProps) {
  const reduce = useReducedMotion();
  const title = role === 'teacher' ? 'ตารางสอนวันนี้' : 'ตารางเรียนวันนี้';
  const y = (m: number) => (m - range.from) * PX_PER_MIN;
  const lunchFree = !entries.some(e => e.start < LUNCH.end && e.end > LUNCH.start) && range.from <= LUNCH.start && range.to >= LUNCH.end;

  return (
    <motion.section
      role="button"
      tabIndex={0}
      aria-label={`${title} ${dateLabel} แตะเพื่อดูทั้งสัปดาห์แบบเต็มจอ`}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.2, 0.8, 0.2, 1] }}
      whileTap={reduce ? undefined : { scale: 0.992 }}
      className="w-full cursor-pointer rounded-[24px] bg-surface p-4 pb-5 text-gray-900 shadow-neu-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-50"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold leading-snug">{title}</h2>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
            {dateLabel}{entries.length > 0 && ` · ${periodCount(entries)} คาบ`}
          </p>
        </div>
        {entries.length > 0 && (
          <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-full bg-surface shadow-neu-sm">
            <Maximize2 size={20} />
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-start gap-1.5 pb-1 pt-2">
          <span className="mb-1.5 grid h-12 w-12 place-items-center rounded-full shadow-neu-in-sm"><Coffee size={22} /></span>
          <h3 className="text-[17px] font-semibold">วันนี้ไม่มีคาบ</h3>
          {next && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              คาบถัดไป {THAI_DAYS[next.day]} {formatMinutes(next.start)} · {next.subjectName}
              {role === 'teacher' ? ` ${next.classrooms.join(', ')}` : ''}
            </p>
          )}
          <span className="mt-2 inline-flex h-10 items-center gap-1 rounded-full bg-surface pl-4 pr-3 text-sm font-semibold shadow-neu-sm">
            ดูตารางทั้งสัปดาห์ <ChevronRight size={16} />
          </span>
        </div>
      ) : (
        <div className="relative ml-12" style={{ height: y(range.to) }}>
          {rangeTicks(range.from, range.to).map(m => (
            <div key={m}>
              <div className="absolute inset-x-0 h-px bg-gray-300/70 dark:bg-white/10" style={{ top: y(m) }} />
              <div className="absolute -left-12 w-10 -translate-y-1/2 text-right text-xs leading-none tabular-nums text-gray-500 dark:text-gray-400" style={{ top: y(m) }}>
                {formatMinutes(m)}
              </div>
            </div>
          ))}
          {lunchFree && (
            <div className="absolute inset-x-0 grid place-items-center text-xs text-gray-500 dark:text-gray-400" style={{ top: y(LUNCH.start), height: (LUNCH.end - LUNCH.start) * PX_PER_MIN }}>
              พักกลางวัน
            </div>
          )}
          {entries.map((e, i) => (
            <CardBlock
              key={e.key}
              entry={e}
              role={role}
              state={blockState(e, true, now)}
              isDark={isDark}
              top={y(e.start)}
              height={(e.end - e.start) * PX_PER_MIN - 3}
              index={i + 1}
            />
          ))}
          {now >= range.from && now <= range.to && (
            <div className="pointer-events-none absolute -left-[52px] right-0 z-0 h-0" style={{ top: y(now) }}>
              <div className="absolute left-12 right-0 -top-px h-0.5 bg-red-500 dark:bg-red-400" />
              <span className="absolute -top-2.5 left-0 h-5 rounded-full bg-red-500 px-1.5 text-[11px] font-semibold leading-5 tabular-nums text-white dark:bg-red-400">
                {formatMinutes(now)}
              </span>
            </div>
          )}
        </div>
      )}
    </motion.section>
  );
}

interface AttendanceBarProps {
  entry: TimetableEntry;
  now: number;
  isDark: boolean;
  onOpen: () => void;
}

/** Teacher only: shown from period start to end until every room of the period is checked. */
export function AttendanceBar({ entry, now, isDark, onOpen }: AttendanceBarProps) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={reduce ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      style={hueVars(entry.hue, isDark)}
      className="flex w-full items-center gap-3 rounded-[18px] bg-gray-900 py-3 pl-4 pr-3 text-left text-white shadow-neu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-gray-50 dark:text-gray-900"
    >
      <span className="h-3 w-3 flex-none rounded-full bg-[var(--sbar)]" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs opacity-75">ถึงเวลาเช็คชื่อ · เหลือ {entry.end - now} นาที</span>
        <span className="block text-[17px] font-semibold leading-snug">
          เช็ค {entry.subjectName} {entry.classrooms.join(', ')}
        </span>
      </span>
      <ChevronRight size={20} className="flex-none" />
    </motion.button>
  );
}
