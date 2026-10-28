'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';
import { ConfirmDialog } from '@/components/Modal';
import { LogOut } from 'lucide-react';
import { useState, useEffect } from 'react';
import { schoolDatabaseService } from '@/services/school-database.service';

interface StudentHeaderProps {
  isDark: boolean;
  toggleTheme: () => void;
}

const StudentHeader = ({ isDark, toggleTheme }: StudentHeaderProps) => {
  const router = useRouter();
  const { signOut, userAccount } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [studentName, setStudentName] = useState<string>('STUDENT');

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    await signOut();
    router.push('/');
  };

  useEffect(() => {
    const fetchStudentName = async () => {
      if (!userAccount?.schoolFirebaseConfig || !userAccount?.userId) return;

      try {
        const studentData = await schoolDatabaseService.getStudentForAccount(userAccount.schoolFirebaseConfig, userAccount);

        if (studentData?.name) {
          setStudentName(studentData.name);
        }
      } catch (err) {
        console.error('Error fetching student name:', err);
      }
    };

    fetchStudentName();
  }, [userAccount]);

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
            onClick={() => router.push('/student/dashboard')}
            className="flex flex-col items-start"
          >
            <span className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>NEXORE</span>
            <span className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{studentName}</span>
          </motion.button>

          {/* Right side controls */}
          <div className="flex items-center gap-4">
            <ThemeToggle isDark={isDark} toggle={toggleTheme} />
            
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

export default StudentHeader;
