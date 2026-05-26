'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import * as XLSX from 'xlsx';
import { Download, Upload, Trash2, Plus, ArrowLeft } from 'lucide-react';

export default function SubjectsManagement() {
  const router = useRouter();
  const { userAccount, invalidateCache } = useAuth();
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [touchStartX, setTouchStartX] = useState(0);
  const [isDark, setIsDark] = useState(false);
  const [newSubject, setNewSubject] = useState({
    teacherId: '',
    subjectName: '',
    classroom: '',
    day: '',
    time: '',
    duration: '1'
  });
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [showTeacherDropdown, setShowTeacherDropdown] = useState(false);
  const [showDurationDropdown, setShowDurationDropdown] = useState(false);
  const lastLoadedConfigRef = useRef<string | null>(null);

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
    loadData();
  }, [userAccount]);

  const loadData = async (force = false) => {
    try {
      if (!userAccount?.schoolFirebaseConfig) return;
      const configKey = userAccount.schoolFirebaseConfig.projectId;
      if (!force && configKey === lastLoadedConfigRef.current) return;
      setLoading(true);
      const [subjectsData, teachersData] = await Promise.all([
        schoolDatabaseService.getAllSubjects(userAccount.schoolFirebaseConfig),
        schoolDatabaseService.getAllTeachers(userAccount.schoolFirebaseConfig)
      ]);
      setSubjects(subjectsData);
      setTeachers(teachersData);
      lastLoadedConfigRef.current = configKey;
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (subjects.length === 0) {
      const template = [
        {
          'เลขประจำตัวครู': '',
          'วิชา': '',
          'ห้อง': '',
          'วัน': '',
          'เวลา': '',
          'จำนวนชั่วโมง': ''
        }
      ];
      const worksheet = XLSX.utils.json_to_sheet(template);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'วิชาเรียน');
      XLSX.writeFile(workbook, 'รายชื่อวิชาเรียน_template.xlsx');
    } else {
      const data = subjects.map(s => ({
        'เลขประจำตัวครู': s.teacherId,
        'วิชา': s.subjectName,
        'ห้อง': s.classroom,
        'วัน': s.day,
        'เวลา': s.time,
        'จำนวนชั่วโมง': s.duration || 1
      }));
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'วิชาเรียน');
      XLSX.writeFile(workbook, 'รายชื่อวิชาเรียน.xlsx');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!userAccount?.schoolFirebaseConfig) {
      alert('ไม่พบ School Firebase Config');
      return;
    }

    setLoading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      // Parse classroom field to handle multiple classes (comma-separated)
      const subjectsData: any[] = [];
      jsonData.forEach((row: any, index: number) => {
        const classroomStr = row['ห้อง'] || '';
        const classrooms = classroomStr.split(',').map((c: string) => c.trim()).filter((c: string) => c);
        
        if (classrooms.length > 0) {
          classrooms.forEach((classroom: string) => {
            // Replace "/" with "-" in classroom name for valid Firestore document ID
            // e.g., "ม.1/1" → "ม.1-1"
            const safeClassroom = classroom.replace(/\//g, '-');
            subjectsData.push({
              subjectId: `SUB${Date.now()}_${index}_${safeClassroom}`,
              teacherId: row['เลขประจำตัวครู'] || '',
              subjectName: row['วิชา'] || '',
              classroom: classroom,
              day: row['วัน'] || '',
              time: row['เวลา'] || '',
              duration: row['จำนวนชั่วโมง'] || '1'
            });
          });
        }
      });

      // Delete ALL existing subjects
      const existingSubjects = await schoolDatabaseService.getAllSubjects(userAccount.schoolFirebaseConfig);
      for (const subject of existingSubjects) {
        try {
          await schoolDatabaseService.deleteSubject(userAccount.schoolFirebaseConfig, subject.subjectId);
        } catch (error) {
          console.error('Error deleting subject:', subject.subjectId, error);
        }
      }

      // Save all new subjects from the file
      await schoolDatabaseService.saveSubjectWhitelist(userAccount.schoolFirebaseConfig, subjectsData);
      await loadData(true);
      invalidateCache();
      alert('อัพโหลดรายชื่อวิชาเรียนสำเร็จ');
    } catch (error) {
      console.error('Error uploading subjects:', error);
      alert('ไม่สามารถอัพโหลดรายชื่อวิชาเรียนได้');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubject = async () => {
    if (!userAccount?.schoolFirebaseConfig) return;
    if (!newSubject.teacherId || !newSubject.subjectName) {
      alert('กรุณากรอกข้อมูลให้ครบ');
      return;
    }

    setLoading(true);
    try {
      const subject = {
        subjectId: `SUB${Date.now()}`,
        ...newSubject
      };
      await schoolDatabaseService.addSubject(userAccount.schoolFirebaseConfig, subject);
      await loadData(true);
      invalidateCache();
      setShowAddModal(false);
      setNewSubject({
        teacherId: '',
        subjectName: '',
        classroom: '',
        day: '',
        time: '',
        duration: '1'
      });
      alert('เพิ่มวิชาเรียนสำเร็จ');
    } catch (error) {
      console.error('Error adding subject:', error);
      alert('ไม่สามารถเพิ่มวิชาเรียนได้');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedSubjects.size === 0) return;
    if (!userAccount?.schoolFirebaseConfig) return;

    if (!confirm(`ยืนยันการลบ ${selectedSubjects.size} วิชาเรียน?`)) return;

    setLoading(true);
    try {
      const subjectIdsArray = Array.from(selectedSubjects);
      for (const subjectId of subjectIdsArray) {
        await schoolDatabaseService.deleteSubject(userAccount.schoolFirebaseConfig, subjectId);
      }
      setSelectedSubjects(new Set());
      await loadData(true);
      invalidateCache();
      alert('ลบวิชาเรียนสำเร็จ');
    } catch (error) {
      console.error('Error deleting subjects:', error);
      alert('ไม่สามารถลบวิชาเรียนได้');
    } finally {
      setLoading(false);
    }
  };

  const toggleSubjectSelection = (subjectId: string) => {
    const newSelection = new Set(selectedSubjects);
    if (newSelection.has(subjectId)) {
      newSelection.delete(subjectId);
    } else {
      newSelection.add(subjectId);
    }
    setSelectedSubjects(newSelection);
  };

  const handleSubjectTouchStart = (subjectId: string) => {
    const timer = setTimeout(() => {
      toggleSubjectSelection(subjectId);
    }, 500);
    setLongPressTimer(timer);
  };

  const handleSubjectTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleSubjectTouchMove = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  // Swipe gesture handlers for back navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    const touchX = e.touches[0].clientX;
    
    // Prevent iOS Safari edge swipe-to-go-back gesture
    if (touchX < 50) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Only allow swipe from left edge (within 50px)
    if (touchX < 50) {
      setTouchStartX(touchX);
      setIsSwiping(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - touchStartX;
    
    // Only track left-to-right swipe
    if (diff > 0) {
      const progress = Math.min(diff / 200, 1); // 200px threshold
      setSwipeProgress(progress);
    }
  };

  const handleTouchEnd = () => {
    if (!isSwiping) return;
    
    // If swiped more than 50% of threshold, go back
    if (swipeProgress > 0.5) {
      router.back();
    }
    
    // Reset state
    setSwipeProgress(0);
    setIsSwiping(false);
    setTouchStartX(0);
  };

  // Trackpad gesture handlers for laptops
  const handleWheel = (e: React.WheelEvent) => {
    // Check if it's a horizontal scroll (trackpad gesture)
    // Mac trackpad: deltaX negative = left-to-right swipe (back gesture)
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && e.deltaX < -50) {
      // Left-to-right scroll - trigger back immediately
      router.back();
    }
  };

  // Group subjects by teacher
  const groupedSubjects = subjects.reduce((acc: any, subject: any) => {
    const teacherId = subject.teacherId || 'ไม่ระบุครู';
    if (!acc[teacherId]) {
      acc[teacherId] = [];
    }
    acc[teacherId].push(subject);
    return acc;
  }, {});

  // Get teacher name by ID
  const getTeacherName = (teacherId: string) => {
    const teacher = teachers.find(t => t.teacherId === teacherId);
    return teacher ? teacher.name : teacherId;
  };

  // Filter subjects by selected teacher
  const filteredSubjects = selectedTeacherId 
    ? subjects.filter(s => s.teacherId === selectedTeacherId)
    : [];

  // Group filtered subjects by day only (don't combine duration)
  const groupedByDay = filteredSubjects.reduce((acc: any, subject: any) => {
    const day = subject.day || 'ไม่ระบุวัน';
    if (!acc[day]) {
      acc[day] = [];
    }
    acc[day].push(subject);
    return acc;
  }, {});

  const handleTeacherSelect = (teacherId: string) => {
    setSelectedTeacherId(teacherId);
    setShowTeacherDropdown(false);
  };

  const selectedTeacher = teachers.find(t => t.teacherId === selectedTeacherId);

  // Helper function to convert Thai day names to English 3-letter abbreviations
  const convertDayToEnglish = (day: string) => {
    const dayMap: { [key: string]: string } = {
      'จันทร์': 'Mon',
      'อังคาร': 'Tue',
      'พุธ': 'Wed',
      'พฤหัสบดี': 'Thu',
      'ศุกร์': 'Fri',
      'เสาร์': 'Sat',
      'อาทิตย์': 'Sun',
      'Mon': 'Mon',
      'Tue': 'Tue',
      'Wed': 'Wed',
      'Thu': 'Thu',
      'Fri': 'Fri',
      'Sat': 'Sat',
      'Sun': 'Sun'
    };
    return dayMap[day] || day;
  };

  // Day order for sorting (Monday to Sunday)
  const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  if (loading && subjects.length === 0) {
    return (
      <div className={`min-h-screen p-6 pb-24 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <h1 className={`text-3xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-800'}`}>จัดการวิชาเรียน</h1>
        <div className="animate-pulse space-y-4">
          <div className={`h-12 rounded-2xl ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`} />
          <div className={`h-10 w-48 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`rounded-2xl p-4 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
              <div className="space-y-2">
                <div className={`h-4 w-40 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
                <div className={`h-3 w-28 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
                <div className={`h-3 w-20 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`min-h-screen p-6 pb-24 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* Swipe visual feedback */}
      {isSwiping && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: swipeProgress * 0.3 }}
          className="fixed inset-0 bg-black pointer-events-none z-50"
        />
      )}
      
      {/* Swipe indicator arrow */}
      {isSwiping && swipeProgress > 0.1 && (
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: swipeProgress, x: swipeProgress * 100 - 50 }}
          className="fixed left-4 top-1/2 -translate-y-1/2 z-50 pointer-events-none"
        >
          <ArrowLeft size={48} className="text-white opacity-50" />
        </motion.div>
      )}
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className={`text-3xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-800'}`}>
          จัดการข้อมูลวิชาเรียน
        </h1>
        
        {/* Teacher Dropdown */}
        <div className={`flex items-center gap-3 p-4 rounded-2xl shadow-sm ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          {/* Back Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push('/admin/dashboard/users')}
            className={`p-2 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
          >
            <ArrowLeft size={20} />
          </motion.button>

          {/* Custom Teacher Dropdown */}
          <div className="flex-1 relative">
            <div
              onClick={() => setShowTeacherDropdown(!showTeacherDropdown)}
              className={`w-full px-4 py-2 rounded-xl cursor-pointer flex items-center justify-between ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              <span>{selectedTeacher ? selectedTeacher.name : 'เลือกครู'}</span>
              <motion.span
                animate={{ rotate: showTeacherDropdown ? 180 : 0 }}
                className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
              >
                ▼
              </motion.span>
            </div>
            
            {/* Dropdown List */}
            {showTeacherDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`absolute top-full left-0 right-0 mt-2 rounded-xl shadow-lg z-50 max-h-64 overflow-y-auto ${isDark ? 'bg-gray-800' : 'bg-white'}`}
              >
                {teachers.map((teacher) => (
                  <div
                    key={teacher.teacherId}
                    onClick={() => handleTeacherSelect(teacher.teacherId)}
                    className={`p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${isDark ? 'text-white' : 'text-gray-800'}`}
                  >
                    <div className="font-medium">{teacher.name}</div>
                    <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {teacher.teacherId}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Subjects List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={`rounded-2xl p-6 shadow-lg ${isDark ? 'bg-gray-800' : 'bg-white'}`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
            {selectedTeacherId 
              ? `ข้อมูลวิชาที่สอน (${Object.keys(groupedByDay).length} วัน)`
              : 'รายชื่อวิชาเรียนทั้งหมด'
            }
          </h2>
          {selectedSubjects.size > 0 && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDeleteSelected}
              className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-xl"
            >
              <Trash2 size={16} />
              <span>ลบ {selectedSubjects.size} รายการ</span>
            </motion.button>
          )}
        </div>

        {!selectedTeacherId ? (
          <p className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            กรุณาเลือกครูเพื่อดูวิชาที่สอน
          </p>
        ) : Object.keys(groupedByDay).length === 0 ? (
          <p className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            ยังไม่มีข้อมูลวิชาเรียนสำหรับครูท่านนี้
          </p>
        ) : (
          <div className="space-y-4">
            {Object.keys(groupedByDay)
              .sort((a, b) => {
                const dayA = convertDayToEnglish(a);
                const dayB = convertDayToEnglish(b);
                const indexA = dayOrder.indexOf(dayA);
                const indexB = dayOrder.indexOf(dayB);
                return indexA - indexB;
              })
              .map((day, dayIndex) => (
              <div key={day}>
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + dayIndex * 0.1 }}
                  className={`rounded-2xl p-4 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}
                >
                  <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-800'}`}>
                    {convertDayToEnglish(day)}
                  </h3>
                  <div className="space-y-2">
                    {groupedByDay[day]
                      .sort((a: any, b: any) => {
                        // Sort by time (extract start time from time range)
                        const timeA = a.time.split('-')[0] || a.time;
                        const timeB = b.time.split('-')[0] || b.time;
                        return timeA.localeCompare(timeB);
                      })
                      .map((subject: any, index: number) => (
                      <motion.div
                        key={subject.subjectId}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + dayIndex * 0.1 + index * 0.02 }}
                        whileHover={{ scale: 1.01, x: 5 }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          toggleSubjectSelection(subject.subjectId);
                        }}
                        onTouchStart={() => handleSubjectTouchStart(subject.subjectId)}
                        onTouchEnd={handleSubjectTouchEnd}
                        onTouchMove={handleSubjectTouchMove}
                        className={`rounded-xl p-3 cursor-pointer transition-all ${selectedSubjects.has(subject.subjectId) ? 'bg-red-100 border-2 border-red-500' : isDark ? 'bg-gray-600 hover:bg-gray-500' : 'bg-white hover:bg-blue-50'}`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>{subject.subjectName}</p>
                            <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                              ห้อง {subject.classroom} • {subject.time} • {subject.duration === '1' ? '1hr.' : `${subject.duration}hrs.`}
                            </p>
                          </div>
                          {selectedSubjects.has(subject.subjectId) && (
                            <span className="text-red-500">✓</span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Footer Dock */}
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="fixed bottom-0 left-0 right-0 z-40"
      >
        <div className={`dock-container relative px-6 py-3 shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="flex items-center justify-center gap-6 max-w-4xl mx-auto">
            {/* Download Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDownload}
              className={`flex items-center justify-center p-4 rounded-xl transition-colors w-24 ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
            >
              <Download size={28} />
            </motion.button>

            {/* Hero Action Button (Larger) */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowAddModal(true)}
              className="hero-action-button relative z-50 flex items-center justify-center p-5 rounded-3xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg transition-all w-32"
              style={{
                boxShadow: '0 8px 20px rgba(59, 130, 246, 0.4)'
              }}
            >
              <Plus size={32} />
            </motion.button>

            {/* Upload Button */}
            <div className={`relative p-4 rounded-xl transition-colors w-24 flex items-center justify-center ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
              <input
                type="file"
                accept=".xlsx"
                onChange={handleUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Upload size={28} className={isDark ? 'text-gray-300' : 'text-gray-700'} />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Add Subject Modal */}
      {showAddModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setShowAddModal(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className={`rounded-2xl p-6 max-w-md w-full shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                เพิ่มวิชาเรียน
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className={`text-2xl ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-1`}>
                  เลขประจำตัวครู
                </label>
                <select
                  value={newSubject.teacherId}
                  onChange={(e) => setNewSubject({ ...newSubject, teacherId: e.target.value })}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                >
                  <option value="">เลือกครู</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.teacherId} value={teacher.teacherId}>
                      {teacher.teacherId} - {teacher.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-1`}>
                  วิชา
                </label>
                <input
                  type="text"
                  value={newSubject.subjectName}
                  onChange={(e) => setNewSubject({ ...newSubject, subjectName: e.target.value })}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                  placeholder="ชื่อวิชา"
                />
              </div>
              <div>
                <label className={`block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-1`}>
                  ห้อง
                </label>
                <input
                  type="text"
                  value={newSubject.classroom}
                  onChange={(e) => setNewSubject({ ...newSubject, classroom: e.target.value })}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                  placeholder="เช่น 301"
                />
              </div>
              <div>
                <label className={`block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-1`}>
                  วัน
                </label>
                <input
                  type="text"
                  value={newSubject.day}
                  onChange={(e) => setNewSubject({ ...newSubject, day: e.target.value })}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                  placeholder="เช่น จันทร์"
                />
              </div>
              <div>
                <label className={`block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-1`}>
                  เวลา
                </label>
                <input
                  type="text"
                  value={newSubject.time}
                  onChange={(e) => setNewSubject({ ...newSubject, time: e.target.value })}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                  placeholder="เช่น 08:00-09:00"
                />
              </div>
              <div>
                <label className={`block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-1`}>
                  จำนวนชั่วโมง
                </label>
                <div className="relative">
                  <div
                    onClick={() => setShowDurationDropdown(!showDurationDropdown)}
                    className={`w-full p-3 rounded-xl cursor-pointer flex items-center justify-between border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                  >
                    <span>{newSubject.duration === '1' ? '1hr.' : `${newSubject.duration}hrs.`}</span>
                    <motion.span
                      animate={{ rotate: showDurationDropdown ? 180 : 0 }}
                      className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
                    >
                      ▼
                    </motion.span>
                  </div>
                  
                  {/* Duration Dropdown List */}
                  {showDurationDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`absolute top-full left-0 right-0 mt-2 rounded-xl shadow-lg z-50 ${isDark ? 'bg-gray-800' : 'bg-white'}`}
                    >
                      {['1', '2', '3'].map((duration) => (
                        <div
                          key={duration}
                          onClick={() => {
                            setNewSubject({ ...newSubject, duration });
                            setShowDurationDropdown(false);
                          }}
                          className={`p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${isDark ? 'text-white' : 'text-gray-800'}`}
                        >
                          {duration === '1' ? '1hr.' : `${duration}hrs.`}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowAddModal(false)}
                className={`flex-1 py-3 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}
              >
                ยกเลิก
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleAddSubject}
                className="flex-1 bg-blue-500 text-white py-3 rounded-xl"
              >
                เพิ่ม
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}

    </div>
  );
}
