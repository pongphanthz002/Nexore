'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import ScheduleWidget from '@/components/ScheduleWidget';
import { CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import { teacherDatabaseService, AttendanceData } from '@/services/teacher-database.service';

interface SubjectData {
  subjectId: string;
  subjectName: string;
  classroom: string;
  time: string;
  day: string;
  duration?: string;
  teacherId: string;
}

function getCurrentDayThai(): string {
  const dayMap: Record<number, string> = {
    0: 'อาทิตย์', 1: 'จันทร์', 2: 'อังคาร', 3: 'พุธ', 4: 'พฤหัสบดี', 5: 'ศุกร์', 6: 'เสาร์',
  };
  return dayMap[new Date().getDay()] || '';
}

function formatDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = days[date.getDay()];
  const day = date.getDate();
  const month = date.getMonth() + 1;
  return `${dayName} ${day}/${month}`;
}

function isTimeInRange(time: string, minutesBefore: number = 15, minutesAfter: number = 120): boolean {
  if (!time) return false;
  // Support formats like "8:30-9:20", "08.30 - 09.20", "8:30 - 10:30"
  const timeParts = time.split('-');
  if (timeParts.length < 1) return false;
  
  const startPart = timeParts[0].trim();
  // Support both : and . as time separators
  const startSplit = startPart.includes(':') ? startPart.split(':') : startPart.split('.');
  if (startSplit.length < 2) return false;
  
  const h = parseInt(startSplit[0]);
  const m = parseInt(startSplit[1]);
  if (isNaN(h) || isNaN(m)) return false;

  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const classStartTime = h * 60 + m;
  
  // Show button from minutesBefore until minutesAfter (increased window)
  return currentTime >= classStartTime - minutesBefore && currentTime <= classStartTime + minutesAfter;
}

export default function TeacherDashboard() {
  const [isDark, setIsDark] = useState(false);
  const [currentSubjects, setCurrentSubjects] = useState<SubjectData[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { userAccount } = useAuth();

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));

    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    loadCurrentSubjects();
  }, [userAccount]);

  const loadCurrentSubjects = async () => {
    if (!userAccount?.schoolFirebaseConfig || !userAccount?.userId) return;
    
    try {
      setLoading(true);
      
      // Parallel loading: subjects and teacher config
      const [subjects, teacherConfig] = await Promise.all([
        schoolDatabaseService.getAllSubjects(userAccount.schoolFirebaseConfig),
        schoolDatabaseService.getTeacherConfig(userAccount.schoolFirebaseConfig, userAccount.userId)
      ]);

      const today = getCurrentDayThai();
      const todayFormatted = formatDate(new Date());

      // Fetch today's attendance records to filter them out
      let todayAttendance: AttendanceData[] = [];
      if (teacherConfig?.firebaseConfig) {
        todayAttendance = await teacherDatabaseService.getAttendanceByDate(
          teacherConfig.firebaseConfig,
          todayFormatted
        );
      }

      const current = subjects.filter(subject => {
        // 1. Must be teacher's own subject
        if (subject.teacherId !== userAccount.userId) return false;
        
        // 2. Must be today
        if (subject.day !== today) return false;
        
        // 3. Must be in time range
        if (!isTimeInRange(subject.time)) return false;
        
        // 4. Must NOT have been checked today
        const alreadyChecked = todayAttendance.some(att => 
          att.subjectId === subject.subjectId && 
          att.classroom === subject.classroom
        );
        
        return !alreadyChecked;
      });
      
      setCurrentSubjects(current);
    } catch (error) {
      console.error('Error loading current subjects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSubject = (subject: SubjectData) => {
    router.push(`/teacher/dashboard/schedules?subjectId=${subject.subjectId}&mode=attendance`);
  };

  return (
    <div className="p-6">
      {/* Main content */}
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Schedule Widget */}
        <ScheduleWidget isDark={isDark} />

        {/* Quick Attendance Section */}
        <div className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle size={22} className={isDark ? 'text-green-400' : 'text-green-600'} />
            <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              เช็คชื่อแบบด่วน
            </h2>
          </div>
          
          {currentSubjects.length > 0 ? (
            <div className="space-y-3">
              {currentSubjects.map((subject) => (
                <motion.div
                  key={subject.subjectId}
                  whileHover={{ scale: 1.01, y: -2 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleSelectSubject(subject)}
                  className={`p-4 rounded-xl cursor-pointer border-2 ${isDark ? 'bg-green-900/30 border-green-700 hover:bg-green-900/50' : 'bg-green-50 border-green-300 hover:bg-green-100'} transition-colors`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`text-center min-w-[80px] p-2 rounded-lg ${isDark ? 'bg-green-800/50' : 'bg-green-200'}`}>
                      <div className={`text-sm font-bold ${isDark ? 'text-green-300' : 'text-green-800'}`}>
                        {subject.time}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className={`font-bold text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {subject.subjectName}
                      </div>
                      <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                        ห้อง {subject.classroom}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className={`text-center py-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              ไม่มีวิชาที่กำลังสอนอยู่ขณะนี้
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
