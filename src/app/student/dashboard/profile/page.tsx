'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import { studentDatabaseService } from '@/services/student-database.service';
import StudentHeader from '@/components/StudentHeader';
import StudentFooter from '@/components/StudentFooter';
import {
  BookOpen, Sparkles, User, GraduationCap, Mail, 
  Award, ShieldCheck, Hash, Layers, CheckCircle2
} from 'lucide-react';

// Loading skeleton
function ProfileSkeleton({ isDark }: { isDark: boolean }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 gap-6">
      <div className="relative w-36 h-36">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className={`absolute inset-0 rounded-full border-2 ${
              i === 0 ? 'border-red-500/60' : i === 1 ? 'border-rose-400/40' : 'border-red-300/30'
            }`}
            style={{ margin: i * 12 }}
            animate={{ rotate: i % 2 === 0 ? 360 : -360 }}
            transition={{ duration: 2.5 + i, repeat: Infinity, ease: 'linear' }}
          />
        ))}
        <div className="absolute inset-0 flex items-center justify-center">
          <User className="w-10 h-10 text-red-500" />
        </div>
      </div>
      <div className="space-y-2 text-center">
        <motion.p
          className={`text-sm font-bold uppercase tracking-[0.3em] ${isDark ? 'text-red-400' : 'text-red-600'}`}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          กำลังโหลดโปรไฟล์
        </motion.p>
        <div className="flex gap-1.5 justify-center">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-red-500"
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function StudentProfilePage() {
  const { userAccount } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [subjectCount, setSubjectCount] = useState(0);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  useEffect(() => {
    setIsDarkMode(document.documentElement.classList.contains('dark'));
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
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

      if (!studentData && userAccount?.email) {
        studentData = await schoolDatabaseService.getStudentDataByEmail(
          userAccount.schoolFirebaseConfig,
          userAccount.email
        );
      }

      setStudentInfo(studentData);

      if (studentData?.class) {
        const subjects = await studentDatabaseService.getStudentSubjects(
          userAccount.schoolFirebaseConfig,
          studentData
        );
        setSubjectCount(subjects.length);
      }
    } catch (err) {
      console.error('Error fetching student info:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userAccount) fetchStudentInfo();
  }, [userAccount]);

  if (loading) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-[#0F172A]' : 'bg-[#F8FAFC]'} font-sans`}>
        <StudentHeader isDark={isDarkMode} toggleTheme={toggleTheme} />
        <ProfileSkeleton isDark={isDarkMode} />
        <StudentFooter isDark={isDarkMode} />
      </div>
    );
  }

  const darkClass = isDarkMode ? 'dark bg-[#0F172A] text-slate-100' : 'bg-[#F8FAFC] text-slate-900';

  const heroGradient = isDarkMode
    ? 'bg-gradient-to-br from-red-950 via-slate-900 to-red-950 border border-red-900/30'
    : 'bg-gradient-to-br from-red-600 via-rose-600 to-red-700';

  return (
    <div className={`min-h-screen ${darkClass} font-sans transition-colors duration-300 overflow-x-hidden`}>
      <StudentHeader isDark={isDarkMode} toggleTheme={toggleTheme} />

      <main className="w-full px-5 pt-28 pb-28 max-w-lg mx-auto space-y-6">

        {/* --- 1. FIGMA-GRADE STUDENT ID CARD --- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className={`${heroGradient} rounded-[2.5rem] p-7 text-white shadow-xl relative overflow-hidden`}
        >
          {/* Subtle Ambient Glows */}
          <div className="absolute top-0 right-0 w-44 h-44 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-36 h-36 bg-rose-400/20 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

          <div className="relative z-10">
            {/* Header Badge & Chip */}
            <div className="flex items-center justify-between mb-6">
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-black uppercase tracking-widest text-white">STUDENT PASS</span>
              </div>
              <Sparkles className="w-5 h-5 text-white/60" />
            </div>

            {/* Profile Avatar + Name */}
            <div className="flex items-center gap-4 mb-5">
              <div className="w-20 h-20 bg-white/15 backdrop-blur-xl rounded-[1.8rem] border-2 border-white/30 flex items-center justify-center shadow-lg shrink-0">
                <User className="w-10 h-10 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-black leading-tight truncate text-white drop-shadow-sm">
                  {studentInfo?.name || '-'}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-bold text-white/70">รหัสประจำตัว:</span>
                  <span className="text-xs font-extrabold bg-white/20 px-2.5 py-0.5 rounded-lg text-white">
                    {studentInfo?.studentId || '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* --- 2. QUICK STATS BAR (NO DUPLICATES) --- */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className={`${
            isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-100'
          } border rounded-[2rem] p-4 shadow-sm grid grid-cols-3 divide-x ${
            isDarkMode ? 'divide-slate-800' : 'divide-slate-100'
          }`}
        >
          {/* Class */}
          <div className="flex flex-col items-center text-center px-2 py-1">
            <div className="w-8 h-8 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center mb-1.5">
              <GraduationCap className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ห้องเรียน</p>
            <p className={`text-base font-black ${isDarkMode ? 'text-white' : 'text-slate-900'} mt-0.5`}>
              {studentInfo?.class || '-'}
            </p>
          </div>

          {/* Seat Number */}
          <div className="flex flex-col items-center text-center px-2 py-1">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-1.5">
              <Hash className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">เลขที่</p>
            <p className={`text-base font-black ${isDarkMode ? 'text-white' : 'text-slate-900'} mt-0.5`}>
              {studentInfo?.number || '-'}
            </p>
          </div>

          {/* Enrolled Subjects */}
          <div className="flex flex-col items-center text-center px-2 py-1">
            <div className="w-8 h-8 rounded-xl bg-red-600/10 text-red-600 flex items-center justify-center mb-1.5">
              <BookOpen className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">วิชาเรียน</p>
            <p className={`text-base font-black ${isDarkMode ? 'text-white' : 'text-slate-900'} mt-0.5`}>
              {subjectCount} วิชา
            </p>
          </div>
        </motion.div>

        {/* --- 3. ACCOUNT & SYSTEM DETAILS TILES --- */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.4 }}
          className="space-y-3"
        >
          <div className="px-2">
            <h3 className={`text-xs font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              ข้อมูลบัญชีผู้ใช้งาน
            </h3>
          </div>

          {/* Email Tile */}
          <div
            className={`${
              isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-100'
            } border rounded-2xl p-4 shadow-sm flex items-center gap-4 transition-all hover:border-red-300`}
          >
            <div className={`w-12 h-12 rounded-2xl ${isDarkMode ? 'bg-red-950/40 text-red-400' : 'bg-red-50 text-red-500'} flex items-center justify-center shrink-0`}>
              <Mail className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">อีเมลของระบบ</p>
              <p className={`font-bold text-sm sm:text-base leading-tight truncate ${isDarkMode ? 'text-slate-100' : 'text-slate-800'} mt-0.5`}>
                {userAccount?.email || '-'}
              </p>
            </div>
          </div>

          {/* Student ID Tile */}
          <div
            className={`${
              isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-100'
            } border rounded-2xl p-4 shadow-sm flex items-center gap-4 transition-all hover:border-red-300`}
          >
            <div className={`w-12 h-12 rounded-2xl ${isDarkMode ? 'bg-rose-950/40 text-rose-400' : 'bg-rose-50 text-rose-500'} flex items-center justify-center shrink-0`}>
              <Award className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">รหัสประจำตัวนักเรียน</p>
              <p className={`font-black text-lg leading-tight ${isDarkMode ? 'text-slate-100' : 'text-slate-800'} mt-0.5`}>
                {studentInfo?.studentId || '-'}
              </p>
            </div>
          </div>

          {/* Academic Status Tile */}
          <div
            className={`${
              isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-100'
            } border rounded-2xl p-4 shadow-sm flex items-center gap-4 transition-all hover:border-red-300`}
          >
            <div className={`w-12 h-12 rounded-2xl ${isDarkMode ? 'bg-emerald-950/40 text-emerald-400' : 'bg-emerald-50 text-emerald-600'} flex items-center justify-center shrink-0`}>
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">สถานะการศึกษา</p>
              <p className={`font-bold text-sm sm:text-base leading-tight ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'} mt-0.5 flex items-center gap-1.5`}>
                <CheckCircle2 className="w-4 h-4" /> กำลังศึกษา (Active)
              </p>
            </div>
          </div>
        </motion.div>

      </main>

      <StudentFooter isDark={isDarkMode} />
    </div>
  );
}
