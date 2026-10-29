'use client';

import { useRef, type ReactNode } from 'react';
import Avatar from '@/components/Avatar';
import { ArrowLeft, Check, ChevronRight, Search, Trash2, X } from 'lucide-react';

/**
 * Shared pieces of the admin roster pages (teachers, students, subjects): page header with
 * back button and actions, search well, list rows with long-press selection, and the bar that
 * shows while rows are selected. Soft UI: buttons rise and press in, wells and rows sink.
 */

export function AdminPageHeader({ title, subtitle, onBack, actions }: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="กลับ"
        className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-surface text-gray-700 shadow-neu-sm transition-shadow active:shadow-neu-in-sm dark:text-gray-200"
      >
        <ArrowLeft size={20} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-bold leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex w-full gap-2 sm:w-auto">{actions}</div>}
    </div>
  );
}

const actionCls = 'flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition-shadow sm:flex-none sm:px-4';
const plainCls = `${actionCls} bg-surface text-gray-700 shadow-neu-sm active:shadow-neu-in-sm dark:text-gray-200`;

export function ActionButton({ icon, label, onClick, primary }: { icon: ReactNode; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={primary ? `${actionCls} bg-red-600 text-white shadow-neu-sm active:shadow-neu-in-sm active:bg-red-700` : plainCls}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/** Excel upload as a button (a label around a hidden file input). */
export function UploadButton({ icon, label, onChange }: { icon: ReactNode; label: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className={`${plainCls} cursor-pointer focus-within:ring-2 focus-within:ring-red-500`}>
      <input type="file" accept=".xlsx" onChange={onChange} className="sr-only" />
      {icon}
      <span>{label}</span>
    </label>
  );
}

export function SearchWell({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative mb-5">
      <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="h-12 w-full rounded-2xl border border-transparent bg-surface pl-11 pr-4 text-gray-900 shadow-neu-in-sm outline-none placeholder:text-gray-500 focus:border-red-400 dark:text-gray-50 dark:placeholder:text-gray-400"
      />
    </div>
  );
}

export function StatusPill({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-semibold ${
      ok ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-gray-500/10 text-gray-500 dark:text-gray-400'
    }`}>
      {children}
    </span>
  );
}

/** Person's Google photo (saved on their doc at sign-in), or the first letter of their name. */
export function Initial({ name, src }: { name: string; src?: string | null }) {
  return <Avatar src={src} name={name} />;
}

interface RosterRowProps {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  /** Badge on the meta line (status, type), so long names keep the row's full width. */
  trailing?: ReactNode;
  selected: boolean;
  /** Some row is selected: a tap toggles instead of opening. */
  selecting: boolean;
  onOpen?: () => void;
  onToggle: () => void;
  touch: { onTouchStart: () => void; onTouchEnd: () => void; onTouchMove: () => void };
}

/** List row: tap opens, right-click or press-and-hold selects (the page's touch handlers). */
export function RosterRow({ leading, title, meta, trailing, selected, selecting, onOpen, onToggle, touch }: RosterRowProps) {
  // The page's long-press timer selects the row; the click and context menu that follow the
  // same touch must not toggle it back
  const touchStart = useRef(0);
  const activate = () => (selecting || !onOpen ? onToggle() : onOpen());
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selecting ? selected : undefined}
      onClick={() => {
        const longPress = touchStart.current > 0 && Date.now() - touchStart.current >= 450;
        touchStart.current = 0;
        if (!longPress) activate();
      }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } }}
      onContextMenu={e => { e.preventDefault(); if (!touchStart.current) onToggle(); }}
      onTouchStart={() => { touchStart.current = Date.now(); touch.onTouchStart(); }}
      onTouchEnd={touch.onTouchEnd}
      onTouchMove={() => { touchStart.current = 0; touch.onTouchMove(); }}
      className={`flex cursor-pointer select-none items-center gap-3 rounded-2xl p-3 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-red-500 ${
        selected ? 'bg-red-500/10 shadow-neu-in-sm ring-2 ring-red-500' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm'
      }`}
    >
      {selecting ? (
        <span aria-hidden className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${selected ? 'bg-red-600 text-white' : 'bg-surface shadow-neu-in-sm'}`}>
          {selected && <Check size={18} />}
        </span>
      ) : leading}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{title}</div>
        {(meta || trailing) && (
          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            {meta && <span className="truncate text-sm text-gray-500 dark:text-gray-400">{meta}</span>}
            {trailing}
          </div>
        )}
      </div>
      {!selecting && onOpen && <ChevronRight size={18} className="flex-none text-gray-400" />}
    </div>
  );
}

/** Shown while rows are selected: count, delete, clear. Sticks to the bottom of the screen. */
export function SelectionBar({ count, onDelete, onClear }: { count: number; onDelete: () => void; onClear: () => void }) {
  if (count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-xl items-center gap-2 rounded-2xl bg-surface p-2 pl-4 shadow-neu-lg">
        <span className="flex-1 text-sm font-semibold">เลือก {count} รายการ</span>
        <button type="button" onClick={onClear} className="flex h-10 items-center gap-1.5 rounded-xl bg-surface px-3 text-sm font-semibold text-gray-700 shadow-neu-sm active:shadow-neu-in-sm dark:text-gray-200">
          <X size={16} /> ยกเลิก
        </button>
        <button type="button" onClick={onDelete} className="flex h-10 items-center gap-1.5 rounded-xl bg-red-600 px-3 text-sm font-semibold text-white shadow-neu-sm active:bg-red-700">
          <Trash2 size={16} /> ลบ
        </button>
      </div>
    </div>
  );
}

/** Raised card holding a list section, with an optional heading. */
export function SectionCard({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-neu-lg sm:p-5">
      {title && <h2 className="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">{title}</h2>}
      {children}
    </section>
  );
}
