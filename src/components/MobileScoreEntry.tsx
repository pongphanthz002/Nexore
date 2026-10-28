'use client';

import { useMemo, useRef, useState } from 'react';
import type { StudentData } from '@/services/school-database.service';
import type { Assignment, AssignmentGroup, GradeConfig, StudentScore } from '@/services/teacher-database.service';
import { assignmentField, buildColumns, fieldMax, getFieldValue, type ScoreField } from '@/lib/grade-calculation';
import { formatScore, parseScore, type CellEdit } from '@/components/ScoreGrid';

interface MobileScoreEntryProps {
  isDark: boolean;
  students: StudentData[];
  assignments: Assignment[];
  groups: AssignmentGroup[];
  scores: Map<string, StudentScore>;
  config: GradeConfig;
  invalid: Map<string, string>;
  onEdit: (edits: CellEdit[]) => void;
  onInvalid: (entries: Array<{ key: string; text: string | null }>) => void;
}

/**
 * Phone layout for edit mode: choose one assignment (or exam), then type each student's
 * score in a large field. "Next" on the keypad moves to the next student. Saves through
 * the same path as the desktop grid.
 */
export default function MobileScoreEntry({ isDark, students, assignments, groups, scores, config, invalid, onEdit, onInvalid }: MobileScoreEntryProps) {
  const options = useMemo(() => {
    const list: Array<{ field: ScoreField; label: string }> = [];
    for (const c of buildColumns(assignments, groups)) {
      if (c.kind !== 'assignment') continue;
      list.push({ field: assignmentField(c.assignment.id), label: c.group ? `${c.group.name} · ${c.assignment.title}` : c.assignment.title });
    }
    list.push({ field: 'midterm', label: 'สอบกลางภาค' });
    list.push({ field: 'final', label: 'สอบปลายภาค' });
    return list;
  }, [assignments, groups]);

  const [field, setField] = useState<ScoreField>(options[0]?.field ?? 'midterm');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const max = fieldMax(field, assignments, config);
  const filled = students.filter(s => getFieldValue(scores.get(s.studentId), field) !== undefined).length;

  const shownText = (studentId: string) => {
    const key = `${studentId}|${field}`;
    if (drafts[key] !== undefined) return drafts[key];
    if (invalid.has(key)) return invalid.get(key)!;
    return formatScore(getFieldValue(scores.get(studentId), field));
  };

  const commit = (studentId: string) => {
    const key = `${studentId}|${field}`;
    const text = drafts[key];
    if (text === undefined) return;
    setDrafts(d => { const next = { ...d }; delete next[key]; return next; });
    if (text === formatScore(getFieldValue(scores.get(studentId), field)) && !invalid.has(key)) return;
    const parsed = parseScore(text);
    if (!parsed.ok || (parsed.value !== null && (parsed.value < 0 || parsed.value > max))) {
      onInvalid([{ key, text }]);
      return;
    }
    if (invalid.has(key)) onInvalid([{ key, text: null }]);
    onEdit([{ studentId, field, value: parsed.value }]);
  };

  const surface = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';

  return (
    <div className="space-y-3">
      <div className={`sticky top-0 z-10 p-3 rounded-2xl border ${surface}`}>
        <select
          value={field}
          onChange={e => setField(e.target.value as ScoreField)}
          className={`w-full h-12 px-3 rounded-xl border text-base font-bold ${isDark ? 'bg-gray-900 border-gray-700 text-white' : 'bg-gray-50 border-gray-200'}`}
        >
          {options.map(o => <option key={o.field} value={o.field}>{o.label}</option>)}
        </select>
        <div className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          เต็ม {formatScore(max)} · กรอกแล้ว {filled}/{students.length} คน
        </div>
      </div>

      {students.map((s, i) => {
        const key = `${s.studentId}|${field}`;
        const bad = invalid.has(key);
        return (
          <div key={s.studentId} className={`flex items-center gap-3 p-3 rounded-2xl border ${bad ? 'border-red-400 bg-red-50 dark:bg-red-950/40' : surface}`}>
            <span className={`w-8 text-center text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{s.number || '-'}</span>
            <span className="flex-1 min-w-0 truncate font-semibold">{s.name}</span>
            <input
              ref={el => { inputs.current[i] = el; }}
              inputMode="decimal"
              enterKeyHint={i < students.length - 1 ? 'next' : 'done'}
              value={shownText(s.studentId)}
              onChange={e => setDrafts(d => ({ ...d, [key]: e.target.value }))}
              onFocus={e => e.target.select()}
              onBlur={() => commit(s.studentId)}
              onKeyDown={e => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const next = inputs.current[i + 1];
                if (next) next.focus(); else (e.target as HTMLInputElement).blur();
              }}
              className={`w-20 h-12 text-center text-lg font-bold rounded-xl border ${bad ? 'border-red-500 text-red-600' : isDark ? 'bg-gray-900 border-gray-600 text-white' : 'bg-gray-50 border-gray-200'} focus:outline-none focus:ring-2 focus:ring-blue-500/30`}
            />
          </div>
        );
      })}
    </div>
  );
}
