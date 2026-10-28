'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import type { AttendanceRecord } from '@/services/teacher-database.service';

type Status = AttendanceRecord['status'];

/** Status colours, shared with the row tint on the attendance page. */
export const ATTENDANCE_STATUSES: { value: Exclude<Status, ''>; chip: string; dot: string }[] = [
  { value: 'มา', chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200', dot: 'bg-emerald-500' },
  { value: 'ขาด', chip: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200', dot: 'bg-red-500' },
  { value: 'สาย', chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200', dot: 'bg-amber-500' },
  { value: 'ลาป่วย', chip: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200', dot: 'bg-sky-500' },
  { value: 'ลากิจ', chip: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/50 dark:text-fuchsia-200', dot: 'bg-fuchsia-500' },
  { value: 'กิจกรรม', chip: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200', dot: 'bg-teal-500' },
  { value: 'หนี', chip: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200', dot: 'bg-orange-500' },
];

const EMPTY_CHIP = 'bg-surface text-gray-600 dark:text-gray-300';

interface AttendanceStatusSelectProps {
  value: Status;
  onChange: (status: Status) => void;
  /** Student name, for the accessible label. */
  label: string;
}

/** Coloured status dropdown for one student's attendance row. */
export default function AttendanceStatusSelect({ value, onChange, label }: AttendanceStatusSelectProps) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = ATTENDANCE_STATUSES.find(s => s.value === value);

  const openList = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    setUp(!!rect && window.innerHeight - rect.bottom < 340 && rect.top > 340);
    setActive(Math.max(0, ATTENDANCE_STATUSES.findIndex(s => s.value === value)));
    setOpen(true);
  };
  const choose = (status: Status) => {
    onChange(status);
    setOpen(false);
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % ATTENDANCE_STATUSES.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + ATTENDANCE_STATUSES.length) % ATTENDANCE_STATUSES.length); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(ATTENDANCE_STATUSES[active].value); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative flex-none" onKeyDown={onKeyDown}>
      <motion.button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`สถานะของ ${label}: ${value || 'ยังไม่เลือก'}`}
        whileTap={reduce ? undefined : { scale: 0.94 }}
        className={`flex h-10 min-w-[104px] items-center justify-between gap-1.5 rounded-full pl-3.5 pr-2.5 text-sm font-semibold transition-[color,background-color,box-shadow] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${open ? 'shadow-neu-in-sm' : 'shadow-neu-sm'} ${current?.chip ?? EMPTY_CHIP}`}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value || 'empty'}
            initial={reduce ? false : { opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: -6, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            className="flex items-center gap-1.5"
          >
            {current && <span className={`h-2 w-2 rounded-full ${current.dot}`} />}
            {value || 'เลือก'}
          </motion.span>
        </AnimatePresence>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="flex">
          <ChevronDown size={16} />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.ul
            id={listId}
            role="listbox"
            aria-label={`สถานะของ ${label}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: up ? 6 : -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: up ? 6 : -6 }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
            style={{ transformOrigin: up ? 'bottom right' : 'top right' }}
            className={`absolute right-0 z-30 w-44 rounded-2xl bg-surface p-1.5 shadow-neu-lg ${up ? 'bottom-full mb-2' : 'top-full mt-2'}`}
          >
            {ATTENDANCE_STATUSES.map((s, i) => (
              <motion.li
                key={s.value}
                role="option"
                aria-selected={s.value === value}
                initial={reduce ? false : { opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.02, duration: 0.18 }}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(s.value)}
                className={`flex h-11 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-gray-900 dark:text-gray-50 ${i === active ? 'shadow-neu-in-sm' : ''}`}
              >
                <span className={`h-2.5 w-2.5 flex-none rounded-full ${s.dot}`} />
                <span className="flex-1">{s.value}</span>
                {s.value === value && <Check size={16} className="text-gray-500 dark:text-gray-400" />}
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
