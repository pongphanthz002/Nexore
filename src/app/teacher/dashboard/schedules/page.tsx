'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService, SubjectData, StudentData } from '@/services/school-database.service';
import { ChevronLeft, Clock, Users } from 'lucide-react';

// Parse "08:30-09:30" → { startMinutes, endMinutes }
function parseTimeRange(time: string): { startMinutes: number; endMinutes: number } | null {
  const match = time.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return {
    startMinutes: parseInt(match[1]) * 60 + parseInt(match[2]),
    endMinutes: parseInt(match[3]) * 60 + parseInt(match[4]),
  };
}

function getCurrentDayThai(): string {
  const dayMap: Record<number, string> = {
    1: 'จันทร์', 2: 'อังคาร', 3: 'พุธ', 4: 'พฤหัสบดี', 5: 'ศุกร์',
  };
  return dayMap[new Date().getDay()] || '';
}

function getNowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export default function SchedulesPage() {
  const { userAccount } = useAuth();
  const [isDark, setIsDark] = useState(false);
  const [subjects, setSubjects] = useState<SubjectData[]>([]);
  const [students, setStudents] = useState<StudentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<SubjectData | null>(null);
  const [filteredStudents, setFilteredStudents] = useState<StudentData[]>([]);
  const [nowMinutes, setNowMinutes] = useState(getNowMinutes());

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Update current time every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setNowMinutes(getNowMinutes()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function loadData() {
      if (userAccount?.schoolFirebaseConfig && userAccount?.userId) {
        try {
          const [allSubjects, allStudents] = await Promise.all([
            schoolDatabaseService.getAllSubjects(userAccount.schoolFirebaseConfig),
            schoolDatabaseService.getAllStudents(userAccount.schoolFirebaseConfig),
          ]);
          const teacherSubjects = allSubjects.filter(s => s.teacherId === userAccount.userId);
          setSubjects(teacherSubjects);
          setStudents(allStudents);
        } catch (error) {
          console.error('Error loading data:', error);
        } finally {
          setLoading(false);
        }
      }
    }
    loadData();
  }, [userAccount]);

  // Current subjects: show 10 min before start, hide 10 min after end
  const todayThai = getCurrentDayThai();
  const currentSubjects = subjects.filter(s => {
    if (s.day !== todayThai) return false;
    const range = parseTimeRange(s.time);
    if (!range) return false;
    return nowMinutes >= range.startMinutes - 10 && nowMinutes <= range.endMinutes + 10;
  }).sort((a, b) => a.time.localeCompare(b.time));

  // All unique subjects (unique by subjectName + classroom)
  const allUniqueSubjects = subjects
    .reduce((acc, subject) => {
      const key = `${subject.subjectName}-${subject.classroom}`;
      if (!acc.find(s => `${s.subjectName}-${s.classroom}` === key)) {
        acc.push(subject);
      }
      return acc;
    }, [] as SubjectData[])
    .sort((a, b) => a.classroom.localeCompare(b.classroom, 'th'));

  const handleSelectSubject = (subject: SubjectData) => {
    setSelectedSubject(subject);
    const matched = students
      .filter(s => s.class === subject.classroom)
      .sort((a, b) => {
        const numA = parseInt(a.number) || 0;
        const numB = parseInt(b.number) || 0;
        return numA - numB;
      });
    setFilteredStudents(matched);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg animate-pulse`}>
            <div className={`h-8 w-48 rounded-lg mb-4 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className={`h-20 rounded-xl ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
          </div>
          <div className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg animate-pulse`}>
            <div className={`h-8 w-40 rounded-lg mb-4 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className={`h-16 rounded-xl ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {!selectedSubject ? (
            <motion.div
              key="main"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="space-y-6"
            >
              {/* Section 1: Currently teaching */}
              <div className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={22} className={isDark ? 'text-green-400' : 'text-green-600'} />
                  <h1 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    วิชาที่กำลังสอนอยู่
                  </h1>
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

              {/* Section 2: All subjects */}
              <div className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
                <div className="flex items-center gap-2 mb-4">
                  <Users size={22} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
                  <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    ทุกวิชาที่สอน
                  </h2>
                </div>
                {allUniqueSubjects.length > 0 ? (
                  <div className="space-y-3">
                    {allUniqueSubjects.map((subject) => (
                      <motion.div
                        key={`${subject.subjectName}-${subject.classroom}`}
                        whileHover={{ scale: 1.01, y: -2 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => handleSelectSubject(subject)}
                        className={`p-4 rounded-xl cursor-pointer ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} transition-colors`}
                      >
                        <div className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {subject.subjectName}
                        </div>
                        <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                          ห้อง {subject.classroom}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    ไม่พบวิชาที่สอน
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="students"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
            >
              <div className="flex items-center gap-3 mb-6">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setSelectedSubject(null)}
                  className={`p-2 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                >
                  <ChevronLeft size={24} />
                </motion.button>
                <div>
                  <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {selectedSubject.subjectName}
                  </h1>
                  <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    ห้อง {selectedSubject.classroom} | {filteredStudents.length} คน
                  </p>
                </div>
              </div>

              {filteredStudents.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className={isDark ? 'border-b border-gray-600' : 'border-b border-gray-200'}>
                        <th className={`py-3 px-4 text-left text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>เลขที่</th>
                        <th className={`py-3 px-4 text-left text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>เลขประจำตัว</th>
                        <th className={`py-3 px-4 text-left text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>ชื่อ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((student, index) => (
                        <motion.tr
                          key={student.studentId}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                          className={isDark ? 'border-b border-gray-700' : 'border-b border-gray-100'}
                        >
                          <td className={`py-3 px-4 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{student.number || '-'}</td>
                          <td className={`py-3 px-4 text-sm font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{student.studentId}</td>
                          <td className={`py-3 px-4 text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{student.name}</td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  ไม่พบนักเรียนในห้องนี้
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
