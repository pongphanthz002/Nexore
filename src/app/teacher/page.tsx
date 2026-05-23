'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function TeacherPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">กำลังโหลด...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto"
      >
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-green-600 mb-2">สวัสดี, ครู</h1>
            <p className="text-gray-600">ยินดีต้อนรับสู่ระบบ Nexore</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white rounded-xl shadow-lg p-6 cursor-pointer"
          >
            <h2 className="text-xl font-semibold mb-2">📝 บันทึกคะแนน</h2>
            <p className="text-gray-600">บันทึกและจัดการคะแนนนักเรียน</p>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white rounded-xl shadow-lg p-6 cursor-pointer"
          >
            <h2 className="text-xl font-semibold mb-2">✅ เช็คชื่อ</h2>
            <p className="text-gray-600">บันทึกการเข้าเรียนของนักเรียน</p>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white rounded-xl shadow-lg p-6 cursor-pointer"
          >
            <h2 className="text-xl font-semibold mb-2">📤 อัพสื่อการเรียนรู้</h2>
            <p className="text-gray-600">อัพโหลดสื่อการเรียนรู้และวัสดุการสอน</p>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white rounded-xl shadow-lg p-6 cursor-pointer"
          >
            <h2 className="text-xl font-semibold mb-2">👥 จัดการนักเรียน</h2>
            <p className="text-gray-600">ดูและจัดการข้อมูลนักเรียน</p>
          </motion.div>
        </div>
      </motion.div>
    </main>
  );
}
