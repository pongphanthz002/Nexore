'use client';

import { motion } from 'framer-motion';

export default function SkeletonLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header Skeleton */}
        <div className="mb-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4"
          />
        </div>

        {/* Stats Cards Skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg"
            >
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-4" />
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
            </motion.div>
          ))}
        </div>

        {/* Pie Chart Skeleton */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg mb-8"
        >
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-6" />
          <div className="flex justify-center">
            <div className="w-48 h-48 bg-gray-200 dark:bg-gray-700 rounded-full" />
          </div>
        </motion.div>

        {/* Menu Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 + i * 0.1 }}
              className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg"
            >
              <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-full w-12 mb-4" />
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
            </motion.div>
          ))}
        </div>

        {/* Loading Text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-center mt-8"
        >
          <p className="text-gray-500 dark:text-gray-400">กำลังโหลดข้อมูล...</p>
        </motion.div>
      </div>
    </div>
  );
}
