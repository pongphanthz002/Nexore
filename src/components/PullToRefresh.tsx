'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDown, Loader2 } from 'lucide-react';

/** Pull distance (after resistance) that triggers a refresh, and the furthest the knob travels. */
const THRESHOLD = 64;
const MAX_PULL = 96;

interface PullToRefreshProps {
  /** Re-read the page's data; the spinner shows until it settles. */
  onRefresh: () => Promise<unknown> | void;
  disabled?: boolean;
}

/**
 * Pull down from the top of the page to refresh (touch only). Renders a raised knob under the
 * fixed header; the page itself doesn't move. Mount once per screen. Pulls that start inside a
 * popup, a horizontal scroller or `[data-no-pull]` are ignored.
 */
export default function PullToRefresh({ onRefresh, disabled = false }: PullToRefreshProps) {
  const reduce = useReducedMotion();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const busy = useRef(false);

  useEffect(() => {
    // The browser's own pull-to-refresh is already off (overscroll-behavior: none in globals.css)
    if (disabled) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let pulling = false;
    let distance = 0;

    const onStart = (e: TouchEvent) => {
      tracking = false;
      if (busy.current || e.touches.length !== 1 || window.scrollY > 0) return;
      const target = e.target as Element | null;
      if (target?.closest('[role="dialog"], [data-no-pull], input, textarea, select')) return;
      if (document.body.style.overflow === 'hidden') return; // a popup has locked the page
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
      pulling = false;
      distance = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!pulling) {
        // Decide once the finger has moved: a sideways or upward move is not a pull
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0) { tracking = false; return; }
        pulling = true;
      }
      if (e.cancelable) e.preventDefault(); // keep the page still while pulling
      distance = Math.min(MAX_PULL, Math.max(0, dy) * 0.5);
      setPull(distance);
    };

    const onEnd = async () => {
      if (!tracking) return;
      tracking = false;
      if (!pulling) return;
      pulling = false;
      if (distance < THRESHOLD) { setPull(0); return; }
      busy.current = true;
      setRefreshing(true);
      setPull(THRESHOLD);
      try {
        await refreshRef.current();
      } catch (err) {
        console.error('Pull to refresh failed:', err);
      } finally {
        busy.current = false;
        setRefreshing(false);
        setPull(0);
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [disabled]);

  const progress = Math.min(1, pull / THRESHOLD);
  const ready = progress >= 1;
  const visible = pull > 0 || refreshing;

  return (
    <>
      <motion.div
        aria-hidden
        initial={false}
        animate={{ y: visible ? pull - 8 : -56, opacity: visible ? Math.max(progress, refreshing ? 1 : 0) : 0 }}
        transition={pull > 0 && !refreshing ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
        className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+72px)] z-40 -ml-5 grid h-10 w-10 place-items-center rounded-full bg-surface text-gray-600 shadow-neu-sm dark:text-gray-300"
      >
        {refreshing ? (
          <Loader2 size={20} className="animate-spin motion-reduce:animate-none" />
        ) : (
          <motion.span
            animate={{ rotate: ready ? 180 : 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.18 }}
            className={`flex ${ready ? 'text-red-600 dark:text-red-400' : ''}`}
          >
            <ArrowDown size={20} />
          </motion.span>
        )}
      </motion.div>
      <span role="status" className="sr-only">{refreshing ? 'กำลังโหลดข้อมูลใหม่' : ''}</span>
    </>
  );
}
