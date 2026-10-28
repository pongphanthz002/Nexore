'use client';

import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';

export default function AdditionalPage() {
  const { isDark } = useTheme();

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
        >
          <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-4`}>
            ระบบเพิ่มเติม
          </h1>
          <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
            หน้านี้สำหรับระบบเพิ่มเติมอื่นๆ
          </p>
        </motion.div>
      </div>
    </div>
  );
}
