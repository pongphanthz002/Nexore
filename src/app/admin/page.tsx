'use client';

import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">กำลังโหลด...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 to-purple-100 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto"
      >
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <h1 className="text-3xl font-bold text-purple-600 mb-2">สวัสดี, ผู้ดูแลระบบ</h1>
          <p className="text-gray-600">ยินดีต้อนรับสู่ระบบ Nexore</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white rounded-xl shadow-lg p-6 cursor-pointer"
          >
            <h2 className="text-xl font-semibold mb-2">👥 จัดการผู้ใช้</h2>
            <p className="text-gray-600">จัดการข้อมูลนักเรียนและครู</p>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white rounded-xl shadow-lg p-6 cursor-pointer"
          >
            <h2 className="text-xl font-semibold mb-2">🏫 จัดการห้องเรียน</h2>
            <p className="text-gray-600">สร้างและจัดการห้องเรียน</p>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white rounded-xl shadow-lg p-6 cursor-pointer"
          >
            <h2 className="text-xl font-semibold mb-2">📊 รายงาน</h2>
            <p className="text-gray-600">ดูรายงานและสถิติระบบ</p>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white rounded-xl shadow-lg p-6 cursor-pointer"
          >
            <h2 className="text-xl font-semibold mb-2">⚙️ ตั้งค่าระบบ</h2>
            <p className="text-gray-600">ตั้งค่าและกำหนดค่าระบบ</p>
          </motion.div>
        </div>
      </motion.div>
    </main>
  );
}
