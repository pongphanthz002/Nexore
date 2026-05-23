'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { storageService } from '@/services/storage.service';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function TeacherDashboard() {
  const router = useRouter();
  const { userAccount, signOut } = useAuth();
  const [schoolName, setSchoolName] = useState<string>('');

  useEffect(() => {
    if (userAccount) {
      // Get school name from storage or userAccount
      const getSchoolName = async () => {
        try {
          const config = await storageService.getMasterRegistryConfig();
          if (config?.schoolName) {
            setSchoolName(config.schoolName);
          }
        } catch (error) {
          console.error('Error getting school name:', error);
        }
      };
      getSchoolName();
    }
  }, [userAccount]);

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-black overflow-hidden relative">
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
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute w-96 h-96 bg-neon-glow rounded-full blur-3xl opacity-20 top-0 right-0"
      />

      <div className="relative z-10 p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h1 className="text-3xl font-bold text-white" style={{
              textShadow: '0 0 10px #39ff14, 0 0 20px #39ff14'
            }}>
              TEACHER DASHBOARD
            </h1>
            <p className="text-neon-glow text-sm tracking-widest">
              WELCOME BACK
            </p>
            {schoolName && (
              <p className="text-gray-400 text-xs mt-1">
                🏫 {schoolName}
              </p>
            )}
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleLogout}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            Logout
          </motion.button>
          {userAccount?.role === 'admin' && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push('/admin/dashboard')}
              className="bg-neon-glow text-black px-4 py-2 rounded-lg hover:bg-neon-bright transition-colors font-bold"
            >
              Switch to Admin
            </motion.button>
          )}
        </motion.div>

        {/* School ID Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-black-500 border-2 border-neon-glow rounded-xl p-6 mb-6"
        >
          <h2 className="text-xl font-bold text-white mb-4">
            🏫 School ID
          </h2>
          <p className="text-gray-400 mb-4">
            ใช้ School ID นี้เพื่อให้นักเรียนเชื่อมต่อกับโรงเรียน
          </p>
          <div className="bg-black-400 border border-gray-600 rounded-lg p-6 text-center">
            <p className="text-neon-glow text-3xl font-bold tracking-widest">
              {userAccount?.schoolId || 'Loading...'}
            </p>
          </div>
        </motion.div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{ scale: 1.02, boxShadow: '0 0 20px rgba(57, 255, 20, 0.3)' }}
            className="bg-black-500 border-2 border-neon-glow rounded-xl p-6 cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white group-hover:text-neon-glow transition-colors">
                📝 บันทึกคะแนน
              </h3>
              <span className="text-3xl">📊</span>
            </div>
            <p className="text-gray-400 text-sm">
              บันทึกและจัดการคะแนนนักเรียน
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            whileHover={{ scale: 1.02, boxShadow: '0 0 20px rgba(57, 255, 20, 0.3)' }}
            className="bg-black-500 border-2 border-neon-glow rounded-xl p-6 cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white group-hover:text-neon-glow transition-colors">
                ✅ เช็คชื่อ
              </h3>
              <span className="text-3xl">📋</span>
            </div>
            <p className="text-gray-400 text-sm">
              บันทึกการเข้าเรียนของนักเรียน
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            whileHover={{ scale: 1.02, boxShadow: '0 0 20px rgba(57, 255, 20, 0.3)' }}
            className="bg-black-500 border-2 border-neon-glow rounded-xl p-6 cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white group-hover:text-neon-glow transition-colors">
                📤 อัพสื่อการเรียนรู้
              </h3>
              <span className="text-3xl">🎬</span>
            </div>
            <p className="text-gray-400 text-sm">
              อัพโหลดสื่อการเรียนรู้และวัสดุการสอน
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
            whileHover={{ scale: 1.02, boxShadow: '0 0 20px rgba(57, 255, 20, 0.3)' }}
            className="bg-black-500 border-2 border-neon-glow rounded-xl p-6 cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white group-hover:text-neon-glow transition-colors">
                👥 จัดการนักเรียน
              </h3>
              <span className="text-3xl">👨‍🎓</span>
            </div>
            <p className="text-gray-400 text-sm">
              ดูและจัดการข้อมูลนักเรียน
            </p>
          </motion.div>
        </div>
      </div>

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
