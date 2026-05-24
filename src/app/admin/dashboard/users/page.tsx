'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Teachers Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.1 }}
            whileHover={{ scale: 1.02, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push('/admin/dashboard/users/teachers')}
            className={`rounded-2xl p-8 cursor-pointer ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
          >
            <div className="flex flex-col items-center text-center">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${isDark ? 'bg-gray-700' : 'bg-blue-100'}`}>
                <span className="text-4xl">👨‍🏫</span>
              </div>
              <h2 className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                จัดการครู
              </h2>
              <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                จัดการข้อมูลครู ดาวน์โหลดและอัพโหลดรายชื่อครู
              </p>
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
            className={`rounded-2xl p-8 cursor-pointer ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
          >
            <div className="flex flex-col items-center text-center">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${isDark ? 'bg-gray-700' : 'bg-blue-100'}`}>
                <span className="text-4xl">👨‍🎓</span>
              </div>
              <h2 className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                จัดการนักเรียน
              </h2>
              <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                จัดการข้อมูลนักเรียน ดาวน์โหลดและอัพโหลดรายชื่อนักเรียน
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
