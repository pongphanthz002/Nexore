'use client';

import { motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, useRef } from 'react';

interface ThemeToggleProps {
  isDark: boolean;
  toggle: () => void;
}

const ThemeToggle = ({ isDark, toggle }: ThemeToggleProps) => {
  const containerWidth = 90;
  const orbSize = 30;
  const padding = 5;
  const travelDist = containerWidth - orbSize - (padding * 2);
  const x = useMotionValue(isDark ? travelDist : 0);
  const dragged = useRef(false);
  const background = useTransform(x, [0, travelDist], ['#2071b5', '#2a2a2a']);
  const glowX = useTransform(x, (val) => val - 35);

  useEffect(() => {
    x.set(isDark ? travelDist : 0);
  }, [isDark, travelDist, x]);

  const CloudGroup = () => (
    <div className="relative flex items-end h-full min-w-[500px] px-2">
      <div className="w-4 h-4 bg-white/90 rounded-full shrink-0 shadow-sm mb-[-7px]" />
      <div className="w-2 h-2 bg-white/70 rounded-full shrink-0 shadow-sm mb-[-4px] -ml-1" />
      <div className="w-7 h-7 bg-white rounded-full shrink-0 shadow-sm mb-[-8px] -ml-2" />
      <div className="w-2 h-2 bg-white/70 rounded-full shrink-0 shadow-sm mb-[-4px] -ml-1" />
      <div className="w-2 h-2 bg-white/70 rounded-full shrink-0 shadow-sm mb-[-4px] -ml-1" />
      <div className="w-4 h-4 bg-white/90 rounded-full shrink-0 shadow-sm mb-[-7px] -ml-1" />
      <div className="w-[80px] shrink-0" />
      <div className="w-2 h-2 bg-white/70 rounded-full shrink-0 shadow-sm mb-[-4px]" />
      <div className="w-7 h-7 bg-white rounded-full shrink-0 shadow-sm mb-[-8px] -ml-2" />
      <div className="w-4 h-4 bg-white/90 rounded-full shrink-0 shadow-sm mb-[-7px] -ml-1" />
      <div className="w-4 h-4 bg-white/90 rounded-full shrink-0 shadow-sm mb-[-7px] -ml-1" />
      <div className="w-2 h-2 bg-white/70 rounded-full shrink-0 shadow-sm mb-[-4px] -ml-1" />
      <div className="w-7 h-7 bg-white rounded-full shrink-0 shadow-sm mb-[-8px] -ml-2" />
      <div className="w-4 h-4 bg-white/90 rounded-full shrink-0 shadow-sm mb-[-7px] -ml-1" />
      <div className="w-2 h-2 bg-white/70 rounded-full shrink-0 shadow-sm mb-[-4px] -ml-1" />
      <div className="w-4 h-4 bg-white/90 rounded-full shrink-0 shadow-sm mb-[-7px] -ml-1" />
    </div>
  );

  return (
    // Sky-and-sun / night-and-moon switch, set into the soft-UI surface (sunk groove, raised orb)
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="โหมดมืด"
      onClick={() => toggle()}
      className="relative block w-[90px] h-[40px] flex-none select-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      <motion.span
        style={{ backgroundColor: background }}
        className="relative block w-full h-full rounded-full cursor-pointer overflow-hidden"
      >
        <motion.div
          style={{ x: glowX }}
          className="absolute top-[-30px] left-0 pointer-events-none z-0"
        >
          <div className="relative w-[100px] h-[100px] flex items-center justify-center">
            <div className="absolute w-[140px] h-[140px] rounded-full bg-white/5 blur-sm" />
            <div className="absolute w-[100px] h-[100px] rounded-full bg-white/10 blur-sm" />
            <div className="absolute w-[70px] h-[70px] rounded-full bg-white/15 blur-sm" />
          </div>
        </motion.div>
        <div className="absolute inset-0 pointer-events-none z-10">
          {[
            { t: 8, l: 20, s: 6 },
            { t: 24, l: 10, s: 5 },
            { t: 28, l: 35, s: 8 }
          ].map((star, i) => (
            <motion.div
              key={i}
              animate={{ opacity: isDark ? 1 : 0, scale: isDark ? [1, 1.2, 1] : 0 }}
              transition={{ repeat: Infinity, duration: 2 + i }}
              className="absolute bg-white rounded-full blur-[1px]"
              style={{
                top: star.t,
                left: star.l,
                width: star.s,
                height: star.s,
                clipPath: 'polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%)'
              }}
            />
          ))}
        </div>
        <motion.div
          animate={{ y: isDark ? 40 : 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0 pointer-events-none z-20 flex items-end pl-[90px]"
        >
          <motion.div
            animate={!isDark ? { x: [0, -590] } : {}}
            transition={{ repeat: Infinity, duration: 200, ease: "linear" }}
            className="flex items-end h-full"
          >
            <CloudGroup />
          </motion.div>
        </motion.div>
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: travelDist }}
          dragElastic={0}
          dragMomentum={false}
          onClick={e => { if (dragged.current) { e.stopPropagation(); dragged.current = false; } }}
          onDragStart={() => { dragged.current = true; }}
          onDragEnd={(_, info) => {
            if (info.offset.x > 20 && !isDark) toggle();
            else if (info.offset.x < -20 && isDark) toggle();
            x.set(isDark ? travelDist : 0);
          }}
          style={{ x }}
          animate={{ backgroundColor: isDark ? '#c4c9d1' : '#ffd600' }}
          className="absolute top-[5px] left-[5px] w-[30px] h-[30px] rounded-full z-30 cursor-grab active:cursor-grabbing shadow-[2px_2px_4px_rgba(0,0,0,0.3),inset_1px_1px_2px_rgba(255,255,255,0.5)] flex items-center justify-center overflow-hidden"
        >
          {isDark && (
            <div className="relative w-full h-full opacity-60">
              <div className="absolute top-1.5 left-1.5 w-1.5 h-1.5 bg-stone-500 rounded-full" />
              <div className="absolute top-4 left-4 w-2.5 h-2.5 bg-stone-500 rounded-full" />
              <div className="absolute top-2.5 left-5 w-1 h-1 bg-stone-500 rounded-full" />
            </div>
          )}
        </motion.div>
        {/* Sunk rim drawn over the sky, clouds and stars so they sit inside the groove */}
        <span aria-hidden className="pointer-events-none absolute inset-0 z-[25] rounded-full shadow-[inset_3px_3px_7px_rgb(0_0_0/0.45),inset_-2px_-2px_5px_rgb(255_255_255/0.22)]" />
      </motion.span>
    </button>
  );
};

export default ThemeToggle;
