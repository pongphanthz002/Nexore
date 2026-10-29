'use client';

import { Home, BookOpen, Lightbulb, User } from 'lucide-react';
import NavDock, { type NavDockItem } from '@/components/NavDock';

const ITEMS: NavDockItem[] = [
  { icon: Home, path: '/student/dashboard', label: 'หน้าหลัก' },
  { icon: BookOpen, path: '/student/dashboard/subjects', label: 'วิชาเรียน' },
  { icon: Lightbulb, path: '/student/dashboard/learning', label: 'การเรียนรู้' },
  { icon: User, path: '/student/dashboard/profile', label: 'โปรไฟล์' },
];

/** Student bottom navigation (see NavDock). `isDark` is kept for callers; the dock follows html.dark. */
export default function StudentFooter(_props: { isDark?: boolean }) {
  return <NavDock items={ITEMS} home="/student/dashboard" />;
}
