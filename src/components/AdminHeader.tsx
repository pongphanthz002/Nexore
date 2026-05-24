'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';
import { LogOut, SwitchCamera } from 'lucide-react';
import { useState } from 'react';

interface AdminHeaderProps {
  isDark: boolean;
  toggleTheme: () => void;
}

const AdminHeader = ({ isDark, toggleTheme }: AdminHeaderProps) => {
  const router = useRouter();
  const { signOut } = useAuth();
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleSwitchRole = () => {
    setShowSwitchConfirm(true);
  };

  const confirmSwitchRole = () => {
    setShowSwitchConfirm(false);
    router.push('/teacher/dashboard');
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
        className={`fixed top-0 left-0 right-0 z-50 ${isDark ? 'bg-gray-900/80' : 'bg-white/80'} backdrop-blur-lg border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} px-6 py-4`}
      >
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Logo */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push('/admin/dashboard')}
            className="flex flex-col items-start"
          >
            <span className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>NEXORE</span>
            <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>ADMIN</span>
          </motion.button>

          {/* Right side controls */}
          <div className="flex items-center gap-4">
            <ThemeToggle isDark={isDark} toggle={toggleTheme} />
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSwitchRole}
              className={`p-3 rounded-2xl ${isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} transition-all`}
            >
              <SwitchCamera size={20} />
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleLogout}
              className="p-3 rounded-2xl bg-red-500 text-white hover:bg-red-600 transition-all"
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
            className={`rounded-3xl p-6 max-w-md w-full shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}
          >
            <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'} mb-2`}>
              ยืนยันการเปลี่ยน Role
            </h3>
            <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>
              คุณต้องการเปลี่ยนเป็น Teacher Dashboard ใช่ไหม?
            </p>
            <div className="flex gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowSwitchConfirm(false)}
                className={`flex-1 py-3 rounded-2xl ${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} transition-all`}
              >
                ยกเลิก
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={confirmSwitchRole}
                className="flex-1 bg-blue-500 text-white py-3 rounded-2xl hover:bg-blue-600 transition-all"
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
            className={`rounded-3xl p-6 max-w-md w-full shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}
          >
            <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'} mb-2`}>
              ยืนยันการออกจากระบบ
            </h3>
            <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>
              คุณต้องการออกจากระบบใช่ไหม?
            </p>
            <div className="flex gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowLogoutConfirm(false)}
                className={`flex-1 py-3 rounded-2xl ${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} transition-all`}
              >
                ยกเลิก
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={confirmLogout}
                className="flex-1 bg-red-500 text-white py-3 rounded-2xl hover:bg-red-600 transition-all"
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

export default AdminHeader;
