'use client';

import { Home, BookOpen, Lightbulb, User } from 'lucide-react';
import NavDock, { type NavDockItem } from '@/components/NavDock';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';

const LEARNING = '/student/dashboard/learning';

const ITEMS: NavDockItem[] = [
  { icon: Home, path: '/student/dashboard', label: 'หน้าหลัก' },
  { icon: BookOpen, path: '/student/dashboard/subjects', label: 'วิชาเรียน' },
  { icon: Lightbulb, path: LEARNING, label: 'การเรียนรู้' },
  { icon: User, path: '/student/dashboard/profile', label: 'โปรไฟล์' },
];

/**
 * Student bottom navigation (see NavDock). "การเรียนรู้" shows only when the admin opened a
 * student feature to this student. `isDark` is kept for callers; the dock follows html.dark.
 */
export default function StudentFooter(_props: { isDark?: boolean }) {
  const { anyFor } = useFeatureAccess();
  const items = anyFor('student') ? ITEMS : ITEMS.filter(i => i.path !== LEARNING);
  return <NavDock items={items} home="/student/dashboard" />;
}
