'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import { firestoreService } from '@/services/firestore.service';
import { Users, GraduationCap, Book, ArrowLeft, AlertTriangle, X } from 'lucide-react';

export default function AdminUsers() {
  const router = useRouter();
  const { userAccount, invalidateCache, signOut } = useAuth();
  const [isDark, setIsDark] = useState(false);
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [touchStartX, setTouchStartX] = useState(0);
  
  // Modal states
  const [showMainModal, setShowMainModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [resetInputText, setResetInputText] = useState('');
  const [deleteInputText, setDeleteInputText] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));

    // Listen for theme changes
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // Swipe gesture handlers for back navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    const touchX = e.touches[0].clientX;
    
    // Prevent iOS Safari edge swipe-to-go-back gesture
    if (touchX < 50) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Only allow swipe from left edge (within 50px)
    if (touchX < 50) {
      setTouchStartX(touchX);
      setIsSwiping(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - touchStartX;
    
    // Only track left-to-right swipe
    if (diff > 0) {
      const progress = Math.min(diff / 200, 1); // 200px threshold
      setSwipeProgress(progress);
    }
  };

  const handleTouchEnd = () => {
    if (!isSwiping) return;
    
    // If swiped more than 50% of threshold, go back
    if (swipeProgress > 0.5) {
      router.back();
    }
    
    // Reset state
    setSwipeProgress(0);
    setIsSwiping(false);
    setTouchStartX(0);
  };

  // Trackpad gesture handlers for laptops
  const handleWheel = (e: React.WheelEvent) => {
    // Check if it's a horizontal scroll (trackpad gesture)
    // Mac trackpad: deltaX negative = left-to-right swipe (back gesture)
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && e.deltaX < -50) {
      // Left-to-right scroll - trigger back immediately
      router.back();
    }
  };

  // Get school name from hub data
  const getSchoolName = () => {
    // Try to get from userAccount hub info or use a default
    return userAccount?.schoolId || 'โรงเรียน';
  };

  const handleResetData = async () => {
    if (!userAccount?.schoolFirebaseConfig) return;

    setLoading(true);
    try {
      // Get all teachers and students to extract emails
      const teachers = await schoolDatabaseService.getAllTeachers(userAccount.schoolFirebaseConfig);
      const students = await schoolDatabaseService.getAllStudents(userAccount.schoolFirebaseConfig);

      const teacherEmails = teachers.map(t => t.email).filter((e): e is string => !!e);
      const studentEmails = students.map(s => s.email).filter((e): e is string => !!e);

      // Delete all Teacher Databases
      await schoolDatabaseService.deleteAllTeacherDatabases(userAccount.schoolFirebaseConfig);

      // Delete all School Data (teachers, students, subjects)
      await schoolDatabaseService.deleteAllSchoolData(userAccount.schoolFirebaseConfig);

      // Delete all user accounts from Master Registry (teachers, students)
      await schoolDatabaseService.deleteAllUserAccountsFromMasterRegistry(teacherEmails, studentEmails);

      invalidateCache();
      alert('รีเซ็ตข้อมูลสำเร็จ\nData reset successfully');
      setShowResetModal(false);
      setResetInputText('');
    } catch (error) {
      console.error('Error resetting data:', error);
      alert('ไม่สามารถรีเซ็ตข้อมูลได้\nFailed to reset data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteData = async () => {
    if (!userAccount?.schoolId || !userAccount?.schoolFirebaseConfig) return;

    setLoading(true);
    try {
      // Get all teachers and students to extract emails
      const teachers = await schoolDatabaseService.getAllTeachers(userAccount.schoolFirebaseConfig);
      const students = await schoolDatabaseService.getAllStudents(userAccount.schoolFirebaseConfig);

      const teacherEmails = teachers.map(t => t.email).filter((e): e is string => !!e);
      const studentEmails = students.map(s => s.email).filter((e): e is string => !!e);

      // Delete all School Data (teachers, students, subjects, admins)
      await schoolDatabaseService.deleteAllSchoolData(userAccount.schoolFirebaseConfig);

      // Delete all Teacher Databases
      await schoolDatabaseService.deleteAllTeacherDatabases(userAccount.schoolFirebaseConfig);

      // Delete all user accounts from Master Registry (teachers, students)
      await schoolDatabaseService.deleteAllUserAccountsFromMasterRegistry(teacherEmails, studentEmails);

      // Delete hub from Master Registry
      await firestoreService.deleteHub(userAccount.schoolId);

      // Delete admin user account from Master Registry
      if (userAccount.email) {
        await firestoreService.deleteUserAccount(userAccount.email);
      }

      invalidateCache();
      alert('ลบข้อมูลโรงเรียนสำเร็จ\nSchool data deleted successfully');

      // Sign out from Firebase Auth
      await signOut();

      // Redirect to signup page
      router.push('/signup');
    } catch (error) {
      console.error('Error deleting data:', error);
      alert('ไม่สามารถลบข้อมูลได้\nFailed to delete data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="p-6"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* Swipe visual feedback */}
      {isSwiping && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: swipeProgress * 0.3 }}
          className="fixed inset-0 bg-black pointer-events-none z-50"
        />
      )}
      
      {/* Swipe indicator arrow */}
      {isSwiping && swipeProgress > 0.1 && (
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: swipeProgress, x: swipeProgress * 100 - 50 }}
          className="fixed left-4 top-1/2 -translate-y-1/2 z-50 pointer-events-none"
        >
          <ArrowLeft size={48} className="text-white opacity-50" />
        </motion.div>
      )}
      {/* Main content */}
      <div className="max-w-4xl mx-auto">

        {/* Menu Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Teachers Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.1 }}
            whileHover={{ scale: 1.02, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push('/admin/dashboard/users/teachers')}
            className={`rounded-2xl p-6 cursor-pointer ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-gray-700' : 'bg-blue-100'}`}>
                <Users size={32} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
              </div>
              <div className="flex-1">
                <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  จัดการข้อมูลครู
                </h2>
                <p className={`text-sm font-light ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Teachers Management
                </p>
              </div>
            </div>
          </motion.div>

          {/* Students Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.2 }}
            whileHover={{ scale: 1.02, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push('/admin/dashboard/users/students')}
            className={`rounded-2xl p-6 cursor-pointer ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-gray-700' : 'bg-blue-100'}`}>
                <GraduationCap size={32} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
              </div>
              <div className="flex-1">
                <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  จัดการข้อมูลนักเรียน
                </h2>
                <p className={`text-sm font-light ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Students Management
                </p>
              </div>
            </div>
          </motion.div>

          {/* Subjects Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.3 }}
            whileHover={{ scale: 1.02, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push('/admin/dashboard/users/subjects')}
            className={`rounded-2xl p-6 cursor-pointer ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-gray-700' : 'bg-blue-100'}`}>
                <Book size={32} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
              </div>
              <div className="flex-1">
                <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  จัดการข้อมูลวิชาเรียน
                </h2>
                <p className={`text-sm font-light ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Subjects Management
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Reset and Delete Card */}
        <div className="mt-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.4 }}
            whileHover={{ scale: 1.02, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowMainModal(true)}
            className={`rounded-2xl p-6 cursor-pointer border-2 border-red-500 ${isDark ? 'bg-red-900/20' : 'bg-red-50'} shadow-lg`}
          >
            <div className="flex items-center justify-center gap-4">
              <div className={`w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-red-900/40' : 'bg-red-200'}`}>
                <AlertTriangle size={32} className="text-red-500" />
              </div>
              <div>
                <h2 className={`text-xl font-bold text-red-500`}>
                  รีเซ็ตและลบข้อมูล
                </h2>
                <p className={`text-sm font-light text-red-400`}>
                  Reset and Delete Data
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Main Modal */}
      {showMainModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setShowMainModal(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className={`rounded-2xl p-6 max-w-md w-full shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}
          >
            <div className="flex items-center justify-end mb-4">
              <button
                onClick={() => setShowMainModal(false)}
                className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setShowMainModal(false);
                  setShowResetModal(true);
                }}
                className={`w-full py-4 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              >
                <div className="font-semibold">รีเซ็ตข้อมูล</div>
                <div className="text-sm opacity-70">Reset Data</div>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setShowMainModal(false);
                  setShowDeleteModal(true);
                }}
                className="w-full py-4 rounded-xl bg-red-500 text-white hover:bg-red-600"
              >
                <div className="font-semibold">ลบข้อมูล</div>
                <div className="text-sm opacity-70">Delete Data</div>
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Reset Data Confirmation Modal */}
      {showResetModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setShowResetModal(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className={`rounded-2xl p-6 max-w-md w-full shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                ยืนยันการรีเซ็ตข้อมูล
              </h3>
              <button
                onClick={() => setShowResetModal(false)}
                className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div className={`p-4 rounded-xl ${isDark ? 'bg-yellow-900/20 border border-yellow-700' : 'bg-yellow-50 border border-yellow-200'}`}>
                <p className={`font-semibold text-yellow-600 mb-2`}>
                  ⚠️ คำเตือน / Warning
                </p>
                <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  การกระทำนี้จะลบข้อมูลครู นักเรียน และวิชาเรียนทั้งหมดออกจากฐานข้อมูลของโรงเรียน
                </p>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                  This action will delete all teachers, students, and subjects from the school database
                </p>
              </div>

              <div>
                <label className={`block text-sm mb-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  พิมพ์ชื่อโรงเรียนเพื่อยืนยัน
                </label>
                <label className={`block text-xs mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Type school name to confirm
                </label>
                <p className={`text-sm mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  พิมพ์: <span className="text-red-500 font-semibold">{getSchoolName()}</span>
                </p>
                <input
                  type="text"
                  value={resetInputText}
                  onChange={(e) => setResetInputText(e.target.value)}
                  placeholder={getSchoolName()}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                />
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setShowResetModal(false);
                    setResetInputText('');
                  }}
                  disabled={loading}
                  className={`flex-1 py-3 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  ยกเลิก
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleResetData}
                  disabled={resetInputText !== getSchoolName() || loading}
                  className={`flex-1 py-3 rounded-xl bg-blue-500 text-white ${resetInputText !== getSchoolName() || loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {loading ? 'กำลังดำเนินการ...' : 'ยืนยัน'}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Delete Data Confirmation Modal */}
      {showDeleteModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setShowDeleteModal(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className={`rounded-2xl p-6 max-w-md w-full shadow-2xl border-2 border-red-500 ${isDark ? 'bg-gray-800' : 'bg-white'}`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xl font-bold text-red-500`}>
                ยืนยันการลบข้อมูล
              </h3>
              <button
                onClick={() => setShowDeleteModal(false)}
                className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div className={`p-4 rounded-xl ${isDark ? 'bg-red-900/20 border border-red-700' : 'bg-red-50 border border-red-200'}`}>
                <p className={`font-semibold text-red-600 mb-2`}>
                  ⚠️ คำเตือน / Warning
                </p>
                <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  การกระทำนี้จะลบข้อมูลโรงเรียนทั้งหมดออกจาระบบ รวมถึงบัญชีผู้ดูแลระบบ
                </p>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                  This action will delete the entire school from the system, including the admin account
                </p>
              </div>

              <div>
                <label className={`block text-sm mb-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  พิมพ์ชื่อโรงเรียนเพื่อยืนยัน
                </label>
                <label className={`block text-xs mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Type school name to confirm
                </label>
                <p className={`text-sm mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  พิมพ์: <span className="text-red-500 font-semibold">{getSchoolName()}</span>
                </p>
                <input
                  type="text"
                  value={deleteInputText}
                  onChange={(e) => setDeleteInputText(e.target.value)}
                  placeholder={getSchoolName()}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                />
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteInputText('');
                  }}
                  disabled={loading}
                  className={`flex-1 py-3 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  ยกเลิก
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDeleteData}
                  disabled={deleteInputText !== getSchoolName() || loading}
                  className={`flex-1 py-3 rounded-xl bg-red-500 text-white ${deleteInputText !== getSchoolName() || loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {loading ? 'กำลังดำเนินการ...' : 'ยืนยัน'}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
