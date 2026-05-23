'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

export default function RoleSelection() {
  const router = useRouter();

  const handleRoleSelect = (role: 'student' | 'teacher') => {
    router.push(`/setup/${role}`);
  };

  const handleAdminSetup = () => {
    router.push('/setup/admin');
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden relative">
      {/* Animated background grid */}
      <div className="absolute inset-0 opacity-10">
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
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute w-96 h-96 bg-neon-glow rounded-full blur-3xl opacity-20"
      />

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 w-full max-w-md p-6"
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl font-bold text-white mb-4 tracking-wider" style={{
            textShadow: '0 0 10px #39ff14, 0 0 20px #39ff14'
          }}>
            NEXORE
          </h1>
          <p className="text-neon-glow text-lg tracking-widest">
            SELECT YOUR ROLE
          </p>
        </motion.div>

        {/* Role cards */}
        <div className="space-y-4">
          {/* Student Card */}
          <motion.button
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            whileHover={{ scale: 1.02, boxShadow: '0 0 20px rgba(57, 255, 20, 0.3)' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleRoleSelect('student')}
            className="w-full bg-black-500 border-2 border-neon-glow rounded-xl p-6 text-left group hover:bg-black-400 transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2 group-hover:text-neon-glow transition-colors">
                  นักเรียน
                </h2>
                <p className="text-gray-400 text-sm">
                  เข้าถึงแหล่งเรียนรู้ ตรวจสอบคะแนน และดูเวลาเรียน
                </p>
              </div>
              <motion.div
                whileHover={{ rotate: 90 }}
                transition={{ duration: 0.3 }}
                className="text-4xl"
              >
                👨‍🎓
              </motion.div>
            </div>
          </motion.button>

          {/* Teacher Card */}
          <motion.button
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            whileHover={{ scale: 1.02, boxShadow: '0 0 20px rgba(57, 255, 20, 0.3)' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleRoleSelect('teacher')}
            className="w-full bg-black-500 border-2 border-neon-glow rounded-xl p-6 text-left group hover:bg-black-400 transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2 group-hover:text-neon-glow transition-colors">
                  ครู
                </h2>
                <p className="text-gray-400 text-sm">
                  บันทึกคะแนน เช็คชื่อ และอัพสื่อการเรียนรู้
                </p>
              </div>
              <motion.div
                whileHover={{ rotate: 90 }}
                transition={{ duration: 0.3 }}
                className="text-4xl"
              >
                👨‍🏫
              </motion.div>
            </div>
          </motion.button>

          {/* Admin Setup Button */}
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleAdminSetup}
            className="w-full mt-8 text-gray-500 text-sm hover:text-neon-glow transition-colors"
          >
            เริ่มต้นใหม่ (Admin Setup)
          </motion.button>
        </div>
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
