'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Wifi, WifiOff } from 'lucide-react';

/**
 * App-wide connection notice (mounted once in the root layout): a raised pill above the dock
 * while the device is offline, then "back online" for a moment when it reconnects.
 */
export default function OfflineBanner() {
  const reduce = useReducedMotion();
  const [state, setState] = useState<'online' | 'offline' | 'back'>('online');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const goOffline = () => {
      clearTimeout(timer.current);
      setState('offline');
    };
    const goOnline = () => {
      setState(s => (s === 'offline' ? 'back' : s));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setState('online'), 2500);
    };
    if (!navigator.onLine) goOffline();
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  const offline = state === 'offline';

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] z-[90] flex justify-center px-4">
      <AnimatePresence mode="wait">
        {state !== 'online' && (
          <motion.div
            key={state}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="flex max-w-full items-center gap-2.5 rounded-full bg-surface py-2.5 pl-3.5 pr-4 text-sm font-medium text-gray-900 shadow-neu dark:text-gray-50"
          >
            {offline ? (
              <WifiOff size={18} className="flex-none text-amber-600 dark:text-amber-400" aria-hidden />
            ) : (
              <Wifi size={18} className="flex-none text-emerald-600 dark:text-emerald-400" aria-hidden />
            )}
            <span className="min-w-0">
              {offline ? 'ออฟไลน์ · แสดงข้อมูลที่โหลดไว้' : 'กลับมาออนไลน์แล้ว'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
