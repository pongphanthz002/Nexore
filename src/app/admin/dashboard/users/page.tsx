'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Users, GraduationCap, Book } from 'lucide-react';

export default function AdminUsers() {
  const router = useRouter();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));

    // Listen for theme changes
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="p-6">
      {/* Main content */}
      <div className="max-w-4xl mx-auto">

        {/* Menu Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Teachers Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.1 }}
            whileHover={{ scale: 1.02, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push('/admin/dashboard/users/teachers')}
            className={`rounded-2xl p-6 cursor-pointer ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-gray-700' : 'bg-blue-100'}`}>
                <Users size={32} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
              </div>
              <div className="flex-1">
                <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  จัดการครู
                </h2>
                <p className={`text-sm font-light ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Teachers Management
                </p>
              </div>
            </div>
          </motion.div>

          {/* Students Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.2 }}
            whileHover={{ scale: 1.02, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push('/admin/dashboard/users/students')}
            className={`rounded-2xl p-6 cursor-pointer ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-gray-700' : 'bg-blue-100'}`}>
                <GraduationCap size={32} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
              </div>
              <div className="flex-1">
                <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  จัดการนักเรียน
                </h2>
                <p className={`text-sm font-light ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Students Management
                </p>
              </div>
            </div>
          </motion.div>

          {/* Subjects Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.3 }}
            whileHover={{ scale: 1.02, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push('/admin/dashboard/users/subjects')}
            className={`rounded-2xl p-6 cursor-pointer ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-gray-700' : 'bg-blue-100'}`}>
                <Book size={32} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
              </div>
              <div className="flex-1">
                <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  จัดการวิชาเรียน
                </h2>
                <p className={`text-sm font-light ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Subjects Management
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
