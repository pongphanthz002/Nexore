'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { studentDatabaseService } from '@/services/student-database.service';
import { schoolDatabaseService } from '@/services/school-database.service';
import StudentHeader from '@/components/StudentHeader';
import StudentFooter from '@/components/StudentFooter';
import { 
  Calendar, Clock, BookOpen, RefreshCw, 
  Sparkles, Sun, Moon
} from 'lucide-react';

const DAYS_ORDER = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'];

interface ScheduleItem {
  subjectId: string;
  subjectName: string;
  classroom: string;
  teacherId: string;
  day: string;
  time: string;
  duration?: string;
}

export default function StudentSchedulePage() {
  const { userAccount } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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

  const fetchSchedule = async (force = false) => {
    if (!force) setLoading(true);
    else setRefreshing(true);
    
    try {
      if (!userAccount?.schoolFirebaseConfig) {
        setError('ไม่พบข้อมูลโรงเรียน');
        return;
      }

      // Get student data from school database
      const studentData = await schoolDatabaseService.getStudentData(
        userAccount.schoolFirebaseConfig,
        userAccount?.userId || ''
      );

      if (!studentData) {
        setError('ไม่พบข้อมูลนักเรียน');
        return;
      }

      setStudentInfo(studentData);

      // Get schedule from school database
      const scheduleData = await studentDatabaseService.getStudentSchedule(
        userAccount.schoolFirebaseConfig,
        studentData
      );

      setSchedule(scheduleData);
      setError(null);
    } catch (err) {
      console.error('Error fetching schedule:', err);
      setError('การเชื่อมต่อขัดข้อง');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (userAccount?.userId) {
      fetchSchedule();
    }
  }, [userAccount]);

  const groupScheduleByDay = () => {
    const grouped: Record<string, ScheduleItem[]> = {};
    DAYS_ORDER.forEach(day => grouped[day] = []);
    
    schedule.forEach(item => {
      if (grouped[item.day]) {
        grouped[item.day].push(item);
      }
    });

    // Sort by time within each day
    Object.keys(grouped).forEach(day => {
      grouped[day].sort((a, b) => {
        const timeA = parseInt(a.time.split('-')[0].replace(':', ''));
        const timeB = parseInt(b.time.split('-')[0].replace(':', ''));
        return timeA - timeB;
      });
    });

    return grouped;
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-[#0F172A]' : 'bg-[#F8FAFC]'} flex items-center justify-center`}>
        <div className="text-center">
          <RefreshCw className="w-12 h-12 animate-spin text-indigo-500 mx-auto mb-4" />
          <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  const groupedSchedule = groupScheduleByDay();
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

      <main className={`max-w-7xl mx-auto px-6 space-y-6 pt-28 pb-24`}>
        {/* Student Info Card */}
        <div className={`animate-water ${mainCardGradient} rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden`}>
          <div className="relative z-10">
            <p className="text-[10px] font-bold mb-2 opacity-80 uppercase tracking-widest text-indigo-100">STUDENT INFORMATION</p>
            <h2 className="text-3xl font-bold mb-6 leading-tight">{studentInfo?.name || '-'}</h2>
            <div className="flex flex-wrap gap-3">
              <span className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl text-sm font-bold border border-white/10">ห้อง {studentInfo?.class || '-'}</span>
              <span className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl text-sm font-bold border border-white/10">รหัส {studentInfo?.studentId || '-'}</span>
            </div>
          </div>
          <Sparkles className="absolute top-6 right-6 w-16 h-16 text-white/10" />
        </div>

        {error && (
          <div className={`${isDarkMode ? 'bg-red-900/30 border-red-700' : 'bg-red-50 border-red-200'} border rounded-2xl p-6`}>
            <p className="text-red-600 font-bold">{error}</p>
          </div>
        )}

        {/* Schedule by Day */}
        {DAYS_ORDER.map((day, dayIndex) => {
          const daySchedule = groupedSchedule[day];
          if (daySchedule.length === 0) return null;

          return (
            <motion.div
              key={day}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: dayIndex * 0.1 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-indigo-500/20' : 'bg-indigo-50'}`}>
                  <Calendar className="w-5 h-5 text-indigo-500" />
                </div>
                <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{day}</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {daySchedule.map((item, itemIndex) => (
                  <motion.div
                    key={`${item.subjectId}-${itemIndex}`}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: dayIndex * 0.1 + itemIndex * 0.05 }}
                    className={`group relative p-6 rounded-[2rem] cursor-pointer transition-all border ${
                      isDarkMode 
                        ? 'bg-gray-800/80 border-gray-700/80 hover:border-indigo-500/50 hover:bg-gray-800 shadow-lg shadow-black/20' 
                        : 'bg-white border-gray-100 hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-500/5'
                    }`}
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 ${
                          isDarkMode ? 'bg-indigo-500/15 text-indigo-400' : 'bg-indigo-50 text-indigo-600'
                        }`}>
                          <BookOpen size={28} />
                        </div>
                        <div className={`text-center px-3 py-1.5 rounded-xl border ${
                          isDarkMode ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-indigo-50 border-indigo-100'
                        }`}>
                          <div className={`text-sm font-bold ${isDarkMode ? 'text-indigo-300' : 'text-indigo-700'}`}>
                            {item.time}
                          </div>
                        </div>
                      </div>
                      
                      <div className="min-w-0">
                        <h4 className={`font-bold text-xl leading-tight mb-2 truncate group-hover:text-indigo-500 transition-colors ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>
                          {item.subjectName}
                        </h4>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                            isDarkMode ? 'bg-gray-700/50 text-gray-300' : 'bg-gray-100 text-gray-600'
                          }`}>
                            ห้อง {item.classroom}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          );
        })}

        {schedule.length === 0 && !error && (
          <div className={`${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-100'} border rounded-[2rem] p-10 text-center`}>
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className={`text-lg font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>ไม่มีตารางเรียน</p>
          </div>
        )}
      </main>
      
      <StudentFooter isDark={isDarkMode} />
    </div>
  );
}
