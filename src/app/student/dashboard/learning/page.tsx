'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import StudentHeader from '@/components/StudentHeader';
import StudentFooter from '@/components/StudentFooter';
import { 
  BookOpen, Sparkles, Clock, 
  Lightbulb, GraduationCap, Rocket, Zap, Sun, Moon
} from 'lucide-react';

export default function StudentLearningPage() {
  const { userAccount } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  useEffect(() => {
    setIsDarkMode(document.documentElement.classList.contains('dark'));

    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  const fetchStudentInfo = async () => {
    setLoading(true);
    try {
      if (!userAccount?.schoolFirebaseConfig) return;

      let studentData = await schoolDatabaseService.getStudentData(
        userAccount.schoolFirebaseConfig,
        userAccount?.userId || ''
      );

      // If not found by userId, try by email
      if (!studentData && userAccount?.email) {
        studentData = await schoolDatabaseService.getStudentDataByEmail(
          userAccount.schoolFirebaseConfig,
          userAccount.email
        );
      }

      setStudentInfo(studentData);
    } catch (err) {
      console.error('Error fetching student info:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userAccount?.userId) {
      fetchStudentInfo();
    }
  }, [userAccount]);

  if (loading) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-[#0F172A]' : 'bg-[#F8FAFC]'} flex items-center justify-center`}>
        <div className="text-center">
          <Clock className="w-12 h-12 animate-spin text-indigo-500 mx-auto mb-4" />
          <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  const darkClass = isDarkMode ? "dark bg-[#0F172A] text-slate-100" : "bg-[#F8FAFC] text-slate-900";
  const mainCardGradient = isDarkMode
    ? 'bg-gradient-to-br from-[#111827] via-[#1F2937] to-[#030712]'
    : 'bg-gradient-to-br from-[#3730a3] via-[#1e1b4b] to-[#3730a3]';

  return (
    <div className={`min-h-screen ${darkClass} font-sans transition-colors duration-300 overflow-x-hidden`}>
      <style>{`
        @keyframes water-flow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        .animate-water { background-size: 200% 200%; animation: water-flow 8s ease infinite; }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-20px); } }
        .animate-float { animation: float 6s ease-in-out infinite; }
      `}</style>

      <StudentHeader isDark={isDarkMode} toggleTheme={toggleTheme} />

      <main className={`max-w-md mx-auto px-6 space-y-6 pt-28 pb-24`}>
        {/* Coming Soon Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-100'} border rounded-[3rem] p-12 shadow-sm text-center relative overflow-hidden`}
        >
          <motion.div 
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="relative z-10"
          >
            <div className="w-24 h-24 mx-auto mb-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center shadow-2xl animate-float">
              <Rocket className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-4xl font-black mb-4 bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              เร็วๆ นี้
            </h2>
            <p className={`text-lg font-bold mb-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              ฟีเจอร์นี้กำลังอยู่ในระหว่างการพัฒนา
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <div className={`p-4 rounded-2xl ${isDarkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                <Lightbulb className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
                <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>คลังความรู้</p>
              </div>
              <div className={`p-4 rounded-2xl ${isDarkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                <GraduationCap className="w-6 h-6 text-indigo-500 mx-auto mb-2" />
                <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>คอร์สเสริม</p>
              </div>
              <div className={`p-4 rounded-2xl ${isDarkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                <Zap className="w-6 h-6 text-orange-500 mx-auto mb-2" />
                <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>แบบฝึกหัด</p>
              </div>
            </div>
          </motion.div>
          
          {/* Background decoration */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600" />
          </div>
        </motion.div>
      </main>
      
      <StudentFooter isDark={isDarkMode} />
    </div>
  );
}
