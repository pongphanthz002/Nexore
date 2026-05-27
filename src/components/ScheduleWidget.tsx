'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface SubjectData {
  subjectId: string;
  teacherId: string;
  subjectName: string;
  classroom: string;
  day: string;
  time: string;
}

interface ScheduleWidgetProps {
  isDark: boolean;
}

// Parse "08:30-09:30" → { startHour, startMin, endHour, endMin }
function parseTimeRange(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return {
    startHour: parseInt(match[1]),
    startMin: parseInt(match[2]),
    endHour: parseInt(match[3]),
    endMin: parseInt(match[4]),
    startMinutes: parseInt(match[1]) * 60 + parseInt(match[2]),
    endMinutes: parseInt(match[3]) * 60 + parseInt(match[4]),
  };
}

function getTodayThai(): string {
  const dayMap: Record<number, string> = {
    1: 'จันทร์', 2: 'อังคาร', 3: 'พุธ', 4: 'พฤหัสบดี', 5: 'ศุกร์',
  };
  return dayMap[new Date().getDay()] || 'จันทร์';
}

// Color palette for subject blocks
const blockColors = [
  { bg: 'bg-blue-500/80', text: 'text-white', darkBg: 'bg-blue-600/80' },
  { bg: 'bg-purple-500/80', text: 'text-white', darkBg: 'bg-purple-600/80' },
  { bg: 'bg-emerald-500/80', text: 'text-white', darkBg: 'bg-emerald-600/80' },
  { bg: 'bg-orange-500/80', text: 'text-white', darkBg: 'bg-orange-600/80' },
  { bg: 'bg-pink-500/80', text: 'text-white', darkBg: 'bg-pink-600/80' },
  { bg: 'bg-cyan-500/80', text: 'text-white', darkBg: 'bg-cyan-600/80' },
  { bg: 'bg-amber-500/80', text: 'text-white', darkBg: 'bg-amber-600/80' },
  { bg: 'bg-indigo-500/80', text: 'text-white', darkBg: 'bg-indigo-600/80' },
];

const ScheduleWidget = ({ isDark }: ScheduleWidgetProps) => {
  const { userAccount } = useAuth();
  const [subjects, setSubjects] = useState<SubjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFullSchedule, setShowFullSchedule] = useState(false);
  const [popupDay, setPopupDay] = useState('');
  
  const days = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'];
  const todayThai = getTodayThai();

  useEffect(() => {
    async function loadSubjects() {
      if (userAccount?.schoolFirebaseConfig && userAccount?.userId) {
        try {
          const allSubjects = await schoolDatabaseService.getAllSubjects(userAccount.schoolFirebaseConfig);
          const teacherSubjects = allSubjects.filter(s => s.teacherId === userAccount.userId);
          setSubjects(teacherSubjects);
        } catch (error) {
          console.error('Error loading subjects:', error);
        } finally {
          setLoading(false);
        }
      }
    }
    loadSubjects();
  }, [userAccount]);

  const getSubjectsForDay = (day: string) => {
    return subjects.filter(s => s.day === day).sort((a, b) => a.time.localeCompare(b.time));
  };

  // Build color map: assign consistent color per subjectName
  const subjectColorMap = new Map<string, number>();
  const uniqueNames = [...new Set(subjects.map(s => s.subjectName))];
  uniqueNames.forEach((name, i) => subjectColorMap.set(name, i % blockColors.length));

  // Calculate time range for today's timeline
  const todaySubjects = getSubjectsForDay(todayThai);
  const parsedToday = todaySubjects.map(s => ({ ...s, parsed: parseTimeRange(s.time) })).filter(s => s.parsed);

  let timelineStart = 8; // default 08:00
  let timelineEnd = 17;  // default 17:00
  if (parsedToday.length > 0) {
    timelineStart = Math.min(...parsedToday.map(s => s.parsed!.startHour));
    timelineEnd = Math.max(...parsedToday.map(s => s.parsed!.endHour + (s.parsed!.endMin > 0 ? 1 : 0)));
  }
  const totalHours = timelineEnd - timelineStart;
  const hourHeight = 60; // px per hour

  const handleOpenPopup = () => {
    setPopupDay(todayThai);
    setShowFullSchedule(true);
  };

  const handlePopupDayChange = (direction: 'prev' | 'next') => {
    const currentIndex = days.indexOf(popupDay);
    let newIndex;
    if (direction === 'prev') {
      newIndex = currentIndex === 0 ? days.length - 1 : currentIndex - 1;
    } else {
      newIndex = currentIndex === days.length - 1 ? 0 : currentIndex + 1;
    }
    setPopupDay(days[newIndex]);
  };

  // Calculate popup timeline range for selected day
  const popupSubjects = getSubjectsForDay(popupDay);
  const parsedPopup = popupSubjects.map(s => ({ ...s, parsed: parseTimeRange(s.time) })).filter(s => s.parsed);
  let popupStart = 8;
  let popupEnd = 17;
  if (parsedPopup.length > 0) {
    popupStart = Math.min(...parsedPopup.map(s => s.parsed!.startHour));
    popupEnd = Math.max(...parsedPopup.map(s => s.parsed!.endHour + (s.parsed!.endMin > 0 ? 1 : 0)));
  }
  const popupTotalHours = popupEnd - popupStart;

  if (loading) {
    return (
      <div className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg animate-pulse`}>
        <div className={`h-6 w-32 rounded-lg mb-4 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
        <div className={`h-48 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
      </div>
    );
  }

  const renderTimeline = (
    daySubjects: SubjectData[],
    startHour: number,
    hours: number,
    height: number,
  ) => {
    const parsed = daySubjects.map(s => ({ ...s, parsed: parseTimeRange(s.time) })).filter(s => s.parsed);
    return (
      <div className="relative" style={{ height: hours * height }}>
        {/* Hour lines */}
        {Array.from({ length: hours + 1 }, (_, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 flex items-start"
            style={{ top: i * height }}
          >
            <span className={`text-xs w-12 shrink-0 -mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {String(startHour + i).padStart(2, '0')}:00
            </span>
            <div className={`flex-1 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`} />
          </div>
        ))}
        {/* Subject blocks */}
        {parsed.map((subject) => {
          const p = subject.parsed!;
          const topOffset = ((p.startMinutes - startHour * 60) / 60) * height;
          const blockHeight = ((p.endMinutes - p.startMinutes) / 60) * height;
          const colorIdx = subjectColorMap.get(subject.subjectName) || 0;
          const color = blockColors[colorIdx];
          return (
            <motion.div
              key={subject.subjectId}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`absolute left-14 right-1 rounded-xl p-2 ${isDark ? color.darkBg : color.bg} ${color.text} overflow-hidden`}
              style={{ top: topOffset, height: Math.max(blockHeight, 28) }}
            >
              <div className="font-semibold text-sm truncate">{subject.subjectName}</div>
              {blockHeight > 36 && (
                <div className="text-xs opacity-80 truncate">
                  {subject.time} | ห้อง {subject.classroom}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        whileHover={{ scale: 1.01, y: -3 }}
        onClick={handleOpenPopup}
        className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg cursor-pointer`}
      >
        <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-4`}>
          ตารางสอนวันนี้ — {todayThai}
        </h2>
        {todaySubjects.length > 0 ? (
          renderTimeline(todaySubjects, timelineStart, totalHours, hourHeight)
        ) : (
          <div className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            ไม่มีตารางสอนในวันนี้
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showFullSchedule && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => setShowFullSchedule(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={`rounded-2xl p-6 max-w-4xl w-full max-h-[85vh] overflow-y-auto ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  ตารางสอนประจำวัน
                </h2>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowFullSchedule(false)}
                  className={`p-2 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                >
                  <X size={20} />
                </motion.button>
              </div>

              <div className="flex items-center justify-center gap-4 mb-6">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handlePopupDayChange('prev')}
                  className={`p-2 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                >
                  <ChevronLeft size={24} />
                </motion.button>

                <div className="flex gap-2">
                  {days.map((day) => (
                    <motion.button
                      key={day}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setPopupDay(day)}
                      className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                        day === popupDay
                          ? 'bg-blue-500 text-white'
                          : isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {day.substring(0, 2)}
                    </motion.button>
                  ))}
                </div>

                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handlePopupDayChange('next')}
                  className={`p-2 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                >
                  <ChevronRight size={24} />
                </motion.button>
              </div>

              <motion.div
                key={popupDay}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                {popupSubjects.length > 0 ? (
                  renderTimeline(popupSubjects, popupStart, popupTotalHours, hourHeight)
                ) : (
                  <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    ไม่มีตารางสอนในวัน{popupDay}
                  </div>
                )}
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ScheduleWidget;
