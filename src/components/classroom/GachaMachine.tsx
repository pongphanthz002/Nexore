'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Shuffle, Users } from 'lucide-react';
import Avatar, { initialOf } from '@/components/Avatar';
import Modal, { ModalHeader } from '@/components/Modal';
import { pickPeople } from '@/lib/classroom-tools';
import { readRoomState, writeRoomState } from '@/lib/classroom-tools-store';
import { DomeWorld, TrayWorld, type Body } from '@/lib/gacha-physics';
import { CANDY, Stepper, Toggle, personLine, type ToolPerson } from './controls';

/**
 * The random picker as a gacha machine. A sunk glass dome holds one capsule per student who
 * hasn't been called yet (photo or first letter, no names). The capsules are real bodies
 * (src/lib/gacha-physics.ts): they pour in, pile up, bounce and roll; turning the crank tumbles
 * them, then the picked capsule is drawn out through the hole at the bottom, drops into the
 * tray, bounces to a stop and opens, and the name pops up in the middle of the screen.
 * Without repeats the dome empties as students are called, then refills for a new round.
 * Reduced motion: a still pile and the popup straight away.
 */

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const colorOf = (id: string) => CANDY[hash(id) % CANDY.length];

/** Capsule diameter for a class of `n` in a dome of diameter `d`: room to pile and to tumble. */
const capsuleSize = (n: number, d: number) =>
  Math.round(Math.max(24, Math.min(60, Math.sqrt((0.45 * Math.PI * (d / 2) ** 2) / Math.max(4, n)))));

/** Still pile for reduced motion: hex rows from the bottom of the circle, centred. */
function pile(n: number, d: number, size: number): { x: number; y: number }[] {
  const r = d / 2;
  const spots: { x: number; y: number }[] = [];
  const inner = r - size / 2 - 4;
  for (let row = 0; spots.length < n; row++) {
    const y = r + inner - row * size * 0.88;
    if (y < r - inner) break;
    const half = Math.sqrt(Math.max(0, inner * inner - (y - r) ** 2));
    const step = size * 1.02;
    const fit = Math.floor((2 * half) / step) + 1;
    const nudge = row % 2 ? step / 4 : -step / 4;
    const start = -((fit - 1) * step) / 2 + (fit > 1 ? nudge : 0);
    for (let k = 0; k < fit && spots.length < n; k++) spots.push({ x: r + start + k * step, y });
  }
  while (spots.length < n) spots.push({ x: r, y: r });
  return spots;
}

function Capsule({ person, size, color }: { person: ToolPerson; size: number; color: string }) {
  const inner = Math.round(size * 0.66);
  return (
    <span
      className="relative grid place-items-center overflow-hidden rounded-full shadow-[1px_2px_5px_rgb(0_0_0/0.25)]"
      style={{ width: size, height: size, background: `linear-gradient(to bottom, ${color} 50%, #fafaf9 50%)` }}
    >
      {/* coloured top, white shell below, like a real capsule in both themes */}
      <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-black/10" />
      <span className="relative grid place-items-center overflow-hidden rounded-full ring-2 ring-white/80 dark:ring-white/25" style={{ width: inner, height: inner }}>
        {person.photoURL ? (
          <Avatar src={person.photoURL} name={person.name} className="!h-full !w-full !shadow-none" />
        ) : (
          <span className="grid h-full w-full place-items-center bg-surface font-bold text-gray-700 dark:text-gray-100" style={{ fontSize: inner * 0.5 }}>
            {initialOf(person.name)}
          </span>
        )}
      </span>
      {/* glossy highlight */}
      <span aria-hidden className="pointer-events-none absolute left-[18%] top-[10%] h-[22%] w-[34%] -rotate-[25deg] rounded-full bg-white/45" />
    </span>
  );
}

const BURST = Array.from({ length: 14 }, (_, i) => i);

/** The name card inside the popup: springs up out of nowhere with a pastel burst. */
function PopCard({ person, index, showRoom, single, big }: { person: ToolPerson; index: number; showRoom: boolean; single: boolean; big: boolean }) {
  const reduce = useReducedMotion();
  const color = colorOf(person.studentId);
  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.3, y: 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 320, damping: 14, mass: 0.9 }}
      className={`relative rounded-[24px] bg-surface shadow-neu ${single ? 'flex flex-col items-center px-6 py-7 text-center' : 'flex items-center gap-4 p-4'}`}
    >
      {!reduce && (
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
          {BURST.map(i => {
            const a = (i / BURST.length) * Math.PI * 2 + index * 0.7;
            const dist = (single ? 150 : 120) + (i % 3) * 22;
            return (
              <motion.span
                key={i}
                className="absolute rounded-full"
                style={{ background: CANDY[(i + index) % CANDY.length], left: -5, top: -5, width: i % 2 ? 8 : 11, height: i % 2 ? 8 : 11 }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
                animate={{ x: Math.cos(a) * dist, y: Math.sin(a) * dist * 0.75, opacity: 0, scale: 1 }}
                transition={{ duration: 0.9, ease: [0.15, 0.8, 0.25, 1] }}
              />
            );
          })}
        </span>
      )}
      <span className="relative rounded-full p-1.5" style={{ background: color }}>
        <Avatar src={person.photoURL} name={person.name} size={single ? 'xl' : 'lg'} className={single && big ? '!h-28 !w-28 !text-5xl' : ''} />
      </span>
      <span className={`relative min-w-0 ${single ? 'mt-4' : ''}`}>
        <span className={`block font-bold leading-tight ${single ? (big ? 'text-5xl' : 'text-3xl') : big ? 'text-3xl' : 'text-xl'}`}>{person.name}</span>
        <span className={`mt-1 block font-medium text-gray-500 dark:text-gray-400 ${big ? 'text-lg' : 'text-sm'}`}>{personLine(person, showRoom)}</span>
      </span>
    </motion.div>
  );
}

const TRAY = 96;
const TRAY_CAPSULE = 50;
const SPIN_SECONDS = 1.6;
const RELEASE_GAP_MS = 650;

/** Crank stirring over time: winds up, tumbles, eases off. */
const stirAt = (t: number) => (t < 0.15 ? t / 0.15 : t < SPIN_SECONDS - 0.3 ? 1 : Math.max(0, (SPIN_SECONDS - t) / 0.3));

interface Draw {
  picked: string[];
  next: string[];
  popped: number;
}

export default function GachaMachine({ people, roomKey, showRoom, big = false }: {
  people: ToolPerson[];
  roomKey: string;
  showRoom: boolean;
  big?: boolean;
}) {
  const reduce = !!useReducedMotion();
  const [count, setCount] = useState(1);
  const [allowRepeat, setAllowRepeat] = useState(false);
  const [called, setCalled] = useState<string[]>([]);
  const [phase, setPhase] = useState<'idle' | 'spin' | 'release'>('idle');
  const [turns, setTurns] = useState(0);
  const [popup, setPopup] = useState<ToolPerson[]>([]);
  const [popupOpen, setPopupOpen] = useState(false);
  const [expected, setExpected] = useState(0);
  const [lastPicks, setLastPicks] = useState<ToolPerson[]>([]);
  const [ballIds, setBallIds] = useState<string[]>([]);
  const [trayId, setTrayId] = useState<string | null>(null);
  const [opening, setOpening] = useState<{ id: string; x: number; y: number; a: number } | null>(null);
  const [showCalled, setShowCalled] = useState(false);
  /** bumped after a draw so capsules that may come back (repeats allowed) pour into the dome again */
  const [refill, setRefill] = useState(0);

  useEffect(() => {
    const state = readRoomState(roomKey);
    setCalled(state.called ?? []);
    setAllowRepeat(!!state.allowRepeat);
    setCount(state.pickCount ?? 1);
    setPopup([]);
    setPopupOpen(false);
    setLastPicks([]);
  }, [roomKey]);

  const byId = useMemo(() => new Map(people.map(p => [p.studentId, p])), [people]);
  const calledHere = useMemo(() => called.filter(id => byId.has(id)), [called, byId]);
  const waiting = allowRepeat ? people : people.filter(p => !calledHere.includes(p.studentId));
  // Everyone called: the dome fills with the whole class again for the next round
  const desired = (waiting.length ? waiting : people).map(p => p.studentId);
  const desiredKey = desired.join(',');

  // Dome size follows its box
  const domeRef = useRef<HTMLDivElement>(null);
  const [d, setD] = useState(0);
  useLayoutEffect(() => {
    const el = domeRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setD(el.clientWidth));
    ro.observe(el);
    setD(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const size = d ? capsuleSize(people.length, d) : 0;

  // ---- physics ----------------------------------------------------------------------------
  const world = useRef<DomeWorld | null>(null);
  const tray = useRef(new TrayWorld(TRAY, TRAY));
  const els = useRef(new Map<string, HTMLSpanElement>());
  const trayEl = useRef<HTMLSpanElement | null>(null);
  const raf = useRef(0);
  const last = useRef(0);
  const quiet = useRef(0);
  const spinStart = useRef<number | null>(null);
  const draw = useRef<Draw | null>(null);
  /** capsules travelling out (released, in the tray): not put back into the dome meanwhile */
  const inFlight = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const place = (el: HTMLElement | null | undefined, b: Body) => {
    if (el) el.style.transform = `translate3d(${b.x - b.r}px, ${b.y - b.r}px, 0) rotate(${b.a}rad)`;
  };

  const render = useCallback(() => {
    world.current?.balls.forEach(b => place(els.current.get(b.id), b));
    const t = tray.current.ball;
    if (t) place(trayEl.current, t);
  }, []);

  const finishDraw = useCallback(() => {
    const current = draw.current;
    if (!current) return;
    draw.current = null;
    setCalled(current.next);
    writeRoomState(roomKey, { called: current.next });
    setLastPicks(current.picked.map(id => byIdRef.current.get(id)).filter((p): p is ToolPerson => !!p));
    setPhase('idle');
    setRefill(n => n + 1);
  }, [roomKey]);

  /** The capsule in the tray opens: its person pops up in the middle of the screen. */
  const pop = useCallback((id: string) => {
    const b = tray.current.ball;
    if (b && b.id === id) setOpening({ id, x: b.x, y: b.y, a: b.a });
    tray.current.clear();
    setTrayId(null);
    inFlight.current.delete(id);
    const person = byIdRef.current.get(id);
    if (person) {
      setPopup(list => (list.some(p => p.studentId === id) ? list : [...list, person]));
      setPopupOpen(true);
      if (draw.current?.popped === 0) navigator.vibrate?.(35);
    }
    if (draw.current) {
      draw.current.popped += 1;
      if (draw.current.popped >= draw.current.picked.length) finishDraw();
    }
  }, [finishDraw]);

  const tick = useRef<(now: number) => void>(() => {});
  const wake = useCallback(() => {
    if (reduce || raf.current) return;
    quiet.current = 0;
    last.current = performance.now();
    raf.current = requestAnimationFrame(t => tick.current(t));
  }, [reduce]);

  tick.current = (now: number) => {
    const w = world.current;
    if (!w) { raf.current = 0; return; }
    const dt = Math.min(0.05, (now - last.current) / 1000);
    last.current = now;

    if (spinStart.current !== null) {
      const t = (now - spinStart.current) / 1000;
      w.stir = stirAt(t);
      if (t >= SPIN_SECONDS) {
        spinStart.current = null;
        w.stir = 0;
        const picked = draw.current?.picked ?? [];
        setPhase('release');
        picked.forEach((id, i) => {
          timers.current.push(setTimeout(() => {
            // A capsule out of the dome (repeats allowed and still on its way) comes back in first
            if (!w.has(id)) w.add(id, sizeRef.current / 2, { x: w.radius, y: w.radius * 1.5 });
            setBallIds(w.balls.map(b => b.id));
            w.release(id);
            wake();
          }, i * RELEASE_GAP_MS));
        });
      }
    }

    const out = w.step(dt);
    for (const b of out) {
      // A capsule still in the tray opens first, then the next one drops in
      const waitingInTray = tray.current.ball;
      if (waitingInTray) pop(waitingInTray.id);
      tray.current.drop(b.id, TRAY_CAPSULE / 2);
      setTrayId(b.id);
      setBallIds(ids => ids.filter(x => x !== b.id));
    }
    tray.current.step(dt);
    if (tray.current.ball && tray.current.settled) pop(tray.current.ball.id);
    render();

    const active = spinStart.current !== null || w.busy || !!tray.current.ball || w.maxSpeed() > 3;
    quiet.current = active ? 0 : quiet.current + 1;
    raf.current = quiet.current < 20 ? requestAnimationFrame(t => tick.current(t)) : 0;
  };

  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    timers.current.forEach(clearTimeout);
  }, []);

  // A new room starts with a new dome
  useEffect(() => {
    world.current = null;
    inFlight.current.clear();
    draw.current = null;
    tray.current.clear();
    setTrayId(null);
    setPhase('idle');
    spinStart.current = null;
  }, [roomKey]);

  // Keep the dome's capsules in step with who is waiting: new ones pour in, others leave
  useEffect(() => {
    if (!d || !size) return;
    if (!world.current) world.current = new DomeWorld(d / 2);
    const w = world.current;
    if (w.radius !== d / 2 || (w.balls[0] && w.balls[0].r !== size / 2)) w.resize(d / 2, size / 2);
    const want = new Set(desiredKey.split(','));
    for (const b of [...w.balls]) {
      if (!want.has(b.id) && !w.isReleasing(b.id) && !draw.current?.picked.includes(b.id)) w.remove(b.id);
    }
    for (const id of Array.from(want)) {
      if (id && !w.has(id) && !inFlight.current.has(id)) w.add(id, size / 2);
    }
    setBallIds(w.balls.map(b => b.id));
    render();
    wake();
  }, [desiredKey, d, size, roomKey, refill, wake, render]);

  // ---- drawing ----------------------------------------------------------------------------
  const maxCount = Math.max(1, Math.min(5, people.length));
  const pickN = Math.min(count, maxCount);
  const busy = phase !== 'idle';

  const spin = () => {
    if (busy || people.length === 0) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const { picked, called: next } = pickPeople(people.map(p => p.studentId), pickN, calledHere, allowRepeat);
    const chosen = picked.map(id => byId.get(id)).filter((p): p is ToolPerson => !!p);
    setPopup([]);
    setExpected(picked.length);
    setTurns(t => t + 2);

    if (reduce || !world.current) {
      setPopup(chosen);
      setPopupOpen(true);
      setCalled(next);
      writeRoomState(roomKey, { called: next });
      setLastPicks(chosen);
      return;
    }
    picked.forEach(id => inFlight.current.add(id));
    draw.current = { picked, next, popped: 0 };
    setPhase('spin');
    spinStart.current = performance.now();
    wake();
  };

  const again = () => {
    setPopupOpen(false);
    // let the popup close before the crank turns
    timers.current.push(setTimeout(() => spinRef.current(), 250));
  };
  const spinRef = useRef(spin);
  spinRef.current = spin;

  const resetCalled = () => {
    setCalled([]);
    writeRoomState(roomKey, { called: [] });
    setShowCalled(false);
  };

  if (people.length === 0) {
    return <p className="rounded-2xl p-6 text-center text-gray-500 shadow-neu-in-sm dark:text-gray-400">ไม่มีนักเรียนให้สุ่ม</p>;
  }

  const calledPeople = calledHere.map(id => byId.get(id)!).filter(Boolean);
  const stillPile = reduce && d ? pile(ballIds.length, d, size) : [];
  const trayPerson = trayId ? byId.get(trayId) : undefined;
  const openingPerson = opening ? byId.get(opening.id) : undefined;

  return (
    <div className={`mx-auto flex w-full flex-col items-center ${big ? 'max-w-md' : 'max-w-[360px]'}`}>
      {/* Dome */}
      <div className="relative z-10 w-[86%] rounded-full bg-surface p-3 shadow-neu-lg">
        <div ref={domeRef} className="relative aspect-square w-full overflow-hidden rounded-full shadow-neu-in">
          {ballIds.map((id, i) => {
            const person = byId.get(id);
            if (!person || !size) return null;
            const still = stillPile[i];
            return (
              <span
                key={id}
                ref={el => {
                  if (el) els.current.set(id, el); else els.current.delete(id);
                  const b = world.current?.balls.find(x => x.id === id);
                  if (el && b && !reduce) place(el, b);
                }}
                className="absolute left-0 top-0 will-change-transform"
                style={still ? { transform: `translate3d(${still.x - size / 2}px, ${still.y - size / 2}px, 0)` } : undefined}
              >
                <Capsule person={person} size={size} color={colorOf(id)} />
              </span>
            );
          })}
          {/* the hole the picked capsule leaves through */}
          <span aria-hidden className="absolute bottom-1.5 left-1/2 h-3 w-[24%] -translate-x-1/2 rounded-full bg-black/10 shadow-neu-in-xs dark:bg-black/30" />
          {/* glass shine */}
          <span aria-hidden className="pointer-events-none absolute left-[14%] top-[10%] z-10 h-[22%] w-[12%] -rotate-[30deg] rounded-full bg-white/40 blur-[2px] dark:bg-white/10" />
        </div>
      </div>

      {/* Body: crank and tray */}
      <div className="-mt-8 w-full rounded-[32px] bg-surface px-6 pb-6 pt-12 shadow-neu-lg">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={spin}
            disabled={busy}
            aria-label={`สุ่ม ${pickN} คน`}
            className="group flex flex-col items-center gap-2 disabled:cursor-wait"
          >
            <span className="grid h-24 w-24 place-items-center rounded-full bg-surface shadow-neu transition-shadow group-active:shadow-neu-in-sm">
              <motion.span
                className="relative grid h-16 w-16 place-items-center rounded-full shadow-neu-in-sm"
                animate={{ rotate: turns * 360 }}
                transition={reduce ? { duration: 0 } : { duration: SPIN_SECONDS, ease: [0.45, 0, 0.2, 1] }}
              >
                <span className="absolute h-3.5 w-14 rounded-full bg-surface shadow-neu-sm" />
                <span className="absolute right-0 h-5 w-5 rounded-full bg-red-500 shadow-[1px_2px_4px_rgb(0_0_0/0.3)]" />
                <span className="relative h-5 w-5 rounded-full bg-surface shadow-neu-sm" />
              </motion.span>
            </span>
            <span className="text-[15px] font-bold text-red-700 dark:text-red-400">{busy ? 'กำลังสุ่ม…' : 'หมุน!'}</span>
          </button>

          <div className="flex flex-col items-center gap-2">
            <span className="relative block overflow-hidden rounded-[28px] shadow-neu-in" style={{ width: TRAY, height: TRAY }}>
              {/* chute opening */}
              <span aria-hidden className="absolute left-2 top-1.5 h-2 w-12 rounded-full bg-black/10 shadow-neu-in-xs dark:bg-black/30" />
              {trayPerson && (
                <span
                  key={trayId}
                  ref={el => { trayEl.current = el; const b = tray.current.ball; if (el && b) place(el, b); }}
                  className="absolute left-0 top-0 will-change-transform"
                >
                  <Capsule person={trayPerson} size={TRAY_CAPSULE} color={colorOf(trayPerson.studentId)} />
                </span>
              )}
              <AnimatePresence>
                {opening && openingPerson && (
                  <motion.span
                    key={`open-${opening.id}`}
                    className="absolute left-0 top-0"
                    style={{ x: opening.x - TRAY_CAPSULE / 2, y: opening.y - TRAY_CAPSULE / 2, rotate: `${opening.a}rad` }}
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 0.5, delay: 0.15 }}
                    onAnimationComplete={() => setOpening(null)}
                  >
                    {/* the two halves come apart */}
                    <motion.span className="absolute left-0 top-0 block" style={{ clipPath: 'inset(0 0 50% 0)' }} initial={{ y: 0, rotate: 0 }} animate={{ y: -22, rotate: -35 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }}>
                      <Capsule person={openingPerson} size={TRAY_CAPSULE} color={colorOf(opening.id)} />
                    </motion.span>
                    <motion.span className="absolute left-0 top-0 block" style={{ clipPath: 'inset(50% 0 0 0)' }} initial={{ y: 0 }} animate={{ y: 6 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }}>
                      <Capsule person={openingPerson} size={TRAY_CAPSULE} color={colorOf(opening.id)} />
                    </motion.span>
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">ช่องรับ</span>
          </div>
        </div>
      </div>

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
      {lastPicks.length > 0 && !popupOpen && !busy && (
        <button
          type="button"
          onClick={() => { setPopup(lastPicks); setExpected(lastPicks.length); setPopupOpen(true); }}
          className="mt-1 max-w-full truncate px-3 text-sm text-gray-500 underline-offset-4 hover:underline dark:text-gray-400"
        >
          ล่าสุด: {lastPicks.map(p => p.name).join(', ')}
        </button>
      )}

      {/* The result, in the middle of the screen */}
      <Modal
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        size={big ? 'xl' : expected > 1 ? 'lg' : 'md'}
        labelledBy="gacha-result-title"
        className="overflow-x-hidden p-5 sm:p-6"
      >
        <h2 id="gacha-result-title" className="text-center text-sm font-semibold text-red-700 dark:text-red-400">
          {expected > 1 ? `ได้ ${expected} คน` : 'ได้แก่'}
        </h2>
        <div className={`mt-4 grid gap-3 ${expected > 2 ? 'sm:grid-cols-2' : ''}`}>
          {popup.map((p, i) => (
            <PopCard key={p.studentId} person={p} index={i} showRoom={showRoom} single={expected === 1} big={big} />
          ))}
          {Array.from({ length: Math.max(0, expected - popup.length) }, (_, i) => (
            <div key={`wait-${i}`} className="flex h-[88px] items-center justify-center rounded-[24px] text-sm text-gray-500 shadow-neu-in-sm dark:text-gray-400">
              กำลังออกมา…
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => setPopupOpen(false)} className="h-12 flex-1 rounded-xl bg-surface font-semibold text-gray-800 shadow-neu-sm active:shadow-neu-in-sm dark:text-gray-100" data-autofocus>
            ปิด
          </button>
          <button
            type="button"
            onClick={again}
            disabled={busy}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 font-semibold text-white shadow-neu-sm hover:bg-red-700 disabled:opacity-50"
          >
            <Shuffle size={18} /> สุ่มต่อ
          </button>
        </div>
      </Modal>

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
          disabled={calledPeople.length === 0 || busy}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-surface font-semibold text-gray-800 shadow-neu-sm active:shadow-neu-in-sm disabled:opacity-50 dark:text-gray-100"
        >
          <RotateCcw size={18} /> เริ่มรอบใหม่
        </button>
      </Modal>
    </div>
  );
}
