'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import { studentDatabaseService } from '@/services/student-database.service';
import StudentHeader from '@/components/StudentHeader';
import StudentFooter from '@/components/StudentFooter';
import {
  BookOpen, Sparkles, Clock,
  User, GraduationCap, Mail, Phone
} from 'lucide-react';

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

      // Fetch subject count
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
    if (userAccount) {
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
      `}</style>

      <StudentHeader isDark={isDarkMode} toggleTheme={toggleTheme} />

      <main className="w-full px-6 space-y-6 pt-28 pb-24">
        {/* Student Info Card - Responsive width */}
        <div className={`animate-water ${mainCardGradient} rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden max-w-7xl mx-auto`}>
          <div className="relative z-10">
            <p className="text-[10px] font-bold mb-2 opacity-80 uppercase tracking-widest text-indigo-100">STUDENT INFORMATION</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-6 leading-tight">{studentInfo?.name || '-'}</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white/20 backdrop-blur-md px-6 py-4 rounded-2xl text-sm font-bold border border-white/10 flex items-center gap-3">
                <GraduationCap className="w-6 h-6" />
                <div>
                  <p className="text-xs opacity-70">ห้องเรียน</p>
                  <p className="text-lg">{studentInfo?.class || '-'}</p>
                  <p className="text-xs opacity-70">เลขที่ {studentInfo?.number || '-'}</p>
                </div>
              </div>
              
              <div className="bg-white/20 backdrop-blur-md px-6 py-4 rounded-2xl text-sm font-bold border border-white/10 flex items-center gap-3">
                <User className="w-6 h-6" />
                <div>
                  <p className="text-xs opacity-70">รหัสนักเรียน</p>
                  <p className="text-lg">{studentInfo?.studentId || '-'}</p>
                </div>
              </div>
              
              <div className="bg-white/20 backdrop-blur-md px-6 py-4 rounded-2xl text-sm font-bold border border-white/10 flex items-center gap-3">
                <Mail className="w-6 h-6" />
                <div>
                  <p className="text-xs opacity-70">อีเมล</p>
                  <p className="text-lg truncate">{userAccount?.email || '-'}</p>
                </div>
              </div>
              
              <div className="bg-white/20 backdrop-blur-md px-6 py-4 rounded-2xl text-sm font-bold border border-white/10 flex items-center gap-3">
                <BookOpen className="w-6 h-6" />
                <div>
                  <p className="text-xs opacity-70">จำนวนวิชา</p>
                  <p className="text-lg">{subjectCount} วิชา</p>
                </div>
              </div>
            </div>
          </div>
          <Sparkles className="absolute top-6 right-6 w-16 h-16 text-white/10" />
        </div>
      </main>
      
      <StudentFooter isDark={isDarkMode} />
    </div>
  );
}
