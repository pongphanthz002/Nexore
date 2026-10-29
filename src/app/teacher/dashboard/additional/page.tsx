'use client';

import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, Dices, Settings, type LucideIcon } from 'lucide-react';
import ComingSoon from '@/components/ComingSoon';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { featuresFor, type FeatureId } from '@/lib/feature-access';

/** Where each teacher feature opens and its icon. */
const ROUTES: Partial<Record<FeatureId, { href: string; icon: LucideIcon }>> = {
  classroomTools: { href: '/teacher/dashboard/additional/classroom', icon: Dices },
};

/** Teacher "เพิ่มเติม": one card per extra feature the admin opened to this teacher. */
export default function AdditionalPage() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { can } = useFeatureAccess();
  const features = featuresFor('teacher').filter(f => can(f.id) && ROUTES[f.id]);

  return (
    <div className="px-4 pt-2 text-gray-900 sm:px-6 dark:text-gray-50">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold">เพิ่มเติม</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">เครื่องมือเสริมสำหรับการสอน</p>
        </header>
        {features.length === 0 ? (
          <ComingSoon icon={Settings} title="ระบบเพิ่มเติม" message="ยังไม่มีระบบที่เปิดให้ใช้งาน" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {features.map((f, i) => {
              const route = ROUTES[f.id]!;
              const Icon = route.icon;
              return (
                <motion.button
                  key={f.id}
                  type="button"
                  onClick={() => router.push(route.href)}
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-4 rounded-[24px] bg-surface p-5 text-left shadow-neu-lg transition-shadow active:shadow-neu-in-sm"
                >
                  <span className="grid h-14 w-14 flex-none place-items-center rounded-2xl text-red-600 shadow-neu-in-sm dark:text-red-400">
                    <Icon size={26} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold leading-tight">{f.title}</span>
                    <span className="mt-0.5 block text-sm text-gray-500 dark:text-gray-400">{f.description}</span>
                  </span>
                  <ChevronRight size={20} className="flex-none text-gray-400" />
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
