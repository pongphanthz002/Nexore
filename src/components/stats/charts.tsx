'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Small chart pieces for the statistics screens, drawn with plain elements (no chart library).
 * Flat marks, 4px rounded data ends, hairline tracks, values as text next to the marks (never
 * in the mark's colour), and growth animations that fall back to a fade with reduced motion.
 */

export const EASE = [0.2, 0.8, 0.2, 1] as const;
export const CARD = 'rounded-[22px] border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800';
export const META = 'text-gray-600 dark:text-gray-400';
export const TRACK = 'bg-gray-100 dark:bg-gray-700/70';

/** Attendance groups (validated for colour-blind separation on both surfaces). */
export const MIX_COLORS = {
  present: { light: '#059669', dark: '#059669', label: 'มาเรียน' },
  leave: { light: '#0284c7', dark: '#0284c7', label: 'ลา' },
  absent: { light: '#dc2626', dark: '#ef4444', label: 'ขาด / หนี' },
} as const;

export const fmt = (n: number, digits = 1) => {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return Number.isInteger(r) ? String(r) : r.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
};

/** Horizontal bar growing from the left. */
export function Bar({ ratio, color, className = 'h-2', delay = 0, children }: {
  ratio: number;
  color: string;
  className?: string;
  delay?: number;
  /** markers drawn over the track */
  children?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const r = Math.max(0, Math.min(1, ratio || 0));
  return (
    <div className={`relative w-full rounded-full ${TRACK} ${className}`}>
      {r > 0 && (
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${r * 100}%`, backgroundColor: color, transformOrigin: 'left' }}
          initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
          animate={reduce ? { opacity: 1 } : { scaleX: 1 }}
          transition={{ duration: 0.6, ease: EASE, delay }}
        />
      )}
      {children}
    </div>
  );
}

/** A thin vertical tick on a Bar, e.g. the class average or a threshold. */
export function Marker({ ratio, title, className = 'bg-gray-900 dark:bg-white' }: { ratio: number; title: string; className?: string }) {
  const r = Math.max(0, Math.min(1, ratio || 0));
  return (
    <span
      title={title}
      aria-hidden="true"
      className={`absolute -inset-y-1 w-[2px] -translate-x-1/2 rounded-full ring-2 ring-white dark:ring-gray-800 ${className}`}
      style={{ left: `${r * 100}%` }}
    />
  );
}

/** Label sentence case, value prominent; optional note under it. */
export function StatTile({ label, value, unit, note, tone = 'default' }: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  tone?: 'default' | 'alert';
}) {
  return (
    <div className={`${CARD} p-4`}>
      <p className={`text-sm ${META}`}>{label}</p>
      <p className="mt-1 text-3xl font-semibold leading-tight">
        <span className={tone === 'alert' ? 'text-red-600 dark:text-red-400' : ''}>{value}</span>
        {unit && <span className={`ml-1 text-base font-normal ${META}`}>{unit}</span>}
      </p>
      {note && <p className={`mt-1 text-[13px] ${META}`}>{note}</p>}
    </div>
  );
}

/** Part-to-whole bar with a 2px surface gap between segments and a legend below. */
export function StackedBar({ segments, isDark, unit = 'ชม.' }: {
  segments: { key: string; label: string; value: number; color: { light: string; dark: string } }[];
  isDark: boolean;
  unit?: string;
}) {
  const reduce = useReducedMotion();
  const total = segments.reduce((s, x) => s + x.value, 0);
  const shown = segments.filter(s => s.value > 0);
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img"
        aria-label={segments.map(s => `${s.label} ${fmt(s.value)} ${unit}`).join(', ')}>
        {total === 0 && <div className={`h-full w-full ${TRACK}`} />}
        {shown.map((s, i) => (
          <motion.div
            key={s.key}
            title={`${s.label} ${fmt(s.value)} ${unit} (${fmt((s.value / total) * 100)}%)`}
            className={`h-full ${i === 0 ? 'rounded-l-full' : ''} ${i === shown.length - 1 ? 'rounded-r-full' : ''}`}
            style={{ flexGrow: s.value, flexBasis: 0, backgroundColor: isDark ? s.color.dark : s.color.light, transformOrigin: 'left' }}
            initial={reduce ? { opacity: 0 } : { scaleX: 0 }}
            animate={reduce ? { opacity: 1 } : { scaleX: 1 }}
            transition={{ duration: 0.5, ease: EASE, delay: i * 0.06 }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {segments.map(s => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: isDark ? s.color.dark : s.color.light }} />
            <span className={META}>{s.label}</span>
            <span className="font-semibold tabular-nums">{fmt(s.value)}</span>
            {total > 0 && <span className={`tabular-nums ${META}`}>({fmt((s.value / total) * 100, 0)}%)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface RankItem {
  id: string;
  label: string;
  sub?: string;
  value: number;
  valueLabel: string;
  note?: string;
}

/** Leaderboard: rank, name, a bar scaled to the top value and the value at the bar's end. */
export function RankBars({ items, color, empty, onSelect }: {
  items: RankItem[];
  color: string;
  empty: string;
  onSelect?: (id: string) => void;
}) {
  if (items.length === 0) return <p className={`py-6 text-center text-sm ${META}`}>{empty}</p>;
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <ol className="space-y-3.5">
      {items.map((item, i) => {
        const body = (
          <>
            <span className={`w-5 flex-none pt-0.5 text-sm font-semibold tabular-nums ${META}`}>{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate font-medium">{item.label}</p>
                <p className="flex-none font-semibold tabular-nums">{item.valueLabel}</p>
              </div>
              {(item.sub || item.note) && (
                <div className={`flex justify-between gap-3 text-[13px] ${META}`}>
                  <span className="truncate">{item.sub}</span>
                  {item.note && <span className="flex-none">{item.note}</span>}
                </div>
              )}
              <Bar ratio={item.value / max} color={color} className="mt-1.5 h-1.5" delay={i * 0.05} />
            </div>
          </>
        );
        return (
          <li key={item.id}>
            {onSelect ? (
              <button type="button" onClick={() => onSelect(item.id)} className="-mx-2 flex w-[calc(100%+1rem)] gap-3 rounded-xl px-2 py-1 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                {body}
              </button>
            ) : (
              <div className="flex gap-3">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Vertical columns from one baseline, value on each cap; `emphasis` paints one column red. */
export function ColumnChart({ data, color, emphasis, height = 144 }: {
  data: { label: string; value: number }[];
  color: string;
  emphasis?: { label: string; color: string };
  height?: number;
}) {
  const reduce = useReducedMotion();
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div>
      <div className="flex items-end gap-2 border-b border-gray-200 dark:border-gray-700" style={{ height }}>
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 24);
          const fill = emphasis && d.label === emphasis.label ? emphasis.color : color;
          return (
            <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center justify-end" title={`เกรด ${d.label}: ${d.value} คน`}>
              <span className="mb-1 text-[13px] font-semibold tabular-nums">{d.value > 0 ? d.value : ''}</span>
              <motion.div
                className="w-full max-w-[24px] rounded-t-[4px]"
                style={{ height: Math.max(h, d.value > 0 ? 3 : 0), backgroundColor: fill, transformOrigin: 'bottom' }}
                initial={reduce ? { opacity: 0 } : { scaleY: 0 }}
                animate={reduce ? { opacity: 1 } : { scaleY: 1 }}
                transition={{ duration: 0.5, ease: EASE, delay: i * 0.04 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-2">
        {data.map(d => (
          <span key={d.label} className={`min-w-0 flex-1 text-center text-[13px] tabular-nums ${META}`}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

export interface PodiumItem {
  id: string;
  name: string;
  sub: string;
  value: string;
  /** small line under the value, e.g. the grade */
  note?: string;
}

const PLACES = [
  { place: 2, height: 'h-16', medal: '#9ca3af', order: 'order-1' },
  { place: 1, height: 'h-24', medal: '#eab308', order: 'order-2' },
  { place: 3, height: 'h-12', medal: '#c2410c', order: 'order-3' },
];

/** Top three: 2nd – 1st – 3rd, steps of different heights. */
export function Podium({ items, empty, onSelect }: { items: PodiumItem[]; empty: string; onSelect?: (id: string) => void }) {
  const reduce = useReducedMotion();
  if (items.length === 0) return <p className={`py-10 text-center text-sm ${META}`}>{empty}</p>;
  return (
    <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
      {PLACES.map(({ place, height, medal, order }, i) => {
        const item = items[place - 1];
        if (!item) return <div key={place} className={order} />;
        const initials = item.name.replace(/^(นาย|นางสาว|นาง|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.)\s*/, '').trim().charAt(0) || '?';
        const content = (
          <>
            <div className="relative">
              <div className={`grid place-items-center rounded-full bg-gray-100 font-semibold text-gray-800 dark:bg-gray-700 dark:text-gray-100 ${place === 1 ? 'h-16 w-16 text-2xl' : 'h-12 w-12 text-lg'}`}>
                {initials}
              </div>
              <span
                className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-white ring-2 ring-white dark:ring-gray-800"
                style={{ backgroundColor: medal }}
              >
                {place}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 w-full text-center text-sm font-medium leading-snug">{item.name}</p>
            <p className={`w-full truncate text-center text-xs ${META}`}>{item.sub}</p>
            <p className="mt-0.5 text-lg font-semibold leading-tight">{item.value}</p>
            {item.note && <p className={`text-xs ${META}`}>{item.note}</p>}
          </>
        );
        return (
          <motion.div
            key={place}
            className={`flex min-w-0 flex-col items-center ${order}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.1 + i * 0.08 }}
          >
            {onSelect ? (
              <button type="button" onClick={() => onSelect(item.id)} className="flex w-full flex-col items-center rounded-2xl p-1 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                {content}
              </button>
            ) : content}
            <div className={`mt-2 w-full rounded-t-xl ${height} ${place === 1 ? 'bg-gray-200 dark:bg-gray-600' : 'bg-gray-100 dark:bg-gray-700'}`} />
          </motion.div>
        );
      })}
    </div>
  );
}

/** Card with a title row. */
export function ChartCard({ title, note, action, className = '', children }: {
  title: string;
  note?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${CARD} p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold leading-snug">{title}</h3>
          {note && <p className={`mt-0.5 text-[13px] ${META}`}>{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
