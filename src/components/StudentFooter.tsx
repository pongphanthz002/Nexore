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
    { icon: BookOpen,  path: '/student/dashboard/subjects' },
    { icon: Lightbulb, path: '/student/dashboard/learning' },
    { icon: Home,      path: '/student/dashboard' },          // center
    { icon: User,      path: '/student/dashboard/profile' },
  ];

  const isActive = (path: string) => {
    if (path === '/student/dashboard') {
      return pathname === '/student/dashboard';
    }
    return pathname.startsWith(path);
  };

  return (
    <motion.div
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={`fixed bottom-0 left-0 right-0 z-50 border-t px-6 py-4 ${
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
      } shadow-md`}
    >
      <div className="flex items-center justify-around max-w-7xl mx-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          const isHome = item.path === '/student/dashboard';

          return (
            <motion.button
              key={item.path}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              onClick={() => router.push(item.path)}
              className={`flex flex-col items-center gap-1 rounded-xl transition-colors ${
                isHome
                  ? `p-3 ${active ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`
                  : `p-2 ${active ? 'text-red-500 font-bold' : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-900'}`
              }`}
            >
              <Icon size={active ? (isHome ? 26 : 28) : (isHome ? 24 : 22)} />
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
};

export default StudentFooter;
