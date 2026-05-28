'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export default function AdditionalPage() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));

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
