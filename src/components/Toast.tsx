'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

/**
 * Short app-wide notices in place of `alert()`: raised soft-UI pills at the top of the screen
 * (`<Toaster />` is mounted once in the root layout, above popups), gone after a few seconds or on tap.
 * They survive navigation, so a page may show one and route away at once.
 *
 *   toast.success('บันทึกแล้ว'); toast.error('บันทึกไม่สำเร็จ'); toast.warn('…'); toast('…');
 */

type Tone = 'success' | 'error' | 'warn' | 'info';

interface Item {
  id: number;
  tone: Tone;
  message: string;
}

const MAX_SHOWN = 3;
let nextId = 1;
let items: Item[] = [];
const listeners = new Set<(items: Item[]) => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  listeners.forEach(fn => fn(items));
}

function dismiss(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  items = items.filter(t => t.id !== id);
  emit();
}

function show(tone: Tone, message: string) {
  // The same notice twice in a row (e.g. a double tap) shows once, with a fresh timer
  const same = items.find(t => t.tone === tone && t.message === message);
  if (same) dismiss(same.id);
  const id = nextId++;
  items = [...items, { id, tone, message }].slice(-MAX_SHOWN);
  emit();
  // Problems stay longer than confirmations; long messages get time to be read
  const base = tone === 'success' ? 2800 : tone === 'info' ? 3500 : 6000;
  timers.set(id, setTimeout(() => dismiss(id), base + Math.min(message.length * 40, 4000)));
}

export const toast = Object.assign((message: string) => show('info', message), {
  success: (message: string) => show('success', message),
  error: (message: string) => show('error', message),
  warn: (message: string) => show('warn', message),
});

const ICONS = {
  success: <CheckCircle2 size={20} className="flex-none text-emerald-600 dark:text-emerald-400" aria-hidden />,
  error: <XCircle size={20} className="flex-none text-red-600 dark:text-red-400" aria-hidden />,
  warn: <AlertTriangle size={20} className="flex-none text-amber-600 dark:text-amber-400" aria-hidden />,
  info: <Info size={20} className="flex-none text-gray-500 dark:text-gray-400" aria-hidden />,
} satisfies Record<Tone, JSX.Element>;

export function Toaster() {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState<Item[]>([]);

  useEffect(() => {
    listeners.add(setShown);
    setShown(items);
    return () => { listeners.delete(setShown); };
  }, []);

  const enter = reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96 };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[120] flex flex-col items-center gap-2 px-4">
      <AnimatePresence initial={false}>
        {shown.map(t => (
          <motion.button
            key={t.id}
            type="button"
            layout={!reduce}
            role={t.tone === 'error' || t.tone === 'warn' ? 'alert' : 'status'}
            onClick={() => dismiss(t.id)}
            initial={enter}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={enter}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="pointer-events-auto flex w-fit max-w-[min(100%,28rem)] items-start gap-2.5 rounded-[20px] bg-surface py-3 pl-3.5 pr-4 text-left text-[15px] font-medium leading-snug text-gray-900 shadow-neu dark:text-gray-50"
          >
            {ICONS[t.tone]}
            <span className="min-w-0 break-words">{t.message}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
