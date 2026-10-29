'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/Modal';

/**
 * `askConfirm` is the app's `confirm()`: it opens a `ConfirmDialog` (rendered by `<ConfirmHost />`
 * in the root layout) and resolves true on the confirm button, false on cancel / Escape / backdrop.
 *
 *   if (!(await askConfirm({ title: 'ลบงานนี้?', confirmLabel: 'ลบ', tone: 'danger' }))) return;
 *
 * Use a page's own `ConfirmDialog` instead when the dialog needs live content or a busy state.
 */

export interface ConfirmOptions {
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  tone?: 'primary' | 'danger';
}

interface Request extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

let current: Request | null = null;
let setHost: ((r: Request | null) => void) | null = null;

export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    // A newer question replaces an unanswered one (which counts as cancelled)
    current?.resolve(false);
    current = { ...options, resolve };
    if (setHost) setHost(current);
    else resolve(false);
  });
}

export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setHost = r => { setRequest(r); setOpen(!!r); };
    return () => { setHost = null; };
  }, []);

  const answer = (ok: boolean) => {
    if (!request) return;
    request.resolve(ok);
    current = null;
    // Keep `request` for the exit animation; only close
    setOpen(false);
  };

  return (
    <ConfirmDialog
      open={open}
      title={request?.title}
      message={request?.message}
      confirmLabel={request?.confirmLabel}
      cancelLabel={request?.cancelLabel}
      tone={request?.tone}
      onConfirm={() => answer(true)}
      onClose={() => answer(false)}
    />
  );
}
