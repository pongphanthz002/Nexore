'use client';

import { GraduationCap, Clock, Home, Settings, User } from 'lucide-react';
import NavDock, { type NavDockItem } from '@/components/NavDock';

const ITEMS: NavDockItem[] = [
  { icon: GraduationCap, path: '/teacher/dashboard/grades', label: 'คะแนน' },
  { icon: Clock, path: '/teacher/dashboard/schedules', label: 'เช็คชื่อ' },
  { icon: Home, path: '/teacher/dashboard', label: 'หน้าหลัก' },
  { icon: Settings, path: '/teacher/dashboard/additional', label: 'เพิ่มเติม' },
  { icon: User, path: '/teacher/dashboard/profile', label: 'โปรไฟล์' },
];

/** Teacher bottom navigation (see NavDock). `isDark` is kept for callers; the dock follows html.dark. */
export default function TeacherDock(_props: { isDark?: boolean }) {
  return <NavDock items={ITEMS} home="/teacher/dashboard" />;
}
