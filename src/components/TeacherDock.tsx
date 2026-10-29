'use client';

import { GraduationCap, Clock, Home, Settings, User } from 'lucide-react';
import NavDock, { type NavDockItem } from '@/components/NavDock';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';

const EXTRA = '/teacher/dashboard/additional';

const ITEMS: NavDockItem[] = [
  { icon: GraduationCap, path: '/teacher/dashboard/grades', label: 'คะแนน' },
  { icon: Clock, path: '/teacher/dashboard/schedules', label: 'เช็คชื่อ' },
  { icon: Home, path: '/teacher/dashboard', label: 'หน้าหลัก' },
  { icon: Settings, path: EXTRA, label: 'เพิ่มเติม' },
  { icon: User, path: '/teacher/dashboard/profile', label: 'โปรไฟล์' },
];

/**
 * Teacher bottom navigation (see NavDock). "เพิ่มเติม" shows only when the admin gave this teacher
 * at least one extra feature. `isDark` is kept for callers; the dock follows html.dark.
 */
export default function TeacherDock(_props: { isDark?: boolean }) {
  const { anyFor } = useFeatureAccess();
  const items = anyFor('teacher') ? ITEMS : ITEMS.filter(i => i.path !== EXTRA);
  return <NavDock items={items} home="/teacher/dashboard" />;
}
