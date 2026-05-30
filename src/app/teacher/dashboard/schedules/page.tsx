'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams } from 'next/navigation';
import { schoolDatabaseService, SubjectData, StudentData } from '@/services/school-database.service';
import { teacherDatabaseService, AttendanceRecord, AttendanceData } from '@/services/teacher-database.service';
import { ChevronLeft, Clock, Users, ClipboardList, Save, CheckCircle2 } from 'lucide-react';

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

// Format date as "Mon 23/5"
function formatDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = days[date.getDay()];
  const day = date.getDate();
  const month = date.getMonth() + 1;
  return `${dayName} ${day}/${month}`;
}

// Parse "Mon 23/5" back to Date (approximate)
function parseDate(dateStr: string): Date {
  const parts = dateStr.split(' ');
  const dayMonth = parts[1].split('/');
  const day = parseInt(dayMonth[0]);
  const month = parseInt(dayMonth[1]) - 1;
  const now = new Date();
  return new Date(now.getFullYear(), month, day);
}

function SchedulesContent() {
  const { userAccount } = useAuth();
  const searchParams = useSearchParams();
  const [isDark, setIsDark] = useState(false);
  const [subjects, setSubjects] = useState<SubjectData[]>([]);
  const [students, setStudents] = useState<StudentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<SubjectData | null>(null);
  const [filteredStudents, setFilteredStudents] = useState<StudentData[]>([]);
  const [nowMinutes, setNowMinutes] = useState(getNowMinutes());
  const [teacherConfig, setTeacherConfig] = useState<any>(null);
  
  // Attendance state
  const [isAttendanceMode, setIsAttendanceMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [selectedHours, setSelectedHours] = useState(1);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [fromSection, setFromSection] = useState<'current' | 'all'>('current');

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
          const [allSubjects, allStudents, teacherData] = await Promise.all([
            schoolDatabaseService.getAllSubjects(userAccount.schoolFirebaseConfig),
            schoolDatabaseService.getAllStudents(userAccount.schoolFirebaseConfig),
            schoolDatabaseService.getTeacherConfig(userAccount.schoolFirebaseConfig, userAccount.userId),
          ]);
          const teacherSubjects = allSubjects.filter(s => s.teacherId === userAccount.userId);
          setSubjects(teacherSubjects);
          setStudents(allStudents);
          setTeacherConfig(teacherData);
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

  // Handle mode=attendance query parameter
  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode === 'attendance' && currentSubjects.length > 0 && !loading) {
      // Auto-select first current subject and open attendance
      handleSelectSubject(currentSubjects[0], 'current');
    }
  }, [searchParams, currentSubjects, loading]);

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

  const handleSelectSubject = async (subject: SubjectData, section: 'current' | 'all' = 'current') => {
    setSelectedSubject(subject);
    setFromSection(section);
    const matched = students
      .filter(s => s.class === subject.classroom)
      .sort((a, b) => {
        const numA = parseInt(a.number) || 0;
        const numB = parseInt(b.number) || 0;
        return numA - numB;
      });
    setFilteredStudents(matched);
    
    // Set default hours from subject duration
    if (subject.duration) {
      setSelectedHours(parseInt(subject.duration) || 1);
    }
    
    // Auto-open attendance mode for current subjects
    if (section === 'current' && teacherConfig?.firebaseConfig) {
      await handleOpenAttendance();
    }
  };

  const handleOpenAttendance = async () => {
    if (!selectedSubject) {
      alert('กรุณาเลือกวิชาก่อน');
      return;
    }
    
    // Use teacher's Firebase config if available, otherwise use school config (for admin teachers)
    const firebaseConfig = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
    
    if (!firebaseConfig) {
      alert('ไม่พบ Firebase Config กรุณาติดต่อผู้ดูแลระบบ');
      return;
    }
    
    setIsAttendanceMode(true);
    setLoadingAttendance(true);
    
    try {
      const existingAttendance = await teacherDatabaseService.getAttendance(
        firebaseConfig,
        selectedSubject.subjectId,
        selectedSubject.classroom,
        selectedDate
      );
      
      if (existingAttendance) {
        setAttendanceRecords(existingAttendance.records);
        setSelectedHours(existingAttendance.hours);
      } else {
        // Initialize empty records
        const initialRecords: AttendanceRecord[] = filteredStudents.map(s => ({
          studentId: s.studentId,
          name: s.name,
          number: s.number,
          status: ''
        }));
        setAttendanceRecords(initialRecords);
      }
    } catch (error) {
      console.error('Error loading attendance:', error);
      const initialRecords: AttendanceRecord[] = filteredStudents.map(s => ({
        studentId: s.studentId,
        name: s.name,
        number: s.number,
        status: ''
      }));
      setAttendanceRecords(initialRecords);
    } finally {
      setLoadingAttendance(false);
    }
  };

  const handleMarkAllPresent = () => {
    setAttendanceRecords(records => 
      records.map(r => ({ ...r, status: 'มา' as const }))
    );
  };

  const handleStatusChange = (studentId: string, status: string) => {
    setAttendanceRecords(records => 
      records.map(r => r.studentId === studentId ? { ...r, status: status as AttendanceRecord['status'] } : r)
    );
  };

  const handleSaveAttendance = async () => {
    if (!selectedSubject) return;
    
    // Use teacher's Firebase config if available, otherwise use school config (for admin teachers)
    const firebaseConfig = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
    
    if (!firebaseConfig) {
      alert('ไม่พบ Firebase Config กรุณาติดต่อผู้ดูแลระบบ');
      return;
    }
    
    setLoadingAttendance(true);
    try {
      const attendanceData: AttendanceData = {
        subjectId: selectedSubject.subjectId,
        subjectName: selectedSubject.subjectName,
        classroom: selectedSubject.classroom,
        date: selectedDate,
        hours: selectedHours,
        records: attendanceRecords,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      await teacherDatabaseService.saveAttendance(firebaseConfig, attendanceData);
      alert('บันทึกเช็คชื่อสำเร็จ');
      setIsAttendanceMode(false);
    } catch (error) {
      console.error('Error saving attendance:', error);
      alert('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setLoadingAttendance(false);
    }
  };

  const handleDateChange = (daysOffset: number) => {
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + daysOffset);
    setSelectedDate(formatDate(newDate));
  };

  // Calculate attendance summary for a student
  const calculateAttendanceSummary = (studentId: string) => {
    if (!selectedSubject || !teacherConfig?.firebaseConfig) return null;
    // This would be implemented when we have attendance data
    return null;
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
                        onClick={() => handleSelectSubject(subject, 'current')}
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
                        onClick={() => handleSelectSubject(subject, 'all')}
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
          ) : isAttendanceMode ? (
            <motion.div
              key="attendance"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
            >
              {/* Fixed Dock */}
              <div className={`sticky top-0 z-10 -mx-6 px-6 py-4 mb-6 border-b ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-3 mb-4">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setIsAttendanceMode(false)}
                    className={`p-2 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                  >
                    <ChevronLeft size={24} />
                  </motion.button>
                  <div className="flex-1">
                    <h1 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      เช็คชื่อ: {selectedSubject.subjectName}
                    </h1>
                    <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      ห้อง {selectedSubject.classroom}
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  {/* Date picker */}
                  <div className="flex items-center gap-2">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleDateChange(-1)}
                      className={`p-2 rounded-lg ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                    >
                      ←
                    </motion.button>
                    <span className={`font-medium min-w-[100px] text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {selectedDate}
                    </span>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleDateChange(1)}
                      className={`p-2 rounded-lg ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                    >
                      →
                    </motion.button>
                  </div>
                  
                  {/* Hours dropdown */}
                  <select
                    value={selectedHours}
                    onChange={(e) => setSelectedHours(parseInt(e.target.value))}
                    className={`px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                  >
                    <option value={1}>1 hr.</option>
                    <option value={2}>2 hrs.</option>
                    <option value={3}>3 hrs.</option>
                  </select>
                  
                  {/* Save button */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleSaveAttendance}
                    disabled={loadingAttendance}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${loadingAttendance ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${isDark ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}
                  >
                    <Save size={18} />
                    บันทึก
                  </motion.button>
                </div>
              </div>

              {/* Mark all present button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleMarkAllPresent}
                className={`w-full mb-4 p-3 rounded-xl flex items-center justify-center gap-2 font-medium ${isDark ? 'bg-green-600/20 text-green-400 border border-green-600/50' : 'bg-green-50 text-green-600 border border-green-300'}`}
              >
                <CheckCircle2 size={20} />
                มาทั้งหมด
              </motion.button>

              {/* Student list with status dropdown */}
              {loadingAttendance ? (
                <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  กำลังโหลด...
                </div>
              ) : attendanceRecords.length > 0 ? (
                <div className="space-y-2">
                  {attendanceRecords.map((record, index) => (
                    <motion.div
                      key={record.studentId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className={`flex items-center gap-3 p-3 rounded-xl ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}
                    >
                      <span className={`w-12 text-center font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        {record.number}
                      </span>
                      <span className={`flex-1 font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {record.name}
                      </span>
                      <select
                        value={record.status}
                        onChange={(e) => handleStatusChange(record.studentId, e.target.value)}
                        className={`px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-gray-600 border-gray-500 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                      >
                        <option value="">เลือก</option>
                        <option value="มา">มา</option>
                        <option value="ขาด">ขาด</option>
                        <option value="สาย">สาย</option>
                        <option value="ลาป่วย">ลาป่วย</option>
                        <option value="ลากิจ">ลากิจ</option>
                        <option value="กิจกรรม">กิจกรรม</option>
                        <option value="หนี">หนี</option>
                      </select>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  ไม่พบนักเรียนในห้องนี้
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
                <div className="flex-1">
                  <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {selectedSubject.subjectName}
                  </h1>
                  <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    ห้อง {selectedSubject.classroom} | {filteredStudents.length} คน
                  </p>
                </div>
                {fromSection === 'all' && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleOpenAttendance}
                    className={`p-2 rounded-xl ${isDark ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'}`}
                  >
                    <ClipboardList size={24} />
                  </motion.button>
                )}
              </div>

              {filteredStudents.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className={isDark ? 'border-b border-gray-600' : 'border-b border-gray-200'}>
                        <th className={`py-3 px-4 text-left text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>เลขที่</th>
                        <th className={`py-3 px-4 text-left text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>เลขประจำตัว</th>
                        <th className={`py-3 px-4 text-left text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>ชื่อ</th>
                        {fromSection === 'all' && (
                          <>
                            <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>มา</th>
                            <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>ขาด</th>
                            <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>สาย</th>
                            <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>ลา</th>
                            <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>%</th>
                          </>
                        )}
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
                          {fromSection === 'all' && (
                            <>
                              <td className={`py-3 px-4 text-sm text-center ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>-</td>
                              <td className={`py-3 px-4 text-sm text-center ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>-</td>
                              <td className={`py-3 px-4 text-sm text-center ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>-</td>
                              <td className={`py-3 px-4 text-sm text-center ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>-</td>
                              <td className={`py-3 px-4 text-sm text-center ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>-</td>
                            </>
                          )}
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

export default function SchedulesPage() {
  return (
    <Suspense fallback={<div className="p-6">กำลังโหลด...</div>}>
      <SchedulesContent />
    </Suspense>
  );
}
