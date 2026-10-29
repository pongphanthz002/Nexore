'use client';

import { useEffect } from 'react';
import Modal from '@/components/Modal';
import { Loader2 } from 'lucide-react';

export interface UploadProgress {
  title: string;
  /** Current step label, e.g. "กำลังบันทึกรายชื่อ" */
  label: string;
  step: number;
  totalSteps: number;
  done: number;
  /** 0 while the step's size is not known yet (shows an indeterminate bar). */
  total: number;
}

/**
 * Blocking popup shown while an admin upload runs. It has no close button and warns
 * before leaving the page, because stopping mid-upload leaves the roster half-written.
 */
export default function UploadProgressModal({ progress, isDark }: { progress: UploadProgress | null; isDark: boolean }) {
  const open = progress !== null;

  useEffect(() => {
    if (!open) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [open]);

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;

  return (
    <Modal open={open} onClose={() => {}} dismissible={false} labelledBy="upload-progress-title">
      {progress && (<>
        <div className="flex items-center gap-3 mb-4">
          <Loader2 size={22} className="animate-spin text-blue-500 shrink-0" />
          <h3 id="upload-progress-title" className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
            {progress.title}
          </h3>
        </div>

        <div className="flex items-baseline justify-between gap-3 mb-2">
          <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
            {progress.totalSteps > 1 && `ขั้นตอน ${progress.step}/${progress.totalSteps} · `}
            {progress.label}
          </p>
          {percent !== null && (
            <span className={`text-sm font-semibold tabular-nums ${isDark ? 'text-white' : 'text-gray-800'}`}>{percent}%</span>
          )}
        </div>

        <div
          className="h-2.5 rounded-full overflow-hidden shadow-neu-in-xs"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? undefined}
        >
          {percent !== null ? (
            <div className="h-full rounded-full bg-blue-500 transition-[width] duration-300 ease-out" style={{ width: `${percent}%` }} />
          ) : (
            <div className="h-full w-1/3 rounded-full bg-blue-500 animate-pulse" />
          )}
        </div>

        {progress.total > 0 && (
          <p className={`text-xs mt-2 tabular-nums ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {progress.done.toLocaleString()} / {progress.total.toLocaleString()} รายการ
          </p>
        )}

        <p className={`text-xs mt-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          กรุณาอย่าปิดหรือออกจากหน้านี้จนกว่าจะเสร็จ
        </p>
      </>)}
    </Modal>
  );
}
