'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function AdminUsers() {
  const router = useRouter();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
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
            transition={{ delay: 0.1 }}
            whileHover={{ scale: 1.02, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push('/admin/dashboard/users/teachers')}
            className={`rounded-3xl p-8 shadow-lg cursor-pointer hover:shadow-xl transition-all ${isDark ? 'bg-gray-800/50 backdrop-blur-lg border border-gray-700' : 'bg-white/50 backdrop-blur-lg border border-white/20'}`}
          >
            <div className="flex flex-col items-center text-center">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${isDark ? 'bg-gray-700' : 'bg-blue-100'}`}>
                <span className="text-4xl">👨‍🏫</span>
              </div>
              <h2 className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-800'}`}>
                จัดการครู
              </h2>
              <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                จัดการข้อมูลครู ดาวน์โหลดและอัพโหลดรายชื่อครู
              </p>
            </div>
          </motion.div>

          {/* Students Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 1.02, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push('/admin/dashboard/users/students')}
            className={`rounded-3xl p-8 shadow-lg cursor-pointer hover:shadow-xl transition-all ${isDark ? 'bg-gray-800/50 backdrop-blur-lg border border-gray-700' : 'bg-white/50 backdrop-blur-lg border border-white/20'}`}
          >
            <div className="flex flex-col items-center text-center">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${isDark ? 'bg-gray-700' : 'bg-blue-100'}`}>
                <span className="text-4xl">👨‍🎓</span>
              </div>
              <h2 className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-800'}`}>
                จัดการนักเรียน
              </h2>
              <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                จัดการข้อมูลนักเรียน ดาวน์โหลดและอัพโหลดรายชื่อนักเรียน
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
