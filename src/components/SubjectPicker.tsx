'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SubjectData } from '@/services/school-database.service';
import { useTheme } from '@/contexts/ThemeContext';
import {
  buildHueMap, dayDateLabel, entriesForDay, formatMinutes, hueVars, periodState, roomLabel, subjectGroups,
  type TimetableEntry, type TimetableTeacher,
} from '@/lib/timetable';

interface SubjectPickerProps {
  subjects: SubjectData[];
  teacher: TimetableTeacher | null;
  countStudents: (subject: SubjectData) => number;
  onSelect: (subject: SubjectData) => void;
}

const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

const join = (parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' · ');

/** Room button inside a coloured period or subject card; a plain label when the whole card is the button. */
function RoomChip({ subject, count, onSelect }: { subject: SubjectData; count: number; onSelect?: () => void }) {
  const body = (
    <>
      <span className="text-[15px] font-semibold tabular-nums text-[var(--st)]">{subject.classroom}</span>
      <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{count} คน</span>
    </>
  );
  const cls = 'flex items-baseline gap-1.5 rounded-xl bg-surface px-3 py-1.5 shadow-neu-sm';
  return onSelect ? (
    <button type="button" onClick={onSelect} className={`${cls} transition-shadow active:shadow-neu-in-sm`}>{body}</button>
  ) : (
    <span className={cls}>{body}</span>
  );
}

/**
 * Subject list of the teacher's grades and attendance pages: today's periods first (timetable
 * colours and states), then every subject once with its rooms as buttons.
 */
export default function SubjectPicker({ subjects, teacher, countStudents, onSelect }: SubjectPickerProps) {
  const { isDark } = useTheme();
  const [now, setNow] = useState(nowMinutes);
  useEffect(() => {
    const t = setInterval(() => setNow(nowMinutes()), 30000);
    return () => clearInterval(t);
  }, []);

  const today = new Date().getDay();
  const hues = useMemo(() => buildHueMap(subjects), [subjects]);
  const groups = useMemo(() => subjectGroups(subjects, hues), [subjects, hues]);
  const todayEntries = useMemo(() => {
    const teachers = new Map<string, TimetableTeacher>(teacher ? [[teacher.teacherId, teacher]] : []);
    return entriesForDay(subjects, today, 'teacher', teachers, hues);
  }, [subjects, teacher, today, hues]);

  const roomOf = (s: SubjectData) => s.room || teacher?.defaultRoom || '';

  return (
    <div className="space-y-8 text-gray-900 dark:text-gray-50">
      {todayEntries.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">วันนี้ · {dayDateLabel(today)}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {todayEntries.map(entry => (
              <TodayPeriod key={entry.key} entry={entry} state={periodState(entry, now)} isDark={isDark} countStudents={countStudents} onSelect={onSelect} />
            ))}
          </div>
        </section>
      )}

      <section>
        {todayEntries.length > 0 && (
          <h2 className="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">ทุกวิชา</h2>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups.map(group => {
            const single = group.rooms.length === 1 ? group.rooms[0] : null;
            const rooms = Array.from(new Set(group.rooms.map(roomOf).filter(Boolean)));
            const meta = join([
              group.subjectCode,
              group.rooms.some(r => r.subjectType === 'elective') && 'เพิ่มเติม',
              rooms.length > 0 && rooms.map(roomLabel).join(', '),
            ]);
            const content = (
              <>
                <span aria-hidden className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-[var(--sbar)]" />
                <div className="text-lg font-bold leading-tight">{group.subjectName}</div>
                {meta && <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{meta}</div>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {group.rooms.map(r => (
                    <RoomChip key={r.subjectId} subject={r} count={countStudents(r)} onSelect={single ? undefined : () => onSelect(r)} />
                  ))}
                </div>
              </>
            );
            const cls = 'relative block w-full rounded-2xl bg-surface p-4 pl-5 text-left shadow-neu';
            return single ? (
              <button key={group.key} type="button" style={hueVars(group.hue, isDark)} onClick={() => onSelect(single)}
                className={`${cls} transition-shadow active:shadow-neu-in-sm`}>
                {content}
              </button>
            ) : (
              <div key={group.key} style={hueVars(group.hue, isDark)} className={cls}>{content}</div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

interface TodayPeriodProps {
  entry: TimetableEntry;
  state: 'past' | 'current' | 'upcoming';
  isDark: boolean;
  countStudents: (subject: SubjectData) => number;
  onSelect: (subject: SubjectData) => void;
}

/** One of today's periods, drawn like the timetable block (the running one rises). */
function TodayPeriod({ entry, state, isDark, countStudents, onSelect }: TodayPeriodProps) {
  const single = entry.subjects.length === 1 ? entry.subjects[0] : null;
  const content = (
    <>
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-semibold tabular-nums text-[var(--sbig)]">
          {formatMinutes(entry.start)}–{formatMinutes(entry.end)}
        </span>
        {state === 'current' && (
          <span className="h-5 rounded-full bg-surface px-2 text-xs font-semibold leading-5 text-[var(--st)] shadow-neu-sm">กำลังสอน</span>
        )}
      </div>
      <div className="mt-0.5 font-semibold leading-tight text-[var(--st)]">{entry.subjectName}</div>
      <div className="text-xs text-[var(--smeta)]">{join([entry.subjectCode, entry.room && roomLabel(entry.room)])}</div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {entry.subjects.map(s => (
          <RoomChip key={s.subjectId} subject={s} count={countStudents(s)} onSelect={single ? undefined : () => onSelect(s)} />
        ))}
      </div>
    </>
  );
  const cls = `timetable-block block w-full rounded-2xl py-3 pl-4 pr-3 text-left ${state}`;
  return single ? (
    <button type="button" style={hueVars(entry.hue, isDark)} onClick={() => onSelect(single)} className={cls}>{content}</button>
  ) : (
    <div style={hueVars(entry.hue, isDark)} className={cls}>{content}</div>
  );
}
