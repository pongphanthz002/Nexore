'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';
import { LogOut, SwitchCamera } from 'lucide-react';
import { useState } from 'react';

interface TeacherHeaderProps {
  isDark: boolean;
  toggleTheme: () => void;
}

const TeacherHeader = ({ isDark, toggleTheme }: TeacherHeaderProps) => {
  const router = useRouter();
  const { signOut, userAccount } = useAuth();
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleSwitchRole = () => {
    setShowSwitchConfirm(true);
  };

  const confirmSwitchRole = () => {
    setShowSwitchConfirm(false);
    router.push('/admin/dashboard');
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    await signOut();
    router.push('/');
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={`fixed top-0 left-0 right-0 z-50 border-b px-6 py-4 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-md`}
      >
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Logo */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={() => router.push('/teacher/dashboard')}
            className="flex flex-col items-start"
          >
            <span className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>NEXORE</span>
            <span className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{userAccount?.name || 'TEACHER'}</span>
          </motion.button>

          {/* Right side controls */}
          <div className="flex items-center gap-4">
            <ThemeToggle isDark={isDark} toggle={toggleTheme} />
            
            {userAccount?.role === 'admin' && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                onClick={handleSwitchRole}
                className={`p-3 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
              >
                <SwitchCamera size={20} />
              </motion.button>
            )}
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              onClick={handleLogout}
              className="p-3 rounded-xl bg-red-500 text-white"
            >
              <LogOut size={20} />
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Switch Role Confirmation Dialog */}
      {showSwitchConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={`rounded-2xl p-6 max-w-md w-full ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
          >
            <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>
              ยืนยันการเปลี่ยน Role
            </h3>
            <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
              คุณต้องการเปลี่ยนเป็น Admin Dashboard ใช่ไหม?
            </p>
            <div className="flex gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                onClick={() => setShowSwitchConfirm(false)}
                className={`flex-1 py-3 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
              >
                ยกเลิก
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                onClick={confirmSwitchRole}
                className="flex-1 bg-blue-500 text-white py-3 rounded-xl"
              >
                ยืนยัน
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Logout Confirmation Dialog */}
      {showLogoutConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={`rounded-2xl p-6 max-w-md w-full ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
          >
            <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>
              ยืนยันการออกจากระบบ
            </h3>
            <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
              คุณต้องการออกจากระบบใช่ไหม?
            </p>
            <div className="flex gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                onClick={() => setShowLogoutConfirm(false)}
                className={`flex-1 py-3 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
              >
                ยกเลิก
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                onClick={confirmLogout}
                className="flex-1 bg-red-500 text-white py-3 rounded-xl"
              >
                ยืนยัน
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  );
};

export default TeacherHeader;
