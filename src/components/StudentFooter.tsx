'use client';

import { motion } from 'framer-motion';
import { useRouter, usePathname } from 'next/navigation';
import { Home, BookOpen, Lightbulb, User } from 'lucide-react';

interface StudentFooterProps {
  isDark: boolean;
}

const StudentFooter = ({ isDark }: StudentFooterProps) => {
  const router = useRouter();
  const pathname = usePathname();

  const menuItems = [
    {
      icon: Home,
      label: 'หน้าหลัก',
      path: '/student/dashboard',
    },
    {
      icon: BookOpen,
      label: 'วิชาเรียน',
      path: '/student/dashboard/subjects',
    },
    {
      icon: Lightbulb,
      label: 'เรียนรู้เพิ่มเติม',
      path: '/student/dashboard/learning',
    },
    {
      icon: User,
      label: 'ข้อมูลส่วนตัว',
      path: '/student/dashboard/profile',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={`fixed bottom-0 left-0 right-0 z-50 border-t px-6 py-3 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-md`}
    >
      <div className="flex items-center justify-around max-w-7xl mx-auto">
        {menuItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <motion.button
              key={item.path}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              onClick={() => router.push(item.path)}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors ${
                isActive
                  ? isDark
                    ? 'bg-indigo-600 text-white'
                    : 'bg-indigo-500 text-white'
                  : isDark
                  ? 'text-gray-400 hover:bg-gray-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <item.icon size={20} />
              <span className="text-xs font-medium">{item.label}</span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
};

export default StudentFooter;
