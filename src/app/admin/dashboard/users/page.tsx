'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Users, GraduationCap, Book, ArrowLeft } from 'lucide-react';

export default function AdminUsers() {
  const router = useRouter();
  const [isDark, setIsDark] = useState(false);
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [touchStartX, setTouchStartX] = useState(0);

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

  // Swipe gesture handlers for back navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    const touchX = e.touches[0].clientX;
    
    // Prevent iOS Safari edge swipe-to-go-back gesture
    if (touchX < 50) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Only allow swipe from left edge (within 50px)
    if (touchX < 50) {
      setTouchStartX(touchX);
      setIsSwiping(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - touchStartX;
    
    // Only track left-to-right swipe
    if (diff > 0) {
      const progress = Math.min(diff / 200, 1); // 200px threshold
      setSwipeProgress(progress);
    }
  };

  const handleTouchEnd = () => {
    if (!isSwiping) return;
    
    // If swiped more than 50% of threshold, go back
    if (swipeProgress > 0.5) {
      router.back();
    }
    
    // Reset state
    setSwipeProgress(0);
    setIsSwiping(false);
    setTouchStartX(0);
  };

  // Trackpad gesture handlers for laptops
  const handleWheel = (e: React.WheelEvent) => {
    // Check if it's a horizontal scroll (trackpad gesture)
    // Mac trackpad: deltaX negative = left-to-right swipe (back gesture)
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && e.deltaX < -50) {
      // Left-to-right scroll - trigger back immediately
      router.back();
    }
  };

  return (
    <div 
      className="p-6"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* Swipe visual feedback */}
      {isSwiping && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: swipeProgress * 0.3 }}
          className="fixed inset-0 bg-black pointer-events-none z-50"
        />
      )}
      
      {/* Swipe indicator arrow */}
      {isSwiping && swipeProgress > 0.1 && (
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: swipeProgress, x: swipeProgress * 100 - 50 }}
          className="fixed left-4 top-1/2 -translate-y-1/2 z-50 pointer-events-none"
        >
          <ArrowLeft size={48} className="text-white opacity-50" />
        </motion.div>
      )}
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
                  จัดการข้อมูลครู
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
                  จัดการข้อมูลนักเรียน
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
                  จัดการข้อมูลวิชาเรียน
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
