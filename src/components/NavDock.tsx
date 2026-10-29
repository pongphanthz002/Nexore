'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';

/**
 * Bottom navigation for teachers and students: a raised bar with a sunken groove, where the
 * open menu is a raised knob (soft UI) that springs between items when another one is tapped.
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
      <div className="pointer-events-auto relative mx-auto h-[76px] max-w-md rounded-[28px] bg-surface p-1.5 shadow-neu-lg">
        <div className="relative h-full rounded-[22px] shadow-neu-in-sm">
          {active && (
            <motion.div
              aria-hidden
              className="absolute inset-y-0 left-0 p-1"
              style={{ width: `${100 / items.length}%` }}
              initial={false}
              animate={{ x: `${activeIndex * 100}%` }}
              transition={spring}
            >
              <span className="block h-full w-full rounded-[18px] bg-surface shadow-neu-sm" />
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
                  className={`relative flex flex-col items-center justify-center gap-1 rounded-[18px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                    on ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <motion.span
                    className="grid place-items-center"
                    initial={false}
                    animate={on ? { y: -1, scale: 1.08 } : { y: 0, scale: 1 }}
                    transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 24 }}
                  >
                    <Icon size={22} strokeWidth={on ? 2.1 : 1.8} />
                  </motion.span>
                  <span className={`max-w-full truncate px-1 text-[11px] leading-tight ${on ? 'font-bold text-red-700 dark:text-red-400' : 'font-medium'}`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
