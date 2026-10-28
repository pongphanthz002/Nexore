'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { GraduationCap, Clock, Home, Settings, User } from 'lucide-react';

interface TeacherDockProps {
  isDark: boolean;
}

const TeacherDock = ({ isDark }: TeacherDockProps) => {
  const router = useRouter();
  const pathname = usePathname();

  const menuItems = [
    { icon: GraduationCap, path: '/teacher/dashboard/grades', label: 'คะแนน' },
    { icon: Clock, path: '/teacher/dashboard/schedules', label: 'เช็คชื่อ' },
    { icon: Home, path: '/teacher/dashboard', label: 'หน้าหลัก' },
    { icon: Settings, path: '/teacher/dashboard/additional', label: 'ระบบเพิ่มเติม' },
    { icon: User, path: '/teacher/dashboard/profile', label: 'โปรไฟล์' },
  ];

  // Highlight the tapped item at once while the next page loads
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => { setPending(null); }, [pathname]);
  // router.push does not prefetch like <Link>; load every tab's page ahead of the tap
  useEffect(() => {
    menuItems.forEach(item => router.prefetch(item.path));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const isActive = (path: string) => {
    if (pending) return pending === path;
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
      className={`fixed bottom-0 left-0 right-0 z-50 border-t px-6 py-3.5 ${
        isDark ? 'bg-gray-800/95 border-gray-700/80' : 'bg-white/95 border-gray-100'
      } backdrop-blur-lg shadow-lg`}
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          return (
            <motion.button
              key={item.path}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              type="button"
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                if (active) return;
                setPending(item.path);
                router.push(item.path);
              }}
              className={`p-3 rounded-2xl transition-all flex items-center justify-center ${
                active 
                  ? 'bg-red-500 text-white shadow-md shadow-red-500/30' 
                  : isDark 
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50' 
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/80'
              }`}
            >
              <Icon size={24} />
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
};

export default TeacherDock;
