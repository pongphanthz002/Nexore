'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * The app's one popup: a flat panel over a dimmed page, rendered into <body> so a transformed
 * parent never traps it. Escape and a tap on the backdrop close it (unless `dismissible` is
 * false), page scroll is locked while open, focus moves in and returns on close. While the
 * exit animation runs it keeps showing the last content, so callers can clear their state at once.
 *
 * `sheet` makes it a bottom sheet on phones (<640px) and a centred dialog from `sm`.
 */

const EASE = [0.2, 0.8, 0.2, 1] as const;

const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '3xl': 'sm:max-w-3xl',
  '4xl': 'sm:max-w-4xl',
} as const;

export type ModalSize = keyof typeof SIZES;

let openCount = 0;

function lockScroll() {
  if (openCount++ === 0) document.body.style.overflow = 'hidden';
}

function unlockScroll() {
  if (--openCount === 0) document.body.style.overflow = '';
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: ModalSize;
  /** Escape / backdrop close; turn off while something is saving */
  dismissible?: boolean;
  /** Turn off for forms, so a stray tap outside doesn't throw away what was typed */
  closeOnBackdrop?: boolean;
  /** Bottom sheet on phones */
  sheet?: boolean;
  /** Extra panel classes; padding defaults to p-6 */
  className?: string;
  /** id of the element naming the dialog */
  labelledBy?: string;
  /** Accessible name when there is no visible title */
  label?: string;
  /** `muted`: the page's grey surface, for content built from cards */
  surface?: 'default' | 'muted';
}

export default function Modal({
  open, onClose, children, size = 'md', dismissible = true, closeOnBackdrop = true, sheet = false, className = 'p-6', labelledBy, label,
  surface = 'default',
}: ModalProps) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const lastChildren = useRef(children);
  if (open) lastChildren.current = children;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    lockScroll();
    const panel = panelRef.current;
    const target = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel;
    target?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !dismissibleRef.current) return;
      // Only the top-most popup closes
      const dialogs = document.querySelectorAll('[data-nexore-modal]');
      if (dialogs[dialogs.length - 1] !== panelRef.current) return;
      e.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      unlockScroll();
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [open]);

  if (!mounted) return null;

  const enter = reduce ? { opacity: 0 } : sheet ? { opacity: 0, y: 48 } : { opacity: 0, y: 12, scale: 0.98 };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={`fixed inset-0 z-[100] flex justify-center ${sheet ? 'items-end sm:items-center sm:p-4' : 'items-center p-4'}`}>
          <motion.div
            className="absolute inset-0 bg-gray-950/45"
            onClick={() => { if (dismissible && closeOnBackdrop) onClose(); }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            ref={panelRef}
            data-nexore-modal=""
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-label={labelledBy ? undefined : label}
            tabIndex={-1}
            initial={enter}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={enter}
            transition={{ duration: 0.24, ease: EASE }}
            className={`relative w-full ${SIZES[size]} overflow-y-auto overscroll-contain text-gray-900 shadow-xl outline-none dark:text-gray-50 ${
              surface === 'muted' ? 'bg-gray-50 dark:bg-gray-900' : 'bg-white dark:bg-gray-800'
            } ${
              sheet
                ? 'max-h-[92dvh] rounded-t-[22px] max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-h-[90dvh] sm:rounded-[22px]'
                : 'max-h-[90dvh] rounded-[22px]'
            } ${className}`}
          >
            {open ? children : lastChildren.current}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Title row with a close button, for use inside <Modal>. */
export function ModalHeader({ title, subtitle, onClose, id, icon }: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose?: () => void;
  /** pass the Modal's `labelledBy` */
  id?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <div className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">{icon}</div>}
        <div className="min-w-0">
          <h2 id={id} className="text-xl font-semibold leading-snug">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>}
        </div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="grid h-11 w-11 flex-none place-items-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          <X size={20} />
        </button>
      )}
    </div>
  );
}

export const BUTTON_SECONDARY = 'h-12 rounded-xl bg-gray-100 px-5 font-semibold text-gray-800 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600';
export const BUTTON_PRIMARY = 'h-12 rounded-xl bg-gray-900 px-5 font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200';
export const BUTTON_DANGER = 'h-12 rounded-xl bg-red-600 px-5 font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50';

/** Yes/no question built on <Modal>. */
export function ConfirmDialog({
  open, title, message, confirmLabel = 'ยืนยัน', cancelLabel = 'ยกเลิก', tone = 'primary', busy = false, onConfirm, onClose, children,
}: {
  open: boolean;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  /** extra content between the message and the buttons */
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <Modal open={open} onClose={onClose} size="md" dismissible={!busy} labelledBy={id}>
      <h2 id={id} className="text-xl font-semibold leading-snug">{title}</h2>
      {message && <div className="mt-2 text-[15px] leading-relaxed text-gray-600 dark:text-gray-300">{message}</div>}
      {children}
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={onClose} disabled={busy} className={`flex-1 ${BUTTON_SECONDARY}`} data-autofocus>
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className={`flex-1 ${tone === 'danger' ? BUTTON_DANGER : BUTTON_PRIMARY}`}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
