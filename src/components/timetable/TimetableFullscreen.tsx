'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { TallBlock } from './TimetableBlock';
import { blockState } from './TimetableCard';
import {
  dayDateLabel, formatMinutes, periodCount, rangeTicks, THAI_DAYS, THAI_DAYS_SHORT, TimetableEntry, TimetableRole,
} from '@/lib/timetable';

interface TimetableFullscreenProps {
  role: TimetableRole;
  week: Map<number, TimetableEntry[]>;
  days: number[];
  today: number;
  now: number;
  range: { from: number; to: number };
  isDark: boolean;
  /** Teacher: period of today that is running and not checked yet. */
  due: TimetableEntry | null;
  onCheck: (entry: TimetableEntry) => void;
  onClose: () => void;
}

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/**
 * One day per page, time running left to right. A phone held upright (< 768px wide) shows it
 * turned on its side; iPad and PC show it full screen as is. Always opens on today.
 */
export function TimetableFullscreen({ role, week, days, today, now, range, isDark, due, onCheck, onClose }: TimetableFullscreenProps) {
  const reduce = useReducedMotion();
  const { w, h } = useViewport();
  const rotated = w < 768 && h > w;
  const W = rotated ? h : w;
  const H = rotated ? w : h;
  const large = W >= 1000;
  const [arrows] = useState(() => window.matchMedia('(pointer: fine)').matches);
  const [index, setIndex] = useState(() => Math.max(0, days.indexOf(today)));
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; t: number; dx: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const go = useCallback((i: number) => setIndex(Math.max(0, Math.min(days.length - 1, i))), [days.length]);

  // Lock page scroll; on phones also ask for real full screen so the status bar hides (best effort)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (rotated && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    return () => {
      document.body.style.overflow = prev;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index, onClose]);

  // Swipe between days. In the rotated view the day axis runs along the screen's vertical axis.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button > 0) return;
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = rotated ? e.clientY - d.y : e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 8) return;
    d.moved = true;
    d.dx = dx;
    const atEdge = (index === 0 && dx > 0) || (index === days.length - 1 && dx < 0);
    const track = trackRef.current;
    if (track) {
      track.style.transition = 'none';
      track.style.transform = `translateX(calc(${-index * 100}% + ${atEdge ? dx / 3 : dx}px))`;
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    suppressClick.current = true;
    const velocity = Math.abs(d.dx) / (performance.now() - d.t);
    const swiped = Math.abs(d.dx) > W * 0.18 || velocity > 0.5;
    const next = Math.max(0, Math.min(days.length - 1, index + (swiped ? (d.dx < 0 ? 1 : -1) : 0)));
    // The drag wrote the transform directly; settle it on the target day, then let React own it again
    const track = trackRef.current;
    if (track) { track.style.transition = ''; track.style.transform = `translateX(${-next * 100}%)`; }
    setIndex(next);
  };

  const day = days[index];
  const list = week.get(day) ?? [];
  const span = range.to - range.from;
  const pct = (m: number) => `${(((m - range.from) / span) * 100).toFixed(3)}%`;

  const content = (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={role === 'teacher' ? 'ตารางสอนทั้งสัปดาห์' : 'ตารางเรียนทั้งสัปดาห์'}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
      className={`fixed inset-0 z-[60] overflow-hidden bg-surface text-gray-900 dark:text-gray-50 ${isDark ? 'dark' : ''}`}
    >
      <div
        className="absolute left-0 top-0 flex flex-col"
        style={{
          width: W,
          height: H,
          ...(rotated ? { transformOrigin: '0 0', transform: 'rotate(90deg) translateY(-100%)' } : {}),
          paddingLeft: rotated ? 'env(safe-area-inset-top, 0px)' : 'env(safe-area-inset-left, 0px)',
          paddingRight: rotated ? 'env(safe-area-inset-bottom, 0px)' : 'env(safe-area-inset-right, 0px)',
        }}
      >
        <div className="flex flex-none items-center gap-3 px-3 pb-1 pt-2" style={rotated ? undefined : { paddingTop: 'max(8px, env(safe-area-inset-top, 0px))' }}>
          <button type="button" onClick={onClose} aria-label="ปิดตาราง" className="grid h-11 w-11 flex-none place-items-center rounded-full bg-surface shadow-neu-sm transition-shadow active:shadow-neu-in-sm">
            <X size={20} />
          </button>
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-2">
            <b className="text-[17px] font-semibold">{dayDateLabel(day)}</b>
            {day === today ? (
              <span className="self-center rounded-full bg-red-600 px-2 text-xs font-semibold leading-[22px] text-white shadow-neu-sm dark:bg-red-500">
                วันนี้
              </span>
            ) : days.includes(today) && (
              <button
                type="button"
                onClick={() => go(days.indexOf(today))}
                className="self-center rounded-full bg-surface px-2.5 text-xs font-semibold leading-[26px] text-red-700 shadow-neu-sm transition-shadow active:shadow-neu-in-sm dark:text-red-300"
              >
                กลับไปวันนี้
              </button>
            )}
            <small className="text-xs text-gray-600 dark:text-gray-400">
              {role === 'teacher' ? 'ตารางสอน' : 'ตารางเรียน'} · {list.length ? `${periodCount(list)} คาบ` : 'ไม่มีคาบ'}
            </small>
          </div>
          {arrows && (
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="วันก่อนหน้า" className="grid h-10 w-10 place-items-center rounded-full bg-surface shadow-neu-sm active:shadow-neu-in-sm disabled:opacity-35 disabled:shadow-none">
              <ChevronLeft size={20} />
            </button>
          )}
          <div role="group" aria-label="เลือกวัน" className="flex items-center gap-1 rounded-full p-1 shadow-neu-in-sm">
            {days.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => go(i)}
                aria-current={i === index}
                aria-label={`${THAI_DAYS[d]}${d === today ? ' (วันนี้)' : ''}`}
                className={`h-9 min-w-9 rounded-full px-1.5 text-[13px] font-semibold transition-colors ${
                  d === today
                    ? i === index
                      ? 'bg-red-600 text-white shadow-neu-sm dark:bg-red-500'
                      : 'text-red-700 shadow-[inset_0_0_0_1.5px_currentColor] dark:text-red-400'
                    : i === index
                      ? 'bg-surface text-gray-900 shadow-neu-sm dark:text-gray-50'
                      : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                {THAI_DAYS_SHORT[d]}
              </button>
            ))}
          </div>
          {arrows && (
            <button type="button" onClick={() => go(index + 1)} disabled={index === days.length - 1} aria-label="วันถัดไป" className="grid h-10 w-10 place-items-center rounded-full bg-surface shadow-neu-sm active:shadow-neu-in-sm disabled:opacity-35 disabled:shadow-none">
              <ChevronRight size={20} />
            </button>
          )}
        </div>

        <div
          className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClickCapture={e => { if (suppressClick.current) { suppressClick.current = false; e.stopPropagation(); e.preventDefault(); } }}
        >
          <div
            ref={trackRef}
            className="flex h-full transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
            style={{ transform: `translateX(${-index * 100}%)` }}
          >
            {days.map(d => {
              const entries = week.get(d) ?? [];
              return (
                <div key={d} className="relative h-full w-full flex-none" aria-hidden={d !== day}>
                  <div
                    className={large ? 'absolute inset-x-8 top-1/2 -translate-y-1/2' : 'absolute bottom-4 left-5 right-3 top-1'}
                    style={large ? { height: 'min(calc(100% - 48px), 560px)' } : undefined}
                  >
                    {rangeTicks(range.from, range.to).map(m => (
                      <div key={m}>
                        <div className="absolute bottom-0 top-6 w-px bg-gray-300/70 dark:bg-white/10" style={{ left: pct(m) }} />
                        <div className={`absolute top-0 -translate-x-1/2 leading-5 tabular-nums text-gray-500 dark:text-gray-400 ${large ? 'text-[13px]' : 'text-xs'}`} style={{ left: pct(m) }}>
                          {formatMinutes(m)}
                        </div>
                      </div>
                    ))}
                    {entries.map(e => (
                      <TallBlock
                        key={e.key}
                        entry={e}
                        role={role}
                        state={blockState(e, d === today, now)}
                        isDark={isDark}
                        left={pct(e.start)}
                        width={`calc(${(((e.end - e.start) / span) * 100).toFixed(3)}% - 3px)`}
                        large={large}
                        onCheck={role === 'teacher' && d === today && due?.key === e.key ? () => onCheck(e) : undefined}
                      />
                    ))}
                    {d === today && now >= range.from && now <= range.to && (
                      <div className="pointer-events-none absolute bottom-0 top-0 z-0 w-0" style={{ left: pct(now) }}>
                        <div className="absolute bottom-0 top-6 -left-px w-0.5 bg-red-500 dark:bg-red-400" />
                        <span className="absolute top-0 h-5 -translate-x-1/2 whitespace-nowrap rounded-full bg-red-500 px-1.5 text-[11px] font-semibold leading-5 tabular-nums text-white dark:bg-red-400">
                          {formatMinutes(now)}
                        </span>
                      </div>
                    )}
                    {entries.length === 0 && (
                      <div className="absolute inset-0 grid place-items-center text-center text-gray-600 dark:text-gray-400">
                        <div>
                          <b className="block text-[17px] font-semibold text-gray-900 dark:text-gray-50">{d === today ? 'วันนี้ไม่มีคาบ' : 'ไม่มีคาบ'}</b>
                          {dayDateLabel(d)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );

  return createPortal(content, document.body);
}
