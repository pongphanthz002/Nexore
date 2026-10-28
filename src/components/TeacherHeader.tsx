'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';
import { ConfirmDialog } from '@/components/Modal';
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

  console.log('TeacherHeader - userAccount role:', userAccount?.role);

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
        className="fixed top-0 left-0 right-0 z-50 bg-surface px-6 py-4 shadow-neu"
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
                className={`p-3 rounded-xl bg-surface shadow-neu-sm active:shadow-neu-in-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
              >
                <SwitchCamera size={20} />
              </motion.button>
            )}
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              onClick={handleLogout}
              className="p-3 rounded-xl bg-red-500 text-white shadow-neu-sm"
            >
              <LogOut size={20} />
            </motion.button>
          </div>
        </div>
      </motion.div>

      <ConfirmDialog
        open={showSwitchConfirm}
        title="ยืนยันการเปลี่ยน Role"
        message="คุณต้องการเปลี่ยนเป็น Admin Dashboard ใช่ไหม?"
        onConfirm={confirmSwitchRole}
        onClose={() => setShowSwitchConfirm(false)}
      />
      <ConfirmDialog
        open={showLogoutConfirm}
        title="ยืนยันการออกจากระบบ"
        message="คุณต้องการออกจากระบบใช่ไหม?"
        confirmLabel="ออกจากระบบ"
        tone="danger"
        onConfirm={confirmLogout}
        onClose={() => setShowLogoutConfirm(false)}
      />
    </>
  );
};

export default TeacherHeader;
