'use client';

import { motion } from 'framer-motion';
import { useRouter, usePathname } from 'next/navigation';
import { GraduationCap, Clock, Home, Settings, User } from 'lucide-react';

interface TeacherDockProps {
  isDark: boolean;
}

const TeacherDock = ({ isDark }: TeacherDockProps) => {
  const router = useRouter();
  const pathname = usePathname();

  const menuItems = [
    { icon: GraduationCap, label: 'จัดการคะแนน', path: '/teacher/dashboard/grades' },
    { icon: Clock, label: 'จัดการเวลาเรียน', path: '/teacher/dashboard/schedules' },
    { icon: Home, label: 'หน้าหลัก', path: '/teacher/dashboard' },
    { icon: Settings, label: 'ระบบเพิ่มเติม', path: '/teacher/dashboard/additional' },
    { icon: User, label: 'ข้อมูลส่วนตัว', path: '/teacher/dashboard/profile' },
  ];

  const isActive = (path: string) => {
    if (path === '/teacher/dashboard') {
      return pathname === '/teacher/dashboard';
    }
    return pathname.startsWith(path);
  };

  return (
    <motion.div
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={`fixed bottom-0 left-0 right-0 z-50 border-t px-6 py-4 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-md`}
    >
      <div className="flex items-center justify-around max-w-7xl mx-auto">
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          return (
            <motion.button
              key={item.path}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              onClick={() => router.push(item.path)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
                active 
                  ? 'text-blue-500' 
                  : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon size={active ? 32 : 24} />
              <span className="text-xs">{item.label}</span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
};

export default TeacherDock;
