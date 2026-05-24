'use client';

import { motion } from 'framer-motion';

export default function LoadingScreen() {
  return (
    <div className="no-scroll bg-white flex items-center justify-center relative">
      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 text-center"
      >
        {/* Logo */}
        <motion.div
          animate={{
            rotate: 360,
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "linear"
          }}
          className="mb-8"
        >
          <div className="w-24 h-24 mx-auto border-4 border-black rounded-full flex items-center justify-center">
            <div className="w-16 h-16 border-2 border-gray-400 rounded-full flex items-center justify-center">
              <div className="w-8 h-8 bg-black rounded-full" />
            </div>
          </div>
        </motion.div>

        {/* App name */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="text-6xl font-bold text-black mb-4 tracking-wider"
        >
          NEXORE
        </motion.h1>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="text-gray-500 text-lg mb-8 tracking-widest"
        >
          LEARNING MANAGEMENT SYSTEM
        </motion.p>

        {/* Loading bar */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ duration: 2, ease: "easeInOut" }}
          className="w-64 h-1 bg-gray-200 mx-auto rounded-full overflow-hidden"
        >
          <motion.div
            animate={{
              x: ['-100%', '100%']
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "linear"
            }}
            className="h-full bg-gradient-to-r from-transparent via-black to-transparent"
          />
        </motion.div>

        {/* Loading text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="text-gray-400 text-sm mt-4 tracking-wider"
        >
          INITIALIZING SYSTEM...
        </motion.p>
      </motion.div>
    </div>
  );
}
