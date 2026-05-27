'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService, SubjectData, StudentData } from '@/services/school-database.service';
import { ChevronLeft } from 'lucide-react';

export default function GradesPage() {
  const { userAccount } = useAuth();
  const [isDark, setIsDark] = useState(false);
  const [subjects, setSubjects] = useState<SubjectData[]>([]);
  const [students, setStudents] = useState<StudentData[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<SubjectData | null>(null);
  const [filteredStudents, setFilteredStudents] = useState<StudentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
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

  // Group subjects by unique subjectName + classroom, then sort by classroom
  const uniqueSubjects = subjects
    .reduce((acc, subject) => {
      const key = `${subject.subjectName}-${subject.classroom}`;
      if (!acc.find(s => `${s.subjectName}-${s.classroom}` === key)) {
        acc.push(subject);
      }
      return acc;
    }, [] as SubjectData[])
    .sort((a, b) => a.classroom.localeCompare(b.classroom, 'th'));

  // Group by classroom for section headers
  const groupedByClassroom = uniqueSubjects.reduce((acc, subject) => {
    if (!acc[subject.classroom]) acc[subject.classroom] = [];
    acc[subject.classroom].push(subject);
    return acc;
  }, {} as Record<string, SubjectData[]>);

  const sortedClassrooms = Object.keys(groupedByClassroom).sort((a, b) => a.localeCompare(b, 'th'));

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg animate-pulse`}>
            <div className={`h-8 w-40 rounded-lg mb-4 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className={`h-20 rounded-xl ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
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
              key="subjects"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
            >
              <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-6`}>
                จัดการคะแนน
              </h1>
              {sortedClassrooms.length > 0 ? (
                <div className="space-y-6">
                  {sortedClassrooms.map((classroom) => (
                    <div key={classroom}>
                      <h2 className={`text-lg font-semibold mb-3 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                        ห้อง {classroom}
                      </h2>
                      <div className="grid grid-cols-2 gap-3">
                        {groupedByClassroom[classroom].map((subject) => (
                          <motion.div
                            key={`${subject.subjectName}-${subject.classroom}`}
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleSelectSubject(subject)}
                            className={`p-4 rounded-xl cursor-pointer ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} transition-colors`}
                          >
                            <div className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {subject.subjectName}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  ไม่พบวิชาที่สอน
                </div>
              )}
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
