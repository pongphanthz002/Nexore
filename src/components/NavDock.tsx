'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';

/**
 * Bottom navigation for teachers and students. The open menu rises out of the bar into a
 * bubble sitting in a notch; tapping another item slides the bubble over (spring) while the
 * new icon spins in. The notch is a circle in the page colour (bg-gray-50 / dark:bg-gray-900),
 * so pages using this dock keep that background.
 */

export interface NavDockItem {
  icon: LucideIcon;
  path: string;
  label: string;
}

export default function NavDock({ items, home }: { items: NavDockItem[]; home: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const reduce = useReducedMotion();

  // Highlight the tapped item at once while the next page loads
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => { setPending(null); }, [pathname]);
  // router.push does not prefetch like <Link>; load every tab's page ahead of the tap
  useEffect(() => {
    items.forEach(item => router.prefetch(item.path));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const isActive = (path: string) => {
    if (pending) return pending === path;
    return path === home ? pathname === home : pathname.startsWith(path);
  };
  const activeIndex = items.findIndex(item => isActive(item.path));
  const active = items[activeIndex];
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 420, damping: 28 };

  return (
    <motion.nav
      aria-label="เมนูหลัก"
      initial={reduce ? false : { y: 120 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(12px,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto relative mx-auto h-[72px] max-w-md">
        <div className="absolute inset-0 rounded-[26px] border border-gray-200/80 bg-white shadow-[0_12px_32px_-14px_rgb(17_24_39/0.3)] dark:border-gray-700 dark:bg-gray-800 dark:shadow-[0_12px_32px_-14px_rgb(0_0_0/0.7)]" />

        {active && (
          <motion.div
            aria-hidden
            className="absolute inset-y-0 left-0"
            style={{ width: `${100 / items.length}%` }}
            initial={false}
            animate={{ x: `${activeIndex * 100}%` }}
            transition={spring}
          >
            {/* The notch: a page-coloured circle with the bar's hairline, cut to the part inside the bar */}
            <span
              className="absolute left-1/2 top-[-30px] h-[76px] w-[76px] -translate-x-1/2 rounded-full border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900"
              style={{ clipPath: 'inset(30px -2px -2px -2px)' }}
            />
            <span className="absolute left-1/2 top-[-22px] grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full bg-red-500 text-white shadow-[0_8px_18px_-6px_rgb(239_68_68/0.55)]">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={active.path}
                  className="grid place-items-center"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, rotate: -25 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 500, damping: 22, delay: 0.08 }}
                >
                  <active.icon size={24} strokeWidth={1.9} />
                </motion.span>
              </AnimatePresence>
            </span>
          </motion.div>
        )}

        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map(item => {
            const on = isActive(item.path);
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                type="button"
                aria-label={item.label}
                aria-current={on ? 'page' : undefined}
                onClick={() => {
                  if (on) return;
                  setPending(item.path);
                  router.push(item.path);
                }}
                className="flex flex-col items-center justify-end gap-1 pb-3 text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:text-gray-400"
              >
                <motion.span
                  className="grid place-items-center"
                  initial={false}
                  animate={on ? { opacity: 0, y: -14, scale: 0.6 } : { opacity: 1, y: 0, scale: 1 }}
                  transition={reduce ? { duration: 0 } : { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  <Icon size={22} strokeWidth={1.8} />
                </motion.span>
                <span className={`max-w-full truncate px-1 text-[11px] leading-tight transition-colors ${on ? 'font-bold text-red-600 dark:text-red-400' : 'font-medium'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </motion.nav>
  );
}
