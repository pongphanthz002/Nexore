'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Copy, Shuffle, Sparkles } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { toast } from '@/components/Toast';
import {
  dealGroups, groupCount, groupPreview, groupStepperRange, groupsAsText, type GroupMode,
} from '@/lib/classroom-tools';
import { readRoomState, writeRoomState } from '@/lib/classroom-tools-store';
import { CANDY, CANDY_STRONG, Segmented, Stepper, type ToolPerson } from './controls';

/**
 * Group maker: number of groups or people per group, then a snake deal over the subject's
 * scores so every group gets strong and weak students (scores are never shown). Names pop into
 * pastel group cards in deal order. The last result is remembered per room on this device.
 */

interface Result {
  groups: ToolPerson[][];
  /** deal position of each member, "g:i" → n */
  dealIndex: Map<string, number>;
  balanced: boolean;
}

export default function GroupMaker({ people, scores, roomKey, showRoom, big = false }: {
  people: ToolPerson[];
  /** studentId → subject total; null when the subject has no scores yet */
  scores: Map<string, number> | null;
  roomKey: string;
  showRoom: boolean;
  big?: boolean;
}) {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<GroupMode>('count');
  const [n, setN] = useState(4);
  const [result, setResult] = useState<Result | null>(null);
  const [gen, setGen] = useState(0);

  const range = groupStepperRange(people.length);
  const value = Math.min(range.max, Math.max(range.min, n));

  // Restore this room's settings and last groups
  useEffect(() => {
    const state = readRoomState(roomKey);
    setMode(state.groupMode ?? 'count');
    setN(state.groupN ?? 4);
    const byId = new Map(people.map(p => [p.studentId, p]));
    if (state.groups) {
      const groups = state.groups.ids.map(ids => ids.map(id => byId.get(id)).filter((p): p is ToolPerson => !!p)).filter(g => g.length);
      const dealIndex = new Map<string, number>();
      groups.forEach((g, gi) => g.forEach((_, i) => dealIndex.set(`${gi}:${i}`, i * groups.length + gi)));
      setResult(groups.length ? { groups, dealIndex, balanced: state.groups.balanced } : null);
    } else {
      setResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once per room; the roster settling later must not undo a new deal
  }, [roomKey]);

  const make = () => {
    const count = groupCount(people.length, mode, value);
    const dealt = dealGroups(people, count, p => scores?.get(p.studentId) ?? null);
    const dealIndex = new Map<string, number>();
    dealt.order.forEach(([g, i], k) => dealIndex.set(`${g}:${i}`, k));
    setResult({ groups: dealt.groups, dealIndex, balanced: dealt.balanced });
    setGen(x => x + 1);
    writeRoomState(roomKey, { groups: { mode, n: value, ids: dealt.groups.map(g => g.map(p => p.studentId)), balanced: dealt.balanced } });
    navigator.vibrate?.(20);
  };

  const copy = async () => {
    if (!result) return;
    const text = groupsAsText(result.groups, p => [p.number, p.name].filter(Boolean).join(' '));
    try {
      await navigator.clipboard.writeText(text);
      toast.success('คัดลอกรายชื่อกลุ่มแล้ว');
    } catch {
      toast.error('คัดลอกไม่สำเร็จ');
    }
  };

  const total = useMemo(() => result?.groups.reduce((s, g) => s + g.length, 0) ?? 0, [result]);

  if (people.length < 2) {
    return <p className="rounded-2xl p-6 text-center text-gray-500 shadow-neu-in-sm dark:text-gray-400">ต้องมีนักเรียนอย่างน้อย 2 คนจึงจะจัดกลุ่มได้</p>;
  }

  return (
    <div className="space-y-6">
      {!big && (
        <section className="rounded-[24px] bg-surface p-5 shadow-neu-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Segmented
              label="วิธีแบ่งกลุ่ม"
              value={mode}
              options={[['count', 'จำนวนกลุ่ม'], ['size', 'คนต่อกลุ่ม']] as const}
              onChange={m => { setMode(m); writeRoomState(roomKey, { groupMode: m }); }}
              className="sm:w-72"
            />
            <div className="flex items-center justify-center">
              <Stepper
                value={value}
                min={range.min}
                max={range.max}
                onChange={v => { setN(v); writeRoomState(roomKey, { groupN: v }); }}
                label={mode === 'count' ? 'จำนวนกลุ่ม' : 'จำนวนคนต่อกลุ่ม'}
                suffix={mode === 'count' ? 'กลุ่ม' : 'คน'}
              />
            </div>
          </div>
          <p className="mt-4 text-center text-[15px] font-medium text-gray-600 dark:text-gray-300 sm:text-left">
            {groupPreview(people.length, mode, value)}
          </p>
          <div className="mt-5 flex gap-3">
            <motion.button
              type="button"
              onClick={make}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 font-semibold text-white shadow-neu-sm transition-colors hover:bg-red-700 active:shadow-none"
            >
              {result ? <Shuffle size={18} /> : <Sparkles size={18} />}
              {result ? 'สุ่มใหม่' : 'จัดกลุ่ม'}
            </motion.button>
            {result && (
              <button
                type="button"
                onClick={copy}
                className="flex h-12 items-center gap-2 rounded-xl bg-surface px-4 font-semibold text-gray-800 shadow-neu-sm transition-shadow active:shadow-neu-in-sm dark:text-gray-100"
              >
                <Copy size={18} /> <span className="max-sm:sr-only">คัดลอก</span>
              </button>
            )}
          </div>
          {result && !result.balanced && (
            <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">วิชานี้ยังไม่มีคะแนน จึงสุ่มคละโดยไม่ดูคะแนน</p>
          )}
        </section>
      )}

      {result && (
        <div className={`grid gap-4 ${big ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
          <AnimatePresence mode="popLayout">
            {result.groups.map((group, gi) => (
              <motion.section
                key={`${gen}-${gi}`}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 320, damping: 24, delay: gi * 0.05 }}
                className="overflow-hidden rounded-[24px] bg-surface shadow-neu"
                aria-label={`กลุ่ม ${gi + 1}`}
              >
                <div className="h-2" style={{ background: CANDY[gi % CANDY.length] }} />
                <div className={big ? 'p-5' : 'p-4'}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className={`font-bold ${big ? 'text-2xl' : 'text-lg'}`} style={{ color: CANDY_STRONG[gi % CANDY_STRONG.length] }}>
                      กลุ่ม {gi + 1}
                    </h3>
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-gray-600 shadow-neu-in-xs dark:text-gray-300">{group.length} คน</span>
                  </div>
                  <ul className="space-y-2">
                    {group.map((p, i) => (
                      <motion.li
                        key={p.studentId}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5, y: -14 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={reduce
                          ? { duration: 0.2 }
                          : { type: 'spring', stiffness: 520, damping: 20, delay: 0.15 + (result.dealIndex.get(`${gi}:${i}`) ?? i) * 0.04 }}
                        className="flex items-center gap-2.5 rounded-xl p-1.5 pr-3 shadow-neu-in-xs"
                      >
                        <Avatar src={p.photoURL} name={p.name} size={big ? 'md' : 'sm'} />
                        <span className={`w-7 flex-none text-right font-semibold tabular-nums text-gray-500 dark:text-gray-400 ${big ? 'text-base' : 'text-sm'}`}>{p.number}</span>
                        <span className="min-w-0">
                          <span className={`block truncate font-semibold ${big ? 'text-xl' : 'text-[15px]'}`}>{p.name}</span>
                          {showRoom && <span className="block text-xs text-gray-500 dark:text-gray-400">{p.classroom}</span>}
                        </span>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              </motion.section>
            ))}
          </AnimatePresence>
        </div>
      )}
      {result && total < people.length && (
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">มีนักเรียน {people.length - total} คนที่ยังไม่อยู่ในกลุ่ม กด &ldquo;สุ่มใหม่&rdquo; เพื่อจัดใหม่ทั้งห้อง</p>
      )}
    </div>
  );
}
