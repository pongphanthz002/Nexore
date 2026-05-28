'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import ScheduleWidget from '@/components/ScheduleWidget';
import { CheckCircle } from 'lucide-react';

export default function TeacherDashboard() {
  const [isDark, setIsDark] = useState(false);
  const router = useRouter();

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

  const handleAttendanceShortcut = () => {
    // TODO: Navigate to attendance page when implemented
    console.log('Attendance shortcut clicked - page not yet implemented');
    // router.push('/teacher/dashboard/attendance');
  };

  return (
    <div className="p-6">
      {/* Main content */}
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Schedule Widget */}
        <ScheduleWidget isDark={isDark} />

        {/* Attendance Shortcut */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.1 }}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleAttendanceShortcut}
          className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg cursor-pointer flex items-center gap-4`}
        >
          <div className={`p-4 rounded-xl ${isDark ? 'bg-green-600/20' : 'bg-green-100'}`}>
            <CheckCircle className={`w-8 h-8 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
          </div>
          <div className="flex-1">
            <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              เช็คชื่อแบบด่วน
            </h3>
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              บันทึกการเข้าเรียนของนักเรียน
            </p>
          </div>
          <div className={`p-2 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              เร็วๆ นี้
            </span>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
