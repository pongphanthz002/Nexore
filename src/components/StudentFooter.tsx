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
    { icon: Home,      path: '/student/dashboard' },
    { icon: BookOpen,  path: '/student/dashboard/subjects' },
    { icon: Lightbulb, path: '/student/dashboard/learning' },
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
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              onClick={() => router.push(item.path)}
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

export default StudentFooter;
