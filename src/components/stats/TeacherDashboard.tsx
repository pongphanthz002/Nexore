'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Crown } from 'lucide-react';
import PullToRefresh from '@/components/PullToRefresh';
import { Bone, SkeletonCard, SkeletonGroup } from '@/components/Skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { loadTeacherStats } from '@/services/teacher-stats.service';
import { readTeacherStats, TEACHER_STATS_FRESH_MS } from '@/lib/teacher-stats-cache';
import {
  attendanceByRoom, pendingTimeline, topScores,
  type AttendanceKind, type AttendanceRange, type PendingRange, type SubjectStatsInput,
} from '@/lib/class-stats';
import { allowAction } from '@/lib/firestore-helpers';
import { THEME_COLORS } from '@/config/theme';

/**
 * Teacher home dashboard over every subject the teacher teaches: the top three scores (podium),
 * the five students with the most pending work (line chart over time) and มา/สาย/ลา/ขาด per room
 * (overlapping areas, the top room of each kind labelled). Data: two summary documents per
 * subject, cached in localStorage for 10 minutes (see loadTeacherStats).
 */

const EASE = [0.2, 0.8, 0.2, 1] as const;
const CARD = 'rounded-[24px] bg-surface p-5 text-gray-900 shadow-neu-lg dark:text-gray-50 sm:p-6';
const META = 'text-gray-600 dark:text-gray-400';

/** Pastel series, checked for colour-blind separation between every pair on the light surface. */
const PASTEL = { lavender: '#7C7FE8', amber: '#EDA100', sky: '#3FB5D9', pink: '#E87BA4' };
const KINDS: { kind: AttendanceKind; label: string; color: string }[] = [
  { kind: 'present', label: 'มา', color: PASTEL.lavender },
  { kind: 'late', label: 'สาย', color: PASTEL.amber },
  { kind: 'leave', label: 'ลา', color: PASTEL.sky },
  { kind: 'absent', label: 'ขาด', color: PASTEL.pink },
];

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));
const classLabel = (c: string) => (/^\d/.test(c) ? `ชั้น ${c}` : c);

/** Two letters for an avatar: the first consonant of the first name and of the surname. */
function initials(name: string): string {
  const words = name.replace(/^(นาย|นางสาว|นาง|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.)\s*/, '').trim().split(/\s+/);
  const first = (w = '') => Array.from(w).find(ch => !'เแโใไ'.includes(ch)) ?? '';
  return (first(words[0]) + first(words[1])) || '?';
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export default function TeacherDashboard() {
  const { userAccount } = useAuth();
  const [inputs, setInputs] = useState<SubjectStatsInput[] | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const schoolConfig = userAccount?.schoolFirebaseConfig;
  const teacherId = userAccount?.userId;

  const load = useCallback(async (force: boolean) => {
    if (!schoolConfig || !teacherId) return;
    setRefreshing(true);
    try {
      const result = await loadTeacherStats(schoolConfig, teacherId, { force });
      setInputs(result.inputs);
      setSavedAt(result.savedAt);
      setFailed(false);
    } catch (err) {
      console.error('Error loading teacher statistics:', err);
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, [schoolConfig, teacherId]);

  useEffect(() => {
    if (!schoolConfig || !teacherId) return;
    // Show the last numbers at once, then re-read only if they are older than 10 minutes
    const cached = readTeacherStats(`${schoolConfig.projectId}:${teacherId}`);
    if (cached) {
      setInputs(cached.inputs);
      setSavedAt(cached.savedAt);
    }
    if (!cached || Date.now() - cached.savedAt >= TEACHER_STATS_FRESH_MS) load(false);
  }, [schoolConfig, teacherId, load]);

  // Pull-to-refresh on the teacher home re-reads the dashboard
  const refresh = () => {
    if (refreshing || !allowAction('teacher-stats-refresh', 10_000)) return;
    return load(true);
  };
  const pull = <PullToRefresh onRefresh={refresh} disabled={!schoolConfig || !teacherId} />;

  let body: React.ReactNode;
  if (!inputs && failed) {
    body = (
      <section className={CARD}>
        <p className="font-medium">โหลดแดชบอร์ดไม่สำเร็จ</p>
        <button type="button" onClick={() => load(true)} className="mt-3 h-11 rounded-full bg-surface px-5 font-semibold shadow-neu-sm active:shadow-neu-in-sm">ลองอีกครั้ง</button>
      </section>
    );
  } else if (!inputs) {
    body = (
      <SkeletonGroup label="กำลังโหลดแดชบอร์ด" className="grid gap-4 lg:grid-cols-12">
        <SkeletonCard className="h-80 lg:col-span-5">
          <Bone className="mb-8 h-5 w-32" />
          <div className="flex h-48 items-end justify-center gap-4">
            <Bone className="h-24 w-16 !rounded-2xl" />
            <Bone className="h-36 w-16 !rounded-2xl" />
            <Bone className="h-16 w-16 !rounded-2xl" />
          </div>
        </SkeletonCard>
        <SkeletonCard className="h-80 lg:col-span-7">
          <Bone className="mb-8 h-5 w-40" />
          <Bone className="h-52 w-full !rounded-2xl" />
        </SkeletonCard>
        <SkeletonCard className="h-72 lg:col-span-12">
          <Bone className="mb-8 h-5 w-36" />
          <Bone className="h-44 w-full !rounded-2xl" />
        </SkeletonCard>
      </SkeletonGroup>
    );
  } else if (inputs.length > 0) {
    body = <TeacherDashboardView inputs={inputs} savedAt={savedAt} refreshing={refreshing} />;
  }

  // One tree for every state, so a pull in progress survives the data arriving
  return <>{pull}{body}</>;
}

export function TeacherDashboardView({ inputs, savedAt, refreshing }: {
  inputs: SubjectStatsInput[];
  savedAt: number | null;
  refreshing: boolean;
}) {
  return (
    <section className={`space-y-4 transition-opacity ${refreshing && savedAt ? 'opacity-70' : ''}`} aria-labelledby="dashboard-title">
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <h2 id="dashboard-title" className="text-2xl font-semibold text-gray-900 dark:text-gray-50">แดชบอร์ด</h2>
          <p className={`text-sm ${META}`}>สรุปจากนักเรียนทุกวิชาที่คุณสอน</p>
          {savedAt && (
            <p className={`text-xs ${META}`}>อัปเดต {new Date(savedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</p>
          )}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <PodiumCard inputs={inputs} />
        <PendingCard inputs={inputs} />
        <AttendanceCard inputs={inputs} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Segmented<T extends string>({ options, value, onChange, label }: {
  options: [T, string][];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const id = useId();
  return (
    <div role="tablist" aria-label={label} className="flex flex-none rounded-full p-1 shadow-neu-in-sm">
      {options.map(([key, text]) => {
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={`relative h-9 rounded-full px-3 text-[13px] font-semibold transition-colors ${active ? 'text-gray-900 dark:text-gray-50' : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-surface shadow-neu-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{text}</span>
          </button>
        );
      })}
    </div>
  );
}

function CardTitle({ title, note, children }: { title: string; note: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-[10rem] flex-1">
        <h3 className="text-lg font-semibold leading-snug">{title}</h3>
        <p className={`mt-0.5 text-[13px] ${META}`}>{note}</p>
      </div>
      {children}
    </div>
  );
}

const PLACES = [
  { place: 2, block: 'h-[104px] sm:h-[120px]', avatar: 'h-[52px] w-[52px] text-base', tone: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-200', delay: 0.15 },
  { place: 1, block: 'h-[140px] sm:h-[164px]', avatar: 'h-16 w-16 text-lg', tone: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200', delay: 0.3 },
  { place: 3, block: 'h-20 sm:h-[92px]', avatar: 'h-[52px] w-[52px] text-base', tone: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200', delay: 0 },
];

function PodiumCard({ inputs }: { inputs: SubjectStatsInput[] }) {
  const reduce = useReducedMotion();
  const top = useMemo(() => topScores(inputs), [inputs]);
  return (
    <section className={`${CARD} flex flex-col lg:col-span-5`}>
      <CardTitle title="คะแนนสูงสุด" note="3 อันดับจากทุกวิชา" />
      {top.length === 0 ? (
        <p className={`py-12 text-center text-sm ${META}`}>ยังไม่มีคะแนน</p>
      ) : (
        <ol className="mt-auto grid grid-cols-3 items-end gap-2.5 pt-6 sm:gap-3">
          {PLACES.map(({ place, block, avatar, tone, delay }) => {
            const s = top[place - 1];
            if (!s) return <li key={place} aria-hidden />;
            return (
              <li key={place} className="flex min-w-0 flex-col items-center" aria-label={`อันดับ ${place} ${s.name}`}>
                {place === 1 && (
                  <motion.span
                    aria-hidden
                    className="mb-1 text-amber-500"
                    animate={reduce ? undefined : { y: [0, -3, 0] }}
                    transition={{ duration: 3, delay: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Crown size={24} strokeWidth={1.8} />
                  </motion.span>
                )}
                <motion.div
                  className="flex w-full flex-col items-center"
                  initial={reduce ? false : { opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.45, delay: 0.55 + delay, ease: [0.2, 0.8, 0.3, 1.25] }}
                >
                  <span className={`grid place-items-center rounded-full font-semibold ${avatar} ${tone} ${place === 1 ? 'shadow-neu' : 'shadow-neu-sm'}`}>
                    {initials(s.name)}
                  </span>
                  <span className="mt-2.5 line-clamp-2 w-full text-center text-sm font-semibold leading-snug">{s.name}</span>
                  <span className={`mt-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{classLabel(s.classroom)}</span>
                </motion.div>
                <motion.div
                  className={`mt-3 flex w-full origin-bottom justify-center rounded-b-md rounded-t-2xl pt-3 text-3xl font-bold ${block} ${tone} ${place === 1 ? 'shadow-neu' : 'shadow-neu-in-sm'}`}
                  initial={reduce ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.8, delay, ease: EASE }}
                >
                  {place}
                </motion.div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function PendingCard({ inputs }: { inputs: SubjectStatsInput[] }) {
  const { isDark } = useTheme();
  const reduce = useReducedMotion();
  const [range, setRange] = useState<PendingRange>('month');
  const [ref, width] = useWidth<HTMLDivElement>();
  const data = useMemo(() => pendingTimeline(inputs, range, new Date()), [inputs, range]);
  const colors = [isDark ? '#F9FAFB' : '#111827', PASTEL.lavender, PASTEL.pink, PASTEL.sky, PASTEL.amber];
  const surface = isDark ? THEME_COLORS.dark : THEME_COLORS.light;

  const H = 160, top = 14, bottom = 146, padL = 6, padR = 10;
  const yMax = data.max <= 4 ? 4 : Math.ceil(data.max / 4) * 4;
  const n = data.labels.length;
  const xs = data.labels.map((_, i) => padL + (n > 1 ? (i * (width - padL - padR)) / (n - 1) : 0));
  const y = (v: number) => bottom - (v / yMax) * (bottom - top);
  const path = (counts: number[]) => counts.map((v, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  return (
    <section className={`${CARD} lg:col-span-7`}>
      <CardTitle title="งานค้างมากที่สุด" note="งานที่ถึงกำหนดแล้วแต่ยังไม่มีคะแนน 5 อันดับ">
        <Segmented label="ช่วงเวลา" value={range} onChange={setRange} options={[['month', 'เดือนนี้'], ['term', 'ทั้งเทอม']]} />
      </CardTitle>

      {data.rows.length === 0 ? (
        <p className={`py-12 text-center text-sm ${META}`}>ไม่มีงานค้าง</p>
      ) : (
        <div className="mt-4 lg:flex lg:items-center lg:gap-6">
          <div className="min-w-0 rounded-[20px] px-3 pb-2 pt-3 shadow-neu-in-sm lg:flex-[1.4]">
          <div ref={ref} className="relative min-w-0">
            {width > 0 && (
              <svg key={range} width={width} height={H} role="img" aria-label={`กราฟเส้นงานค้างสะสมของนักเรียน ${data.rows.length} อันดับ`} className="block overflow-visible">
                {[top, (top + bottom) / 2, bottom].map(gy => (
                  <line key={gy} x1={0} x2={width} y1={gy} y2={gy} className="stroke-gray-300/70 dark:stroke-white/10" strokeWidth={1} />
                ))}
                <motion.path
                  d={`${path(data.rows[0].counts)} L${xs[n - 1]} ${bottom} L${xs[0]} ${bottom} Z`}
                  fill={colors[0]}
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 0.06 }}
                  transition={{ duration: 0.8, delay: 0.7 }}
                />
                {data.rows.slice().reverse().map((row, ri) => {
                  const i = data.rows.length - 1 - ri;
                  return (
                    <motion.path
                      key={row.studentId}
                      d={path(row.counts)}
                      fill="none"
                      stroke={colors[i]}
                      strokeWidth={i === 0 ? 3 : 2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={reduce ? false : { pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1.1, delay: i * 0.1, ease: [0.4, 0, 0.2, 1] }}
                    />
                  );
                })}
                {data.rows.slice().reverse().map((row, ri) => {
                  const i = data.rows.length - 1 - ri;
                  return (
                    <motion.circle
                      key={`dot-${row.studentId}`}
                      cx={xs[n - 1]}
                      cy={y(row.counts[n - 1])}
                      r={i === 0 ? 6 : 4.5}
                      fill={colors[i]}
                      stroke={surface}
                      strokeWidth={2}
                      initial={reduce ? false : { opacity: 0, scale: 0.4 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, delay: 1.1 + i * 0.05 }}
                      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                    />
                  );
                })}
              </svg>
            )}
            <span className={`absolute left-0 top-0 bg-surface pr-1 text-[11px] ${META}`}>{yMax} งาน</span>
            <div className={`relative mt-1.5 h-5 text-xs ${META}`} aria-hidden>
              {width > 0 && data.labels.map((label, i) => (
                <span
                  key={label}
                  className="absolute top-0 whitespace-nowrap"
                  style={{ left: xs[i], transform: `translateX(${i === 0 ? '0' : i === n - 1 ? '-100%' : '-50%'})` }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
          </div>
          <ol className="mt-3 lg:mt-0 lg:flex-1">
            {data.rows.map((row, i) => (
              <motion.li
                key={row.studentId}
                className="flex items-center gap-3 border-t border-gray-300/50 py-2 first:border-t-0 dark:border-white/5"
                initial={reduce ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: 0.3 + i * 0.06, ease: EASE }}
              >
                <span className={`w-4 flex-none text-center text-[13px] font-semibold ${META}`}>{i + 1}</span>
                <span
                  className="grid h-9 w-9 flex-none place-items-center rounded-full bg-surface text-[13px] font-semibold"
                  style={{ boxShadow: `inset 0 0 0 2px ${colors[i]}, var(--neu-raised-sm)` }}
                >
                  {initials(row.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{row.name}</span>
                  <span className={`block text-xs ${META}`}>{classLabel(row.classroom)}</span>
                </span>
                <span className="flex-none rounded-full px-3 py-1 text-[13px] font-semibold tabular-nums shadow-neu-in-sm">
                  {row.counts[n - 1]} งาน
                </span>
              </motion.li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function smooth(points: [number, number][], floor: number): string {
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(floor, p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(floor, p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

function AttendanceCard({ inputs }: { inputs: SubjectStatsInput[] }) {
  const { isDark } = useTheme();
  const reduce = useReducedMotion();
  const [range, setRange] = useState<AttendanceRange>('term');
  const [ref, width] = useWidth<HTMLDivElement>();
  const data = useMemo(() => attendanceByRoom(inputs, range, new Date()), [inputs, range]);
  const surface = isDark ? THEME_COLORS.dark : THEME_COLORS.light;

  const H = 220, top = 16, bottom = 208;
  const count = data.rooms.length;
  const xs = data.rooms.map((_, i) => ((i + 0.5) * width) / Math.max(1, count));
  const y = (p: number) => bottom - (p / 100) * (bottom - top);
  const curves = KINDS.map(k => {
    const vals = data.rooms.map(r => r.pct[k.kind]);
    const pts: [number, number][] = vals.length === 0 ? [] : [
      [0, y(vals[0])], ...vals.map((v, i): [number, number] => [xs[i], y(v)]), [width, y(vals[vals.length - 1])],
    ];
    const line = pts.length ? smooth(pts, bottom) : '';
    return { ...k, line, area: line && `${line} L${width} ${bottom} L0 ${bottom} Z` };
  });

  // The top room of each kind, labels that share a room stacked so they never overlap
  const peaks = data.peaks.map(p => {
    const i = data.rooms.findIndex(r => r.room === p.room);
    return { ...p, x: xs[i], y: y(p.value), color: KINDS.find(k => k.kind === p.kind)!.color, label: KINDS.find(k => k.kind === p.kind)!.label };
  });
  // Lowest point first: its label sits just above its dot, higher ones stack above it
  const lastTop = new Map<number, number>();
  const labelTop = new Map<AttendanceKind, number>();
  [...peaks].sort((a, b) => b.y - a.y).forEach(p => {
    const below = lastTop.get(p.x);
    const t = below === undefined ? p.y - 10 : Math.min(p.y - 10, below - 26);
    lastTop.set(p.x, t);
    labelTop.set(p.kind, t);
  });

  return (
    <section className={`${CARD} lg:col-span-12`}>
      <CardTitle title="สถิติการเข้าเรียน" note="เทียบทุกห้อง · ป้ายบอกห้องที่สูงสุดของแต่ละประเภท">
        <Segmented label="ช่วงเวลา" value={range} onChange={setRange} options={[['week', 'สัปดาห์'], ['month', 'เดือน'], ['term', 'เทอม']]} />
      </CardTitle>

      {count === 0 ? (
        <p className={`py-12 text-center text-sm ${META}`}>ยังไม่มีการเช็คชื่อในช่วงนี้</p>
      ) : (
        <div className="lg:flex lg:items-end lg:gap-8">
          <div ref={ref} className="relative mt-16 min-w-0 lg:flex-[2.2]" style={{ height: H }}>
            {width > 0 && (
              <svg key={range} width={width} height={H} role="img" aria-label={`กราฟพื้นที่สถิติการเข้าเรียน เทียบ ${count} ห้อง`} className="block overflow-visible">
                {[top, (top + bottom) / 2, bottom].map(gy => (
                  <line key={gy} x1={0} x2={width} y1={gy} y2={gy} className="stroke-gray-300/70 dark:stroke-white/10" strokeWidth={1} />
                ))}
                {curves.map((c, i) => (
                  <motion.g
                    key={c.kind}
                    initial={reduce ? false : { clipPath: 'inset(100% 0% 0% 0%)' }}
                    animate={{ clipPath: 'inset(0% 0% 0% 0%)' }}
                    transition={{ duration: 0.9, delay: i * 0.12, ease: EASE }}
                  >
                    <path d={c.area} fill={c.color} opacity={0.2} />
                    <path d={c.line} fill="none" stroke={c.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </motion.g>
                ))}
                {peaks.map(p => (
                  <motion.circle
                    key={p.kind}
                    cx={p.x}
                    cy={p.y}
                    r={4.5}
                    fill={p.color}
                    stroke={surface}
                    strokeWidth={2}
                    initial={reduce ? false : { opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, delay: 1 }}
                    style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                  />
                ))}
              </svg>
            )}
            <span className={`absolute right-0 top-0 text-[11px] ${META}`} aria-hidden>100%</span>
            <span className={`absolute right-0 text-[11px] ${META}`} style={{ top: (top + bottom) / 2 - 12 }} aria-hidden>50%</span>
            {width > 0 && peaks.map(p => (
              <motion.span
                key={`${range}-${p.kind}`}
                className="absolute flex items-center gap-1 whitespace-nowrap rounded-full bg-surface px-2 py-1 text-[11px] font-semibold leading-none text-gray-900 shadow-neu-sm dark:text-gray-50"
                style={{ left: Math.max(48, Math.min(width - 48, p.x)), top: labelTop.get(p.kind), translateX: '-50%', translateY: '-100%' }}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 1.15 }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                {classLabel(p.room)} · {fmt(p.value)}%
              </motion.span>
            ))}
          </div>

          <ul className="mt-5 grid grid-cols-4 gap-2 lg:mt-0 lg:flex-1 lg:grid-cols-2 lg:gap-3">
            {KINDS.map(k => (
              <li key={k.kind} className="rounded-2xl p-2.5 shadow-neu-in-sm lg:p-4">
                <span className="block h-1.5 w-[18px] rounded-full" style={{ backgroundColor: k.color }} />
                <p className={`mt-1.5 text-xs ${META}`}>{k.label} เฉลี่ย</p>
                <p className="text-xl font-semibold leading-tight lg:text-2xl">{fmt(data.overall[k.kind])}%</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
