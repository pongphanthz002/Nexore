'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

interface ThemeToggleProps {
  isDark: boolean;
  toggle: () => void;
}

/**
 * Light/dark switch in the soft UI: a sunk groove with a raised knob that carries the sun (light)
 * or the moon (dark). The groove shows sunk cloud puffs by day and faint stars by night.
 */

const TRACK_W = 76;
const KNOB = 32;
const PAD = 4;
const TRAVEL = TRACK_W - KNOB - PAD * 2;

// Sunk puffs on the right of the groove while the sun is out
const CLOUDS = [
  { l: 42, t: 19, s: 9 },
  { l: 49, t: 14, s: 13 },
  { l: 59, t: 18, s: 10 },
];

// Faint stars on the left of the groove while the moon is out
const STARS = [
  { l: 10, t: 9, s: 6 },
  { l: 22, t: 21, s: 5 },
  { l: 9, t: 25, s: 4 },
];

function Sun() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      <g stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round">
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return <line key={i} x1={12 + Math.cos(a) * 8} y1={12 + Math.sin(a) * 8} x2={12 + Math.cos(a) * 10.2} y2={12 + Math.sin(a) * 10.2} />;
        })}
      </g>
      <circle cx="12" cy="12" r="5.2" fill="#fbbf24" />
    </svg>
  );
}

function Moon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      <circle cx="12" cy="12" r="8" fill="#e7e5e4" />
      <g fill="#a8a29e" opacity="0.6">
        <circle cx="9" cy="9.5" r="1.6" />
        <circle cx="14.5" cy="14" r="2.2" />
        <circle cx="14.8" cy="8.2" r="1" />
      </g>
    </svg>
  );
}

const ThemeToggle = ({ isDark, toggle }: ThemeToggleProps) => {
  const reduce = useReducedMotion();
  const swap = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, rotate: -90, scale: 0.5 }, animate: { opacity: 1, rotate: 0, scale: 1 }, exit: { opacity: 0, rotate: 90, scale: 0.5 } };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="โหมดมืด"
      onClick={toggle}
      className="relative h-10 flex-none select-none rounded-full bg-surface shadow-neu-in-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
      style={{ width: TRACK_W }}
    >
      {CLOUDS.map((c, i) => (
        <motion.span
          key={`c${i}`}
          aria-hidden
          className="absolute rounded-full shadow-neu-in-xs"
          style={{ left: c.l, top: c.t, width: c.s, height: c.s }}
          animate={{ opacity: isDark ? 0 : 1, y: isDark || reduce ? 0 : [0, -1, 0] }}
          transition={{ opacity: { duration: 0.3 }, y: { repeat: Infinity, duration: 3 + i, ease: 'easeInOut' } }}
        />
      ))}
      {STARS.map((s, i) => (
        <motion.span
          key={`s${i}`}
          aria-hidden
          className="absolute bg-gray-400 dark:bg-gray-300"
          style={{
            left: s.l, top: s.t, width: s.s, height: s.s,
            clipPath: 'polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)',
          }}
          animate={{ opacity: !isDark ? 0 : reduce ? 0.8 : [0.45, 0.9, 0.45] }}
          transition={isDark && !reduce ? { repeat: Infinity, duration: 2 + i } : { duration: 0.3 }}
        />
      ))}
      <motion.span
        aria-hidden
        className="absolute grid place-items-center rounded-full bg-surface shadow-neu-sm"
        style={{ top: PAD, left: PAD, width: KNOB, height: KNOB }}
        initial={false}
        animate={{ x: isDark ? TRAVEL : 0 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
      >
        <AnimatePresence initial={false} mode="wait">
          <motion.span key={isDark ? 'moon' : 'sun'} className="grid place-items-center" transition={{ duration: 0.2 }} {...swap}>
            {isDark ? <Moon /> : <Sun />}
          </motion.span>
        </AnimatePresence>
      </motion.span>
    </button>
  );
};

export default ThemeToggle;
