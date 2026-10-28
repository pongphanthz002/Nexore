'use client';

import { motion } from 'framer-motion';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import StudentHeader from '@/components/StudentHeader';
import StudentFooter from '@/components/StudentFooter';
import { 
  BookOpen, Sparkles, Clock, 
  Lightbulb, GraduationCap, Rocket, Zap, Sun, Moon
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

export default function StudentLearningPage() {
  const { userAccount } = useAuth();
  const { isDark: isDarkMode, toggleTheme } = useTheme();
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStudentInfo = useCallback(async () => {
    setLoading(true);
    try {
      if (!userAccount?.schoolFirebaseConfig) return;

      const studentData = await schoolDatabaseService.getStudentForAccount(userAccount.schoolFirebaseConfig, userAccount);

      setStudentInfo(studentData);
    } catch (err) {
      console.error('Error fetching student info:', err);
    } finally {
      setLoading(false);
    }
  }, [userAccount]);

  useEffect(() => {
    if (userAccount?.userId) {
      fetchStudentInfo();
    }
  }, [userAccount?.userId, fetchStudentInfo]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <Clock className="w-12 h-12 animate-spin text-red-500 mx-auto mb-4" />
          <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  const darkClass = isDarkMode ? "dark bg-surface text-slate-100" : "bg-surface text-slate-900";

  return (
    <div className={`min-h-screen ${darkClass} font-sans transition-colors duration-300 overflow-x-hidden`}>
      <style>{`
        @keyframes water-flow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        .animate-water { background-size: 200% 200%; animation: water-flow 8s ease infinite; }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-20px); } }
        .animate-float { animation: float 6s ease-in-out infinite; }
      `}</style>

      <StudentHeader isDark={isDarkMode} toggleTheme={toggleTheme} />

      <main className={`max-w-md mx-auto px-6 space-y-6 pt-28 pb-32`}>
        {/* Coming Soon Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-surface rounded-[3rem] p-12 shadow-neu-lg text-center relative overflow-hidden"
        >
          <motion.div 
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="relative z-10"
          >
            <div className="w-24 h-24 mx-auto mb-8 bg-gradient-to-br from-red-500 to-rose-600 rounded-full flex items-center justify-center shadow-2xl animate-float">
              <Rocket className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-4xl font-black mb-4 bg-gradient-to-r from-red-600 to-rose-600 bg-clip-text text-transparent">
              เร็วๆ นี้
            </h2>
            <p className={`text-lg font-bold mb-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              ฟีเจอร์นี้กำลังอยู่ในระหว่างการพัฒนา
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <div className="p-4 rounded-2xl shadow-neu-in-sm">
                <Lightbulb className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
                <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>คลังความรู้</p>
              </div>
              <div className="p-4 rounded-2xl shadow-neu-in-sm">
                <GraduationCap className="w-6 h-6 text-red-500 mx-auto mb-2" />
                <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>คอร์สเสริม</p>
              </div>
              <div className="p-4 rounded-2xl shadow-neu-in-sm">
                <Zap className="w-6 h-6 text-orange-500 mx-auto mb-2" />
                <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>แบบฝึกหัด</p>
              </div>
            </div>
          </motion.div>
          
          {/* Background decoration */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-red-500 to-rose-600" />
          </div>
        </motion.div>
      </main>
      
      <StudentFooter isDark={isDarkMode} />
    </div>
  );
}
