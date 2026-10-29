'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Users } from 'lucide-react';
import Avatar, { initialOf } from '@/components/Avatar';
import Modal, { ModalHeader } from '@/components/Modal';
import { pickPeople } from '@/lib/classroom-tools';
import { readRoomState, writeRoomState } from '@/lib/classroom-tools-store';
import { CANDY, Stepper, Toggle, personLine, type ToolPerson } from './controls';

/**
 * The random picker as a gacha machine: a sunk glass dome holding one capsule per student who
 * hasn't been called yet (photo or first letter, no names), a crank that spins them, and an exit
 * where the chosen capsule drops out and opens into a raised name card with a pastel burst.
 * Without repeats the dome empties as students are called, then refills for a new round.
 */

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Capsules piled from the bottom of a circle of diameter `d` (hex rows), largest size that fits. */
function pile(n: number, d: number): { size: number; spots: { x: number; y: number }[] } {
  const r = d / 2;
  let size = Math.max(26, Math.min(64, Math.sqrt((0.5 * Math.PI * r * r) / Math.max(1, n))));
  for (let attempt = 0; attempt < 12; attempt++) {
    const spots: { x: number; y: number }[] = [];
    const inner = r - size / 2 - 6;
    for (let row = 0; spots.length < n; row++) {
      const y = r + inner - row * size * 0.88;
      if (y < r - inner) break;
      const half = Math.sqrt(Math.max(0, inner * inner - (y - r) ** 2));
      const step = size * 1.02;
      const fit = Math.floor((2 * half) / step) + 1;
      // Centre each row, nudging alternate rows so capsules sit in the gaps below
      const nudge = row % 2 ? step / 4 : -step / 4;
      const start = -((fit - 1) * step) / 2 + (fit > 1 ? nudge : 0);
      for (let k = 0; k < fit && spots.length < n; k++) {
        spots.push({ x: r + start + k * step, y });
      }
    }
    if (spots.length >= n) return { size, spots };
    size *= 0.92;
  }
  return { size, spots: Array.from({ length: n }, (_, i) => ({ x: r, y: r + (i % 5) })) };
}

function Capsule({ person, size, color, className = '' }: { person: ToolPerson; size: number; color: string; className?: string }) {
  const inner = Math.round(size * 0.66);
  return (
    <span
      className={`relative grid place-items-center overflow-hidden rounded-full shadow-[2px_3px_6px_rgb(0_0_0/0.22)] ${className}`}
      style={{ width: size, height: size, background: `linear-gradient(to bottom, ${color} 50%, #fafaf9 50%)` }}
    >
      {/* capsule seam: coloured top, white shell below, like a real capsule in both themes */}
      <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-black/10" />
      <span className="relative grid place-items-center overflow-hidden rounded-full ring-2 ring-white/80 dark:ring-white/20" style={{ width: inner, height: inner }}>
        {person.photoURL ? (
          <Avatar src={person.photoURL} name={person.name} className="!h-full !w-full !shadow-none" />
        ) : (
          <span className="grid h-full w-full place-items-center bg-surface font-bold text-gray-700 dark:text-gray-100" style={{ fontSize: inner * 0.5 }}>
            {initialOf(person.name)}
          </span>
        )}
      </span>
    </span>
  );
}

const BURST = Array.from({ length: 12 }, (_, i) => i);

function ResultCard({ person, index, showRoom, big }: { person: ToolPerson; index: number; showRoom: boolean; big: boolean }) {
  const reduce = useReducedMotion();
  const color = CANDY[hash(person.studentId) % CANDY.length];
  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.7 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85, transition: { duration: 0.15 } }}
      transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 380, damping: 18 }}
      className={`relative flex items-center gap-4 rounded-[24px] bg-surface shadow-neu ${big ? 'p-6' : 'p-4'}`}
    >
      {!reduce && (
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
          {BURST.map(i => {
            const a = (i / BURST.length) * Math.PI * 2 + index;
            const dist = (big ? 150 : 110) + (i % 3) * 18;
            return (
              <motion.span
                key={i}
                className="absolute h-2.5 w-2.5 rounded-full"
                style={{ background: CANDY[(i + index) % CANDY.length], left: -5, top: -5 }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: Math.cos(a) * dist, y: Math.sin(a) * dist * 0.6, opacity: 0, scale: 0.4 }}
                transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
              />
            );
          })}
        </span>
      )}
      <span className="rounded-full p-1" style={{ background: color }}>
        <Avatar src={person.photoURL} name={person.name} size={big ? 'xl' : 'lg'} />
      </span>
      <span className="min-w-0">
        <span className={`block font-bold leading-tight ${big ? 'text-4xl sm:text-5xl' : 'text-2xl'}`}>{person.name}</span>
        <span className={`mt-1 block font-medium text-gray-500 dark:text-gray-400 ${big ? 'text-xl' : 'text-sm'}`}>{personLine(person, showRoom)}</span>
      </span>
    </motion.div>
  );
}

type Phase = 'idle' | 'spin' | 'drop';

export default function GachaMachine({ people, roomKey, showRoom, big = false }: {
  people: ToolPerson[];
  roomKey: string;
  showRoom: boolean;
  big?: boolean;
}) {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(1);
  const [allowRepeat, setAllowRepeat] = useState(false);
  const [called, setCalled] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [results, setResults] = useState<ToolPerson[]>([]);
  const [shown, setShown] = useState(0);
  const [dropping, setDropping] = useState<ToolPerson | null>(null);
  const [turns, setTurns] = useState(0);
  const [showCalled, setShowCalled] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const state = readRoomState(roomKey);
    setCalled(state.called ?? []);
    setAllowRepeat(!!state.allowRepeat);
    setCount(state.pickCount ?? 1);
    setResults([]);
    setShown(0);
  }, [roomKey]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Bring the first card into view on phones, where it lands below the machine
  useEffect(() => {
    if (shown === 1) resultsRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }, [shown, reduce]);

  const byId = useMemo(() => new Map(people.map(p => [p.studentId, p])), [people]);
  const calledHere = called.filter(id => byId.has(id));
  const waiting = allowRepeat ? people : people.filter(p => !calledHere.includes(p.studentId));
  // Everyone called: the dome shows the whole class again for the next round
  const removed = new Set(allowRepeat ? [] : results.slice(0, shown).map(p => p.studentId));
  const dome = (waiting.length ? waiting : people).filter(p => !removed.has(p.studentId));

  // Dome size follows its box
  const domeRef = useRef<HTMLDivElement>(null);
  const [d, setD] = useState(280);
  useLayoutEffect(() => {
    const el = domeRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setD(el.clientWidth));
    ro.observe(el);
    setD(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const order = useMemo(
    () => [...dome].sort((a, b) => hash(roomKey + a.studentId) - hash(roomKey + b.studentId)),
    [dome, roomKey],
  );
  const { size, spots } = useMemo(() => pile(order.length, d), [order.length, d]);

  const maxCount = Math.max(1, Math.min(5, people.length));
  const pickN = Math.min(count, maxCount);

  const spin = useCallback(() => {
    if (phase !== 'idle' || people.length === 0) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const { picked, called: next } = pickPeople(people.map(p => p.studentId), pickN, calledHere, allowRepeat);
    const chosen = picked.map(id => byId.get(id)!).filter(Boolean);
    const spinMs = reduce ? 250 : 1500;
    const dropMs = reduce ? 200 : 650;

    setResults([]);
    setShown(0);
    setPhase('spin');
    setTurns(t => t + 2);
    timers.current.push(setTimeout(() => {
      setResults(chosen);
      setPhase('drop');
      chosen.forEach((p, i) => {
        timers.current.push(setTimeout(() => setDropping(p), i * dropMs));
        timers.current.push(setTimeout(() => {
          setDropping(null);
          setShown(i + 1);
          if (i === 0) navigator.vibrate?.(30);
        }, i * dropMs + dropMs * 0.7));
      });
      timers.current.push(setTimeout(() => {
        setCalled(next);
        writeRoomState(roomKey, { called: next });
        setPhase('idle');
      }, chosen.length * dropMs + 100));
    }, spinMs));
  }, [phase, people, pickN, calledHere, allowRepeat, byId, reduce, roomKey]);

  const resetCalled = () => {
    setCalled([]);
    writeRoomState(roomKey, { called: [] });
    setShowCalled(false);
  };

  if (people.length === 0) {
    return <p className="rounded-2xl p-6 text-center text-gray-500 shadow-neu-in-sm dark:text-gray-400">ไม่มีนักเรียนให้สุ่ม</p>;
  }

  const spinning = phase === 'spin';
  // Results sit right under the machine (beside it in fullscreen on wide screens)
  const resultList = (
    <div
      ref={resultsRef}
      className={`grid w-full scroll-mb-28 gap-4 ${big ? 'lg:max-w-xl' : results.length ? 'mt-6' : ''} ${results.length > 2 && !big ? 'sm:grid-cols-2' : ''}`}
      aria-live="polite"
    >
      <AnimatePresence>
        {results.slice(0, shown).map((p, i) => (
          <ResultCard key={`${p.studentId}-${turns}`} person={p} index={i} showRoom={showRoom} big={big} />
        ))}
      </AnimatePresence>
    </div>
  );
  const calledPeople = calledHere.map(id => byId.get(id)!).filter(Boolean);

  return (
    <div className={`mx-auto flex w-full flex-col items-center ${big ? 'max-w-5xl gap-8 lg:flex-row lg:items-start lg:justify-center' : 'max-w-xl gap-6'}`}>
      {/* The machine */}
      <div className={`flex w-full flex-col items-center ${big ? 'max-w-md' : 'max-w-[360px]'}`}>
        <div className="relative z-10 w-[86%] rounded-full bg-surface p-3 shadow-neu-lg">
          <div ref={domeRef} className="relative aspect-square w-full overflow-hidden rounded-full shadow-neu-in">
            {/* glass shine */}
            <span aria-hidden className="pointer-events-none absolute left-[14%] top-[10%] z-10 h-[22%] w-[12%] -rotate-[30deg] rounded-full bg-white/40 blur-[2px] dark:bg-white/10" />
            <AnimatePresence>
              {order.map((p, i) => {
                const spot = spots[i];
                if (!spot) return null;
                const h = hash(p.studentId);
                const jx = ((h % 50) - 25) * (d / 280);
                const jy = (((h >> 6) % 70) + 20) * (d / 280);
                return (
                  <motion.span
                    key={p.studentId}
                    className="absolute left-0 top-0"
                    initial={reduce
                      ? { opacity: 0, left: spot.x - size / 2, top: spot.y - size / 2 }
                      : { opacity: 0, left: spot.x - size / 2, top: spot.y - size / 2, y: -d * 0.6 }}
                    animate={spinning && !reduce
                      ? { opacity: 1, left: spot.x - size / 2, top: spot.y - size / 2, x: [0, jx, -jx * 0.6, jx * 0.3, 0], y: [0, -jy, -jy * 0.3, -jy * 0.8, 0], rotate: [0, (h % 2 ? 1 : -1) * 200, 360] }
                      : { opacity: 1, left: spot.x - size / 2, top: spot.y - size / 2, x: 0, y: 0, rotate: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, y: d * 0.3, transition: { duration: 0.3 } }}
                    transition={spinning && !reduce
                      ? { duration: 0.55 + (h % 5) * 0.07, repeat: Infinity, ease: 'easeInOut', left: { duration: 0 }, top: { duration: 0 } }
                      : { type: 'spring', stiffness: 260, damping: 20, delay: reduce ? 0 : (i % 12) * 0.02 }}
                  >
                    <Capsule person={p} size={size} color={CANDY[h % CANDY.length]} />
                  </motion.span>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Body: crank and exit */}
        <div className="-mt-8 w-full rounded-[32px] bg-surface px-6 pb-6 pt-12 shadow-neu-lg">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={spin}
              disabled={phase !== 'idle'}
              aria-label={`สุ่ม ${pickN} คน`}
              className="group flex flex-col items-center gap-2 disabled:cursor-wait"
            >
              <span className="grid h-24 w-24 place-items-center rounded-full bg-surface shadow-neu transition-shadow group-active:shadow-neu-in-sm">
                <motion.span
                  className="relative grid h-16 w-16 place-items-center rounded-full shadow-neu-in-sm"
                  animate={{ rotate: turns * 360 }}
                  transition={reduce ? { duration: 0 } : { duration: 1.4, ease: [0.45, 0, 0.2, 1] }}
                >
                  <span className="absolute h-3.5 w-14 rounded-full bg-surface shadow-neu-sm" />
                  <span className="absolute right-0 h-5 w-5 rounded-full bg-red-500 shadow-[1px_2px_4px_rgb(0_0_0/0.3)]" />
                  <span className="relative h-5 w-5 rounded-full bg-surface shadow-neu-sm" />
                </motion.span>
              </span>
              <span className="text-[15px] font-bold text-red-700 dark:text-red-400">{phase === 'idle' ? 'หมุน!' : 'กำลังสุ่ม…'}</span>
            </button>

            <div className="flex flex-col items-center gap-2">
              <span className="relative grid h-24 w-24 place-items-center rounded-[28px] shadow-neu-in">
                <span aria-hidden className="absolute inset-x-5 top-2.5 h-2 rounded-full shadow-neu-in-xs" />
                <AnimatePresence>
                  {dropping && (
                    <motion.span
                      key={dropping.studentId}
                      initial={reduce ? { opacity: 0 } : { y: -46, opacity: 0, rotate: -120 }}
                      animate={reduce ? { opacity: 1 } : { y: [-46, 6, -6, 0], opacity: 1, rotate: 0 }}
                      exit={reduce ? { opacity: 0 } : { scale: 1.6, opacity: 0, transition: { duration: 0.2 } }}
                      transition={{ duration: 0.45, ease: 'easeOut' }}
                    >
                      <Capsule person={dropping} size={58} color={CANDY[hash(dropping.studentId) % CANDY.length]} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">ช่องรับ</span>
            </div>
          </div>
        </div>

        {!big && resultList}

        {/* Settings under the machine */}
        <div className="mt-6 flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-3">
          <Stepper value={pickN} min={1} max={maxCount} onChange={n => { setCount(n); writeRoomState(roomKey, { pickCount: n }); }} label="จำนวนที่สุ่ม" suffix="คน" />
          <Toggle checked={allowRepeat} onChange={v => { setAllowRepeat(v); writeRoomState(roomKey, { allowRepeat: v }); }} label="ซ้ำได้" />
        </div>
        <button
          type="button"
          onClick={() => setShowCalled(true)}
          className="mt-3 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-gray-600 transition-shadow active:shadow-neu-in-sm dark:text-gray-300"
        >
          <Users size={16} />
          เรียกแล้ว <span className="font-bold tabular-nums text-gray-900 dark:text-gray-50">{calledPeople.length}/{people.length}</span>
        </button>
      </div>

      {big && resultList}

      <Modal open={showCalled} onClose={() => setShowCalled(false)} sheet size="md" labelledBy="called-title">
        <ModalHeader id="called-title" title="เรียกแล้ววันนี้" subtitle={`${calledPeople.length} จาก ${people.length} คน`} onClose={() => setShowCalled(false)} />
        {calledPeople.length === 0 ? (
          <p className="rounded-xl p-4 text-center text-sm text-gray-500 shadow-neu-in-sm dark:text-gray-400">ยังไม่มีใครถูกเรียก</p>
        ) : (
          <ol className="space-y-2">
            {calledPeople.map((p, i) => (
              <li key={p.studentId} className="flex items-center gap-3 rounded-xl p-2.5 shadow-neu-in-sm">
                <span className="w-6 text-right text-sm font-semibold tabular-nums text-gray-500">{i + 1}</span>
                <Avatar src={p.photoURL} name={p.name} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{personLine(p, showRoom)}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        <button
          type="button"
          onClick={resetCalled}
          disabled={calledPeople.length === 0}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-surface font-semibold text-gray-800 shadow-neu-sm active:shadow-neu-in-sm disabled:opacity-50 dark:text-gray-100"
        >
          <RotateCcw size={18} /> เริ่มรอบใหม่
        </button>
      </Modal>
    </div>
  );
}
