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
    <div className="no-scroll bg-white flex items-center justify-center relative">
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
          <h1 className="text-5xl font-bold text-black mb-4 tracking-wider">
            NEXORE
          </h1>
          <p className="text-gray-500 text-lg tracking-widest">
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
            onClick={() => handleRoleSelect('student')}
            className="w-full bg-gray-500 text-white rounded-lg p-6 text-center hover:bg-[#000000] hover:scale-105 transition-all duration-150 shadow-md"
          >
            <h2 className="text-2xl font-bold mb-2">
              นักเรียน
            </h2>
            <p className="text-sm opacity-90">
              เข้าถึงแหล่งเรียนรู้ ตรวจสอบคะแนน และดูเวลาเรียน
            </p>
          </motion.button>

          {/* Teacher Card */}
          <motion.button
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            onClick={() => handleRoleSelect('teacher')}
            className="w-full bg-gray-500 text-white rounded-lg p-6 text-center hover:bg-[#000000] hover:scale-105 transition-all duration-150 shadow-md"
          >
            <h2 className="text-2xl font-bold mb-2">
              ครู
            </h2>
            <p className="text-sm opacity-90">
              บันทึกคะแนน เช็คชื่อ และอัพสื่อการเรียนรู้
            </p>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
