'use client';

import { motion } from 'framer-motion';

export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden relative">
      {/* Animated background grid */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(57, 255, 20, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(57, 255, 20, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          animation: 'gridMove 20s linear infinite'
        }} />
      </div>

      {/* Glowing orbs */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute w-96 h-96 bg-neon-glow rounded-full blur-3xl opacity-20"
      />
      <motion.div
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: 2.5,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute w-64 h-64 bg-neon-bright rounded-full blur-3xl opacity-20"
        style={{ animationDelay: '0.5s' }}
      />

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
          <div className="w-24 h-24 mx-auto border-4 border-neon-glow rounded-full flex items-center justify-center shadow-neon">
            <div className="w-16 h-16 border-2 border-neon-bright rounded-full flex items-center justify-center">
              <div className="w-8 h-8 bg-neon-glow rounded-full shadow-neon-strong" />
            </div>
          </div>
        </motion.div>

        {/* App name */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="text-6xl font-bold text-white mb-4 tracking-wider"
          style={{
            textShadow: '0 0 10px #39ff14, 0 0 20px #39ff14, 0 0 40px #39ff14'
          }}
        >
          NEXORE
        </motion.h1>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="text-neon-glow text-lg mb-8 tracking-widest"
        >
          LEARNING MANAGEMENT SYSTEM
        </motion.p>

        {/* Loading bar */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ duration: 2, ease: "easeInOut" }}
          className="w-64 h-1 bg-black-500 mx-auto rounded-full overflow-hidden"
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
            className="h-full bg-gradient-to-r from-transparent via-neon-glow to-transparent"
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
          className="text-gray-500 text-sm mt-4 tracking-wider"
        >
          INITIALIZING SYSTEM...
        </motion.p>
      </motion.div>

      <style jsx>{`
        @keyframes gridMove {
          0% {
            transform: translate(0, 0);
          }
          100% {
            transform: translate(50px, 50px);
          }
        }
      `}</style>
    </div>
  );
}
