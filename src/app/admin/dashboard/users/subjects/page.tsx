'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import * as XLSX from 'xlsx';
import { Download, Upload, Trash2, Plus } from 'lucide-react';

export default function SubjectsManagement() {
  const router = useRouter();
  const { userAccount } = useAuth();
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [newSubject, setNewSubject] = useState({
    teacherId: '',
    subjectName: '',
    classroom: '',
    day: '',
    time: ''
  });

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

  const loadData = async () => {
    try {
      if (!userAccount?.schoolFirebaseConfig) return;
      const [subjectsData, teachersData] = await Promise.all([
        schoolDatabaseService.getAllSubjects(userAccount.schoolFirebaseConfig),
        schoolDatabaseService.getAllTeachers(userAccount.schoolFirebaseConfig)
      ]);
      setSubjects(subjectsData);
      setTeachers(teachersData);
    } catch (error) {
      console.error('Error loading data:', error);
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
          'เวลา': ''
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
        'เวลา': s.time
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

      const subjectsData = jsonData.map((row: any, index: number) => ({
        subjectId: `SUB${Date.now()}_${index}`,
        teacherId: row['เลขประจำตัวครู'] || '',
        subjectName: row['วิชา'] || '',
        classroom: row['ห้อง'] || '',
        day: row['วัน'] || '',
        time: row['เวลา'] || ''
      }));

      await schoolDatabaseService.saveSubjectWhitelist(userAccount.schoolFirebaseConfig, subjectsData);
      await loadData();
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
      await loadData();
      setShowAddModal(false);
      setNewSubject({
        teacherId: '',
        subjectName: '',
        classroom: '',
        day: '',
        time: ''
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
      await loadData();
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

  return (
    <div className={`min-h-screen p-6 pb-24 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
            จัดการวิชาเรียน
          </h1>
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            SUBJECTS MANAGEMENT
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => router.push('/admin/dashboard/users')}
          className={`px-6 py-3 rounded-2xl shadow-sm hover:shadow-md transition-all ${isDark ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-700'}`}
        >
          กลับ
        </motion.button>
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
            รายชื่อวิชาเรียนทั้งหมด ({subjects.length})
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

        {subjects.length === 0 ? (
          <p className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            ยังไม่มีข้อมูลวิชาเรียน
          </p>
        ) : (
          <div className="space-y-6">
            {Object.keys(groupedSubjects).sort().map((teacherId, classIndex) => (
              <div key={teacherId}>
                <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  {getTeacherName(teacherId)} ({groupedSubjects[teacherId].length})
                </h3>
                <div className="space-y-3">
                  {groupedSubjects[teacherId].map((subject: any, index: number) => (
                    <motion.div
                      key={subject.subjectId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + classIndex * 0.1 + index * 0.02 }}
                      whileHover={{ scale: 1.01, x: 5 }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        toggleSubjectSelection(subject.subjectId);
                      }}
                      onTouchStart={() => handleSubjectTouchStart(subject.subjectId)}
                      onTouchEnd={handleSubjectTouchEnd}
                      onTouchMove={handleSubjectTouchMove}
                      className={`rounded-2xl p-4 cursor-pointer transition-all ${selectedSubjects.has(subject.subjectId) ? 'bg-red-100 border-2 border-red-500' : isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-blue-50'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>{subject.subjectName}</p>
                          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            ห้อง {subject.classroom} • {subject.day} • {subject.time}
                          </p>
                        </div>
                        {selectedSubjects.has(subject.subjectId) && (
                          <span className="text-red-500">✓</span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
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
