'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { firestoreService } from '@/services/firestore.service';

export default function RoleSwitcher() {
  const router = useRouter();
  const { userAccount, setUserAccount, user } = useAuth();
  const [loading, setLoading] = useState(false);

  // Auto-redirect based on single role
  useEffect(() => {
    if (userAccount) {
      if (userAccount.role === 'admin') {
        // Admin can switch to teacher role
        // Show role selection UI (don't auto-redirect)
      } else if (userAccount.role === 'teacher') {
        console.log('Redirecting teacher to teacher dashboard');
        router.push('/teacher/dashboard');
      } else if (userAccount.role === 'student') {
        console.log('Redirecting student to student dashboard');
        router.push('/student/dashboard');
      }
    }
  }, [userAccount, router]);

  const handleSwitchToTeacher = async () => {
    if (!userAccount || !user?.email || !user?.uid) {
      alert('ไม่พบข้อมูลผู้ใช้');
      return;
    }

    setLoading(true);
    try {
      // Update Master Registry to change role to teacher
      await firestoreService.saveUserAccount(
        user.email,
        userAccount.schoolId,
        user.uid,
        'teacher'
      );

      // Update userAccount locally
      const updatedUserAccount = {
        ...userAccount,
        role: 'teacher' as const,
      };
      setUserAccount(updatedUserAccount);

      // Redirect to teacher dashboard
      router.push('/teacher/dashboard');
    } catch (error) {
      console.error('Error switching to teacher role:', error);
      alert('ไม่สามารถเปลี่ยนบทบาทได้');
    } finally {
      setLoading(false);
    }
  };

  if (!userAccount) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white">Loading...</p>
      </div>
    );
  }

  // If admin, show role switch options
  if (userAccount.role === 'admin') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-black-500 border-2 border-neon-glow rounded-xl p-8 max-w-md w-full"
        >
          <h1 className="text-3xl font-bold text-white mb-6 text-center" style={{
            textShadow: '0 0 10px #39ff14, 0 0 20px #39ff14'
          }}>
            เลือกบทบาท
          </h1>
          <p className="text-gray-400 mb-8 text-center">
            คุณเป็น Admin ของโรงเรียน {userAccount.schoolId}
          </p>

          <div className="space-y-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push('/admin/dashboard')}
              className="w-full bg-neon-glow text-black font-bold py-4 rounded-lg hover:bg-neon-bright transition-colors"
            >
              🔐 Admin Dashboard
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSwitchToTeacher}
              disabled={loading}
              className="w-full bg-blue-600 text-white font-bold py-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'กำลังเปลี่ยนบทบาท...' : '👨‍🏫 สลับเป็น Teacher'}
            </motion.button>
          </div>

          <p className="text-gray-500 text-xs mt-6 text-center">
            เมื่อสลับเป็น Teacher คุณจะใช้ฐานข้อมูล School Database เดียวกัน
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-white">Redirecting to {userAccount.role} dashboard...</p>
    </div>
  );
}
