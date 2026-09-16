'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import { studentDatabaseService } from '@/services/student-database.service';
import StudentHeader from '@/components/StudentHeader';
import StudentFooter from '@/components/StudentFooter';
import {
  BookOpen, Sparkles, User, GraduationCap, Mail, Award
} from 'lucide-react';

// Collage Art loading
function CollageSkeleton({ isDark }: { isDark: boolean }) {
  const colors = [
    'bg-red-500/20', 'bg-rose-500/20', 'bg-red-400/20',
    'bg-rose-600/20', 'bg-red-600/20',
  ];
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 gap-6">
      <div className="relative w-40 h-40">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className={`absolute ${colors[i]} rounded-[30%] backdrop-blur-sm border border-white/10`}
            style={{
              width: 60 + i * 14,
              height: 60 + i * 14,
              top: '50%',
              left: '50%',
            }}
            animate={{
              rotate: [0, 360],
              x: '-50%',
              y: '-50%',
            }}
            transition={{
              rotate: { duration: 3 + i, repeat: Infinity, ease: 'linear' },
              x: { duration: 0 },
              y: { duration: 0 },
            }}
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
          Loading Profile
        </motion.p>
        <div className="flex gap-1 justify-center">
          {[0,1,2].map(i => (
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
        <CollageSkeleton isDark={isDarkMode} />
        <StudentFooter isDark={isDarkMode} />
      </div>
    );
  }

  const darkClass = isDarkMode ? 'dark bg-[#0F172A] text-slate-100' : 'bg-[#F8FAFC] text-slate-900';

  // Collage art colours - Red White minimal theme
  const swatches = [
    { label: 'Classroom', value: `ห้อง ${studentInfo?.class || '-'}`, sub: `เลขที่ ${studentInfo?.number || '-'}`, icon: GraduationCap, rotate: '-rotate-2', bg: isDarkMode ? 'bg-red-950/60 border-red-800' : 'bg-red-50 border-red-200', accent: isDarkMode ? 'text-red-300' : 'text-red-700' },
    { label: 'Student ID', value: studentInfo?.studentId || '-', sub: null, icon: User, rotate: 'rotate-1', bg: isDarkMode ? 'bg-rose-950/60 border-rose-800' : 'bg-rose-50 border-rose-200', accent: isDarkMode ? 'text-rose-300' : 'text-rose-700' },
    { label: 'Email', value: userAccount?.email || '-', sub: null, icon: Mail, rotate: '-rotate-1', bg: isDarkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-white border-slate-200', accent: isDarkMode ? 'text-red-400' : 'text-red-600', truncate: true },
    { label: 'Enrolled', value: `${subjectCount} วิชา`, sub: 'All Subjects', icon: BookOpen, rotate: 'rotate-2', bg: isDarkMode ? 'bg-red-900/50 border-red-700' : 'bg-red-100/70 border-red-300', accent: isDarkMode ? 'text-red-300' : 'text-red-800' },
  ];

  const mainGradient = isDarkMode
    ? 'bg-gradient-to-br from-red-950 via-slate-900 to-red-950 border border-red-900/40'
    : 'bg-gradient-to-br from-red-600 via-rose-600 to-red-700';

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08 } },
  };
  const cardAnim = {
    hidden: { opacity: 0, y: 30, rotate: 0 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className={`min-h-screen ${darkClass} font-sans transition-colors duration-300 overflow-x-hidden`}>
      <style>{`
        @keyframes water-flow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        .animate-water { background-size: 200% 200%; animation: water-flow 8s ease infinite; }
        @keyframes float-up { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
        .animate-float { animation: float-up 4s ease-in-out infinite; }
      `}</style>

      <StudentHeader isDark={isDarkMode} toggleTheme={toggleTheme} />

      <main className="w-full px-4 pt-24 pb-28 max-w-lg mx-auto space-y-5">

        {/* Hero Collage Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`animate-water ${mainGradient} rounded-[2.5rem] p-7 text-white shadow-2xl relative overflow-hidden`}
        >
          {/* Decorative blobs */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-rose-400/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />
          
          {/* Tape strip top */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-20 h-4 bg-white/15 backdrop-blur-sm rounded-full border border-white/20 shadow" />

          <div className="relative z-10 pt-3">
            {/* Avatar + badge */}
            <div className="flex items-end gap-4 mb-6">
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="w-24 h-24 bg-white/10 backdrop-blur-xl rounded-[1.8rem] border-2 border-white/20 flex items-center justify-center shadow-inner shrink-0"
              >
                <User className="w-12 h-12 text-white/80" />
              </motion.div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-red-100">Active</p>
                </div>
                <h2 className="text-2xl font-black leading-tight break-words text-white drop-shadow">{studentInfo?.name || '-'}</h2>
                <p className="text-xs font-bold text-white/50 mt-1 uppercase tracking-wider">Student Profile</p>
              </div>
            </div>

            {/* Stamp / sticker row */}
            <div className="flex gap-2 flex-wrap">
              <span className="bg-white/15 border border-white/20 px-3 py-1 rounded-full text-xs font-black backdrop-blur-sm">
                <Award className="w-3 h-3 inline-block mr-1 mb-0.5" />
                ห้อง {studentInfo?.class || '-'}
              </span>
              <span className="bg-white/15 border border-white/20 px-3 py-1 rounded-full text-xs font-black backdrop-blur-sm">
                # {studentInfo?.number || '-'}
              </span>
              <span className="bg-white/15 border border-white/20 px-3 py-1 rounded-full text-xs font-black text-white backdrop-blur-sm">
                {subjectCount} วิชา
              </span>
            </div>
          </div>
        </motion.div>

        {/* Collage Info Cards */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 gap-3"
        >
          {swatches.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.label}
                variants={cardAnim}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className={`${s.bg} border-2 ${s.rotate} rounded-[1.8rem] p-5 shadow-lg relative overflow-hidden`}
                style={{ transformOrigin: i % 2 === 0 ? 'top left' : 'top right' }}
              >
                {/* Corner tear effect */}
                <div className="absolute bottom-0 right-0 w-8 h-8 bg-black/5 rounded-tl-2xl pointer-events-none" />
                <div className="mb-3">
                  <div className={`inline-flex p-2 rounded-xl ${isDarkMode ? 'bg-white/10' : 'bg-white/60'} mb-2`}>
                    <Icon className={`w-5 h-5 ${s.accent}`} />
                  </div>
                  <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${s.accent} opacity-70`}>{s.label}</p>
                </div>
                {s.truncate ? (
                  <p className={`text-sm font-bold leading-snug truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`} title={s.value}>{s.value}</p>
                ) : (
                  <p className={`text-lg font-black leading-snug ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{s.value}</p>
                )}
                {s.sub && (
                  <p className={`text-xs font-bold mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{s.sub}</p>
                )}
              </motion.div>
            );
          })}
        </motion.div>

        {/* Decorative tape strip at bottom */}
        <div className="flex justify-center gap-3 pt-2">
          {['bg-red-400/30','bg-rose-400/30','bg-red-500/20'].map((c,i) => (
            <div key={i} className={`w-12 h-3 ${c} rounded-full`} style={{ transform: `rotate(${(i-1)*3}deg)` }} />
          ))}
        </div>

      </main>

      <StudentFooter isDark={isDarkMode} />
    </div>
  );
}
