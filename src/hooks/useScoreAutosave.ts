'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScoreCellWrite } from '@/services/teacher-database.service';

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'offline';

const MAX_RETRY_DELAY_MS = 30_000;
/** Keep each batch well under Firestore's 500-write limit (one write per student). */
const STUDENTS_PER_BATCH = 400;

/** A cell to save, tagged with its subject so switching subjects can't misdirect queued writes. */
export type QueuedScoreCell = ScoreCellWrite & { subjectId: string; classroom: string };

const cellKey = (c: QueuedScoreCell) => `${c.subjectId}|${c.classroom}|${c.studentId}|${c.field}`;

/**
 * Debounced, retrying save queue for score cells. Only cells that changed are written;
 * a newer edit of the same cell replaces the queued one. Failed cells are re-queued and
 * retried with backoff (and as soon as the browser comes back online). While anything is
 * unsaved, closing the tab asks for confirmation.
 */
export function useScoreAutosave(save: (cells: QueuedScoreCell[]) => Promise<void>, debounceMs = 800) {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [unsavedCount, setUnsavedCount] = useState(0);

  const saveRef = useRef(save);
  saveRef.current = save;
  const pending = useRef(new Map<string, QueuedScoreCell>());
  const inflight = useRef(new Set<Promise<void>>());
  const inflightCells = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);

  const refreshCount = useCallback(() => {
    setUnsavedCount(pending.current.size + inflightCells.current);
  }, []);

  const run = useCallback(async (): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (pending.current.size === 0) return;

    const cells = Array.from(pending.current.values());
    pending.current.clear();
    inflightCells.current += cells.length;
    setStatus('saving');
    refreshCount();

    const batches: QueuedScoreCell[][] = [];
    const students = Array.from(new Set(cells.map(c => c.studentId)));
    for (let i = 0; i < students.length; i += STUDENTS_PER_BATCH) {
      const ids = new Set(students.slice(i, i + STUDENTS_PER_BATCH));
      batches.push(cells.filter(c => ids.has(c.studentId)));
    }

    const job = (async () => {
      try {
        for (const batch of batches) await saveRef.current(batch);
        attempts.current = 0;
        inflightCells.current -= cells.length;
        if (pending.current.size === 0 && inflightCells.current === 0) setStatus('saved');
      } catch (err) {
        console.error('Error saving scores:', err);
        inflightCells.current -= cells.length;
        // Re-queue unless the teacher already typed a newer value for the cell
        for (const c of cells) {
          const key = cellKey(c);
          if (!pending.current.has(key)) pending.current.set(key, c);
        }
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        setStatus(offline ? 'offline' : 'error');
        const delay = Math.min(MAX_RETRY_DELAY_MS, 2000 * 2 ** attempts.current);
        attempts.current += 1;
        if (!timer.current) timer.current = setTimeout(() => { void run(); }, delay);
      } finally {
        refreshCount();
      }
    })();
    inflight.current.add(job);
    job.finally(() => inflight.current.delete(job));
    return job;
  }, [refreshCount]);

  const queue = useCallback((cells: QueuedScoreCell[]) => {
    if (cells.length === 0) return;
    for (const c of cells) pending.current.set(cellKey(c), c);
    setStatus(s => (s === 'error' || s === 'offline' ? s : 'pending'));
    refreshCount();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void run(); }, debounceMs);
  }, [debounceMs, refreshCount, run]);

  /** Save everything now and wait. Resolves true when nothing is left unsaved. */
  const flush = useCallback(async (): Promise<boolean> => {
    await run();
    while (inflight.current.size > 0) {
      await Promise.allSettled(Array.from(inflight.current));
    }
    return pending.current.size === 0;
  }, [run]);

  useEffect(() => {
    const onOnline = () => { attempts.current = 0; void run(); };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current.size === 0 && inflightCells.current === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [run]);

  // Leaving the page inside the app: send whatever is still queued (best effort)
  useEffect(() => () => { void run(); }, [run]);

  return { status, unsavedCount, queue, flush };
}
