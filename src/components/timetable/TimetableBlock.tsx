'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { formatMinutes, hueVars, roomLabel, TimetableEntry, TimetableRole } from '@/lib/timetable';

/** Today: past / current / upcoming. Any other day of the week: other (drawn quieter, so today stands out). */
export type BlockState = 'past' | 'current' | 'upcoming' | 'other';

/** Big line of a block: the rooms for a teacher, the time for a student. */
function TimeRange({ entry }: { entry: TimetableEntry }) {
  return (
    <>
      <span className="whitespace-nowrap">{formatMinutes(entry.start)}–</span>
      <wbr />
      <span className="whitespace-nowrap">{formatMinutes(entry.end)}</span>
    </>
  );
}

interface CardBlockProps {
  entry: TimetableEntry;
  role: TimetableRole;
  state: BlockState;
  isDark: boolean;
  top: number;
  height: number;
  index: number;
}

/** Block in the home card's vertical timeline (height = period length). */
export function CardBlock({ entry, role, state, isDark, top, height, index }: CardBlockProps) {
  const reduce = useReducedMotion();
  const teacher = role === 'teacher';
  const meta = teacher
    ? [entry.subjectCode, entry.room && roomLabel(entry.room), `${formatMinutes(entry.start)}–${formatMinutes(entry.end)}`]
    : [entry.subjectCode, entry.teacherName, entry.room && roomLabel(entry.room)];
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.2, 0.8, 0.2, 1], delay: index * 0.045 }}
      style={{ ...hueVars(entry.hue, isDark), top, height }}
      className={`timetable-block absolute inset-x-0 z-[1] overflow-hidden rounded-xl py-1.5 pl-3.5 pr-3 ${state}`}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 text-sm font-semibold leading-tight text-[var(--st)]">{entry.subjectName}</span>
        {state === 'current' && (
          <span className="h-5 flex-none rounded-full bg-white px-2 text-xs font-semibold leading-5 text-[var(--st)] dark:bg-gray-800">
            {teacher ? 'กำลังสอน' : 'กำลังเรียน'}
          </span>
        )}
      </div>
      <div className="text-[17px] font-semibold leading-tight tabular-nums text-[var(--sbig)]">
        {teacher ? entry.classrooms.join(' · ') : <TimeRange entry={entry} />}
      </div>
      <div className="text-xs leading-snug tabular-nums text-[var(--smeta)]">{meta.filter(Boolean).join(' · ')}</div>
    </motion.div>
  );
}

interface TallBlockProps {
  entry: TimetableEntry;
  role: TimetableRole;
  state: BlockState;
  isDark: boolean;
  left: string;
  width: string;
  large: boolean;
  /** Teacher: the period is running and not yet checked. */
  onCheck?: () => void;
}

/** Block in the full-screen day view (width = period length). */
export function TallBlock({ entry, role, state, isDark, left, width, large, onCheck }: TallBlockProps) {
  const teacher = role === 'teacher';
  const meta = teacher
    ? [entry.subjectCode, entry.room && roomLabel(entry.room)]
    : [entry.subjectCode, entry.teacherName, entry.room && roomLabel(entry.room)];
  return (
    <div
      style={{ ...hueVars(entry.hue, isDark), left, width }}
      className={`timetable-block absolute bottom-0 top-7 z-[1] flex flex-col gap-0.5 overflow-hidden break-words rounded-[14px] ${
        large ? 'gap-1 py-4 pl-[18px] pr-3' : 'py-2.5 pl-2 pr-[3px]'
      } ${state}`}
    >
      <div className={`font-semibold leading-tight text-[var(--st)] ${large ? 'text-[17px]' : 'text-xs tracking-tight'}`}>{entry.subjectName}</div>
      <div className={`font-semibold tabular-nums text-[var(--sbig)] ${large ? 'text-[28px] leading-tight' : 'text-lg leading-tight'}`}>
        {teacher
          ? entry.classrooms.map((c, i) => <div key={c + i}>{c}</div>)
          : <TimeRange entry={entry} />}
      </div>
      <div className="flex-1" />
      <div className={`leading-snug tabular-nums text-[var(--smeta)] ${large ? 'text-sm' : 'text-[11px]'}`}>
        {meta.filter(Boolean).map((line, i) => <div key={i}>{line}</div>)}
        {teacher && <div><TimeRange entry={entry} /></div>}
      </div>
      {onCheck && (
        <button
          type="button"
          onClick={onCheck}
          aria-label={`เช็คชื่อ ${entry.subjectName} ${entry.classrooms.join(', ')}`}
          className="mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-[10px] bg-gray-900 px-1 text-[13px] font-semibold text-white transition-transform active:scale-95 dark:bg-gray-50 dark:text-gray-900"
        >
          <Check size={16} className="flex-none" />
          {large ? 'เช็คชื่อ' : 'เช็ค'}
        </button>
      )}
    </div>
  );
}
