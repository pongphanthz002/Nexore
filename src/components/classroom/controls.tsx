'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { useId } from 'react';

/** Small soft-UI controls shared by the classroom tools. */

export interface ToolPerson {
  studentId: string;
  name: string;
  number: string;
  classroom: string;
  photoURL?: string;
}

/** A raised knob in a sunk groove that springs between options. */
export function Segmented<T extends string>({ value, options, onChange, label, className = '' }: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const id = useId();
  return (
    <div role="tablist" aria-label={label} className={`relative grid gap-1 rounded-full p-1.5 shadow-neu-in-sm ${className}`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([key, text]) => {
        const on = value === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(key)}
            className={`relative h-10 rounded-full px-3 text-[15px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${
              on ? 'text-gray-900 dark:text-white' : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
            }`}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-surface shadow-neu-sm"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
            <span className="relative">{text}</span>
          </button>
        );
      })}
    </div>
  );
}

/** − n + in a sunk well. */
export function Stepper({ value, min, max, onChange, label, suffix }: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  suffix?: string;
}) {
  const btn = 'grid h-10 w-10 place-items-center rounded-full bg-surface text-gray-700 shadow-neu-sm transition-shadow active:shadow-neu-in-sm disabled:opacity-40 disabled:shadow-none dark:text-gray-200';
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1 rounded-full p-1 shadow-neu-in-sm">
      <button type="button" aria-label={`ลด${label}`} className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus size={18} />
      </button>
      <motion.span
        key={value}
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="min-w-[3.5rem] text-center text-lg font-bold tabular-nums"
        aria-live="polite"
      >
        {value}{suffix && <span className="ml-1 text-sm font-medium text-gray-500 dark:text-gray-400">{suffix}</span>}
      </motion.span>
      <button type="button" aria-label={`เพิ่ม${label}`} className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus size={18} />
      </button>
    </div>
  );
}

/** On/off switch: a raised knob sliding in a sunk track that turns red when on. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  const reduce = useReducedMotion();
  return (
    <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm font-medium text-gray-700 dark:text-gray-200">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 flex-none rounded-full shadow-neu-in-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${checked ? 'bg-red-500/90' : ''}`}
      >
        <motion.span
          className="absolute left-1 top-1 h-5 w-5 rounded-full bg-surface shadow-neu-sm"
          animate={{ x: checked ? 20 : 0 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 30 }}
        />
      </button>
      {label}
    </label>
  );
}

/** Capsule colours (Tailwind 300 steps), one per ball / group in turn. */
export const CANDY = ['#93c5fd', '#f9a8d4', '#86efac', '#fcd34d', '#c4b5fd', '#5eead4', '#fdba74', '#67e8f9'];
/** Matching strong colours for text and bars on the surface. */
export const CANDY_STRONG = ['#2563eb', '#db2777', '#16a34a', '#d97706', '#7c3aed', '#0d9488', '#ea580c', '#0891b2'];

/** "เลขที่ 7 · ม.2/1" */
export const personLine = (p: ToolPerson, showRoom: boolean) =>
  [p.number && `เลขที่ ${p.number}`, showRoom && p.classroom].filter(Boolean).join(' · ');
