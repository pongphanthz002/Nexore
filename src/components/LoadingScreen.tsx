'use client';

import { motion, useReducedMotion } from 'framer-motion';

export default function LoadingScreen() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="no-scroll soft-light bg-surface flex items-center justify-center" role="status" aria-label="กำลังโหลด">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center"
      >
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-surface shadow-neu-lg">
          {/* eslint-disable-next-line @next/next/no-img-element -- static app icon, no optimisation needed */}
          <img src="/icon-192.png" alt="" className="h-14 w-14 rounded-2xl" />
        </div>
        <h1 className="text-3xl font-bold tracking-wide text-gray-900">NEXORE</h1>
        <div className="mt-6 h-1.5 w-40 overflow-hidden rounded-full shadow-neu-in-xs">
          {reduceMotion ? (
            <div className="h-full w-1/3 rounded-full bg-red-600 opacity-60" />
          ) : (
            <motion.div
              className="h-full w-1/3 rounded-full bg-red-600"
              animate={{ x: ['-100%', '300%'] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </div>
        <p className="mt-4 text-sm text-gray-500">กำลังโหลด…</p>
      </motion.div>
    </div>
  );
}
