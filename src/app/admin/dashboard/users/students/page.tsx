'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import { firestoreService } from '@/services/firestore.service';
import { teacherDatabaseService } from '@/services/teacher-database.service';
import * as XLSX from 'xlsx';
import { Download, Upload, Trash2, Edit, Eye, EyeOff, RefreshCw, Plus, ArrowLeft, Search, X } from 'lucide-react';

export default function StudentsManagement() {
  const router = useRouter();
  const { userAccount, invalidateCache } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [studentsToDelete, setStudentsToDelete] = useState<any[]>([]);
  const [studentsToAdd, setStudentsToAdd] = useState<any[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingStudentsData, setPendingStudentsData] = useState<any[]>([]);
  const [isDark, setIsDark] = useState(false);
  const [openClass, setOpenClass] = useState<string | null>(null);
  const [showUID, setShowUID] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editStudentData, setEditStudentData] = useState({
    studentId: '',
    name: '',
    class: '',
    number: ''
  });
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [touchStartX, setTouchStartX] = useState(0);
  const [newStudentData, setNewStudentData] = useState({
    studentId: '',
    name: '',
    class: '',
    number: '',
    email: ''
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<string | null>(null);

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
    loadStudents();
  }, [userAccount]);

  const loadStudents = async () => {
    try {
      console.log('loadStudents called, schoolFirebaseConfig:', userAccount?.schoolFirebaseConfig);
      if (!userAccount?.schoolFirebaseConfig) {
        console.log('No schoolFirebaseConfig, skipping loadStudents');
        return;
      }
      const data = await schoolDatabaseService.getAllStudents(userAccount.schoolFirebaseConfig);
      console.log('Students data loaded:', data);
      setStudents(data);
    } catch (error) {
      console.error('Error loading students:', error);
    }
  };

  const filteredStudents = students.filter(student =>
    student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.studentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (student.email && student.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (student.class && student.class.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleDownload = () => {
    if (students.length === 0) {
      // Download template with headers only
      const template = [
        {
          'เลขประจำตัวนักเรียน': '',
          'ชื่อ-สกุล': '',
          'ชั้น': '',
          'เลขที่': '',
          'Email': ''
        }
      ];
      const worksheet = XLSX.utils.json_to_sheet(template);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'นักเรียน');
      XLSX.writeFile(workbook, 'รายชื่อนักเรียน_template.xlsx');
    } else {
      // Download all students
      const data = students.map(s => ({
        'เลขประจำตัวนักเรียน': s.studentId,
        'ชื่อ-สกุล': s.name,
        'ชั้น': s.class,
        'เลขที่': s.number,
        'Email': s.email || ''
      }));
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'นักเรียน');
      XLSX.writeFile(workbook, 'รายชื่อนักเรียน.xlsx');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!userAccount?.schoolFirebaseConfig) {
      alert('ไม่พบ School Firebase Config กรุณาทำ Admin Setup ก่อน');
      return;
    }

    setLoading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const studentsData = jsonData.map((row: any) => ({
        studentId: row['เลขประจำตัวนักเรียน'] || '',
        name: row['ชื่อ-สกุล'] || '',
        class: row['ชั้น'] || '',
        number: row['เลขที่'] || '',
        schoolId: userAccount.schoolId || 'default',
        teacherNodes: []
      }));

      // Get existing students
      const existingStudents = await schoolDatabaseService.getAllStudents(userAccount.schoolFirebaseConfig);
      const newStudentIds = studentsData.map(s => s.studentId);
      const existingStudentIds = existingStudents.map(s => s.studentId);
      
      // Find students to delete (in old but not in new)
      const studentsToDelete = existingStudents.filter(s => !newStudentIds.includes(s.studentId));
      
      // Find students to add (in new but not in old)
      const studentsToAdd = studentsData.filter(s => !existingStudentIds.includes(s.studentId));

      // If there are students to delete or add, show confirmation dialog
      if (studentsToDelete.length > 0 || studentsToAdd.length > 0) {
        setStudentsToDelete(studentsToDelete);
        setStudentsToAdd(studentsToAdd);
        setPendingStudentsData(studentsData);
        setShowDeleteConfirm(true);
        setLoading(false);
        return;
      }

      // No changes, proceed with upload
      await schoolDatabaseService.saveStudentWhitelist(userAccount.schoolFirebaseConfig, studentsData);
      await loadStudents();
      alert('อัพโหลดรายชื่อนักเรียนสำเร็จ');
    } catch (error) {
      console.error('Error uploading students:', error);
      alert('ไม่สามารถอัพโหลดรายชื่อนักเรียนได้');
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteAndUpload = async () => {
    if (!userAccount?.schoolFirebaseConfig) {
      alert('ไม่พบ School Firebase Config');
      setShowDeleteConfirm(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setShowDeleteConfirm(false);
    try {
      // Get all teachers to get their firebase configs
      const allTeachers = await schoolDatabaseService.getAllTeachers(userAccount.schoolFirebaseConfig);
      const teacherConfigs = new Map();
      for (const teacher of allTeachers) {
        if (teacher.firebaseConfig) {
          teacherConfigs.set(teacher.teacherId, teacher.firebaseConfig);
        }
      }

      // Delete students that are not in the new file
      for (const student of studentsToDelete) {
        try {
          // Delete from School Database
          await schoolDatabaseService.deleteStudent(userAccount.schoolFirebaseConfig, student.studentId);

          // Delete user account from Master Registry (if email exists)
          if (student.email) {
            await firestoreService.deleteUserAccount(student.email);
          }

          // Note: Firebase Auth deletion requires Admin SDK (server-side)
          // Cannot be done from client SDK - will need manual cleanup or server endpoint

          // Delete all student data from each Teacher Database
          if (student.teacherNodes && student.teacherNodes.length > 0) {
            for (const teacherId of student.teacherNodes) {
              const teacherConfig = teacherConfigs.get(teacherId);
              if (teacherConfig) {
                try {
                  await teacherDatabaseService.deleteAllStudentData(teacherConfig, student.studentId);
                } catch (error) {
                  console.error('Error deleting student data from teacher database:', teacherId, error);
                }
              }
            }
          }
        } catch (error) {
          console.error('Error deleting student:', student.studentId, error);
        }
      }

      // Save new students to School Database
      await schoolDatabaseService.saveStudentWhitelist(userAccount.schoolFirebaseConfig, pendingStudentsData);
      await loadStudents();
      invalidateCache();
      alert('อัพโหลดรายชื่อนักเรียนสำเร็จ');
    } catch (error) {
      console.error('Error uploading students:', error);
      alert('ไม่สามารถอัพโหลดรายชื่อนักเรียนได้');
    } finally {
      setLoading(false);
      setStudentsToDelete([]);
      setStudentsToAdd([]);
      setPendingStudentsData([]);
    }
  };

  const handleStudentClick = (student: any) => {
    setSelectedStudent(student);
    setShowPopup(true);
  };

  const handleEditStudent = () => {
    setEditStudentData({
      studentId: selectedStudent.studentId,
      name: selectedStudent.name,
      class: selectedStudent.class,
      number: selectedStudent.number
    });
    setShowEditModal(true);
    setShowPopup(false);
  };

  const handleSaveStudentEdit = async () => {
    if (!userAccount?.schoolFirebaseConfig) return;
    if (!editStudentData.studentId || !editStudentData.name || !editStudentData.class || !editStudentData.number) {
      alert('กรุณากรอกข้อมูลให้ครบ');
      return;
    }

    if (!confirm('ยืนยันการแก้ไขข้อมูลนักเรียน?')) return;

    setLoading(true);
    try {
      const oldStudentId = selectedStudent.studentId;
      const newStudentId = editStudentData.studentId;

      // If studentId changed, we need to delete old and create new
      if (oldStudentId !== newStudentId) {
        await schoolDatabaseService.deleteStudent(userAccount.schoolFirebaseConfig, oldStudentId);
      }

      await schoolDatabaseService.saveStudentData(userAccount.schoolFirebaseConfig, {
        studentId: newStudentId,
        name: editStudentData.name,
        class: editStudentData.class,
        number: editStudentData.number,
        email: selectedStudent.email || '',
        uid: selectedStudent.uid || '',
        role: selectedStudent.role || 'student',
        schoolId: selectedStudent.schoolId || userAccount.schoolId,
        teacherNodes: selectedStudent.teacherNodes || [],
        createdAt: selectedStudent.createdAt || new Date(),
        updatedAt: new Date()
      });

      await loadStudents();
      invalidateCache();
      setShowEditModal(false);
      setSelectedStudent(null);
      alert('แก้ไขข้อมูลนักเรียนสำเร็จ');
    } catch (error) {
      console.error('Error editing student:', error);
      alert('ไม่สามารถแก้ไขข้อมูลนักเรียนได้');
    } finally {
      setLoading(false);
    }
  };

  const handleUnsyncStudent = async () => {
    if (!userAccount?.schoolFirebaseConfig) return;
    if (!confirm('ยืนยันการยกเลิกการซิงค์? จะลบ email และ UID ออก')) return;

    setLoading(true);
    try {
      await schoolDatabaseService.saveStudentData(userAccount.schoolFirebaseConfig, {
        ...selectedStudent,
        email: '',
        uid: '',
        updatedAt: new Date()
      });

      // Also remove from master registry
      if (selectedStudent.email) {
        await firestoreService.deleteUserAccount(selectedStudent.email);
      }

      await loadStudents();
      setShowPopup(false);
      setSelectedStudent(null);
      alert('ยกเลิกการซิงค์สำเร็จ');
    } catch (error) {
      console.error('Error unsyncing student:', error);
      alert('ไม่สามารถยกเลิกการซิงค์ได้');
    } finally {
      setLoading(false);
    }
  };

  const toggleStudentSelection = (studentId: string) => {
    const newSelection = new Set(selectedStudents);
    if (newSelection.has(studentId)) {
      newSelection.delete(studentId);
    } else {
      newSelection.add(studentId);
    }
    setSelectedStudents(newSelection);
  };

  const handleStudentTouchStart = (studentId: string) => {
    const timer = setTimeout(() => {
      toggleStudentSelection(studentId);
    }, 500);
    setLongPressTimer(timer);
  };

  const handleStudentTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleStudentTouchMove = () => {
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

  const handleDeleteSelectedStudents = async () => {
    if (selectedStudents.size === 0) return;
    if (!userAccount?.schoolFirebaseConfig) return;

    if (!confirm(`ยืนยันการลบ ${selectedStudents.size} นักเรียน?`)) return;

    setLoading(true);
    try {
      const studentIdsArray = Array.from(selectedStudents);
      for (const studentId of studentIdsArray) {
        const student = students.find(s => s.studentId === studentId);
        if (student?.email) {
          await firestoreService.deleteUserAccount(student.email);
        }
        await schoolDatabaseService.deleteStudent(userAccount.schoolFirebaseConfig, studentId);
      }
      setSelectedStudents(new Set());
      await loadStudents();
      invalidateCache();
      alert('ลบนักเรียนสำเร็จ');
    } catch (error) {
      console.error('Error deleting students:', error);
      alert('ไม่สามารถลบนักเรียนได้');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudent = async () => {
    if (!userAccount?.schoolFirebaseConfig) return;
    if (!newStudentData.studentId || !newStudentData.name || !newStudentData.class || !newStudentData.number) {
      alert('กรุณากรอกข้อมูลให้ครบ');
      return;
    }

    setLoading(true);
    try {
      await schoolDatabaseService.saveStudentData(userAccount.schoolFirebaseConfig, {
        studentId: newStudentData.studentId,
        name: newStudentData.name,
        class: newStudentData.class,
        number: newStudentData.number,
        email: newStudentData.email,
        role: 'student',
        schoolId: userAccount.schoolId,
        teacherNodes: [],
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Also add to master registry if email is provided
      if (newStudentData.email) {
        await firestoreService.saveUserAccount(
          newStudentData.email,
          userAccount.schoolId,
          undefined,
          'student'
        );
      }

      await loadStudents();
      invalidateCache();
      setShowAddModal(false);
      setNewStudentData({
        studentId: '',
        name: '',
        class: '',
        number: '',
        email: ''
      });
      alert('เพิ่มนักเรียนสำเร็จ');
    } catch (error) {
      console.error('Error adding student:', error);
      alert('ไม่สามารถเพิ่มนักเรียนได้');
    } finally {
      setLoading(false);
    }
  };

  // Group students by class and sort by studentId
  const groupedStudents = filteredStudents.reduce((acc: any, student: any) => {
    const className = student.class || 'ไม่ระบุชั้น';
    if (!acc[className]) {
      acc[className] = [];
    }
    acc[className].push(student);
    return acc;
  }, {});

  // Sort each group by studentId
  Object.keys(groupedStudents).forEach(className => {
    groupedStudents[className].sort((a: any, b: any) => {
      return a.studentId.localeCompare(b.studentId);
    });
  });

  // Group classes by base level (e.g., M.1/1, M.1/2, M.1/3 -> M.1)
  const classGroups = Object.keys(groupedStudents).reduce((acc: any, className) => {
    // Extract base level (e.g., "M.1" from "M.1/1" or "ม.1/1")
    const baseLevel = className.split('/')[0];
    if (!acc[baseLevel]) {
      acc[baseLevel] = [];
    }
    acc[baseLevel].push(className);
    return acc;
  }, {});

  // Sort classes within each group
  Object.keys(classGroups).forEach(baseLevel => {
    classGroups[baseLevel].sort();
  });

  // Sort base levels
  const sortedBaseLevels = Object.keys(classGroups).sort();

  const handleClassClick = (className: string) => {
    setSelectedClass(className);
  };

  const handleBackToClasses = () => {
    setSelectedClass(null);
  };

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
          จัดการข้อมูลนักเรียน
        </h1>
        
        {/* Search Header */}
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

          {/* Search Input */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="ค้นหานักเรียน..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className={`w-full px-4 py-2 rounded-xl outline-none ${isDark ? 'bg-gray-700 text-white placeholder-gray-400' : 'bg-gray-100 text-gray-700 placeholder-gray-400'}`}
            />
          </div>
        </div>
      </motion.div>

      {/* Students List Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={`rounded-2xl p-6 shadow-lg ${isDark ? 'bg-gray-800' : 'bg-white'}`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
            {selectedClass ? `ชั้น ${selectedClass}` : searchQuery ? 'ผลการค้นหา' : 'รายชื่อห้องเรียนทั้งหมด'}
          </h2>
          {selectedClass && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleBackToClasses}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
            >
              <ArrowLeft size={16} />
              <span>กลับ</span>
            </motion.button>
          )}
          {selectedStudents.size > 0 && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDeleteSelectedStudents}
              className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-xl"
            >
              <Trash2 size={16} />
              <span>ลบ {selectedStudents.size} รายการ</span>
            </motion.button>
          )}
        </div>
        {selectedClass ? (
          // Show students in selected class
          <div className="space-y-3">
            {groupedStudents[selectedClass]?.map((student: any, studentIndex: number) => (
              <motion.div
                key={student.studentId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: studentIndex * 0.02 }}
                whileHover={{ scale: 1.01, x: 5 }}
                whileTap={{ scale: 0.99 }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  toggleStudentSelection(student.studentId);
                }}
                onTouchStart={() => handleStudentTouchStart(student.studentId)}
                onTouchEnd={handleStudentTouchEnd}
                onTouchMove={handleStudentTouchMove}
                onClick={() => selectedStudents.size > 0 ? toggleStudentSelection(student.studentId) : handleStudentClick(student)}
                className={`rounded-2xl p-4 cursor-pointer transition-all ${selectedStudents.has(student.studentId) ? 'bg-red-100 border-2 border-red-500' : isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-blue-50'}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>{student.name}</p>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {student.studentId} • เลขที่ {student.number} • ชั้น {student.class}
                    </p>
                  </div>
                  {selectedStudents.has(student.studentId) ? (
                    <span className="text-red-500">✓</span>
                  ) : (
                    <span className="text-blue-500">→</span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        ) : searchQuery ? (
          // Show filtered students directly when searching
          <div className="space-y-3">
            {filteredStudents.length === 0 ? (
              <p className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                ไม่พบนักเรียนที่ค้นหา
              </p>
            ) : (
              filteredStudents.map((student: any, studentIndex: number) => (
                <motion.div
                  key={student.studentId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: studentIndex * 0.02 }}
                  whileHover={{ scale: 1.01, x: 5 }}
                  whileTap={{ scale: 0.99 }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    toggleStudentSelection(student.studentId);
                  }}
                  onTouchStart={() => handleStudentTouchStart(student.studentId)}
                  onTouchEnd={handleStudentTouchEnd}
                  onTouchMove={handleStudentTouchMove}
                  onClick={() => selectedStudents.size > 0 ? toggleStudentSelection(student.studentId) : handleStudentClick(student)}
                  className={`rounded-2xl p-4 cursor-pointer transition-all ${selectedStudents.has(student.studentId) ? 'bg-red-100 border-2 border-red-500' : isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-blue-50'}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>{student.name}</p>
                      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {student.studentId} • เลขที่ {student.number} • ชั้น {student.class}
                      </p>
                    </div>
                    {selectedStudents.has(student.studentId) ? (
                      <span className="text-red-500">✓</span>
                    ) : (
                      <span className="text-blue-500">→</span>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </div>
        ) : (
          // Show class cards in grid layout grouped by base level
          <div className="space-y-6">
            {sortedBaseLevels.map((baseLevel, levelIndex) => (
              <div key={baseLevel}>
                <div className="grid grid-cols-2 gap-4">
                  {classGroups[baseLevel].map((className: string, classIndex: number) => (
                    <motion.div
                      key={className}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + levelIndex * 0.1 + classIndex * 0.05 }}
                      whileHover={{ scale: 1.02, y: -5 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleClassClick(className)}
                      className={`rounded-2xl p-4 cursor-pointer transition-all shadow-md ${isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-blue-50'}`}
                    >
                      <h4 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                        ชั้น {className}
                      </h4>
                      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {groupedStudents[className].length} นักเรียน
                      </p>
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

      {/* Popup */}
      {showPopup && selectedStudent && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setShowPopup(false)}
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
                รายละเอียดนักเรียน
              </h3>
              <button
                onClick={() => setShowPopup(false)}
                className={`text-2xl ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
              >
                ×
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>เลขประจำตัวนักเรียน</p>
                <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>{selectedStudent.studentId}</p>
              </div>
              <div>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>ชื่อ-สกุล</p>
                <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>{selectedStudent.name}</p>
              </div>
              <div>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>ชั้น</p>
                <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>{selectedStudent.class}</p>
              </div>
              <div>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>เลขที่</p>
                <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>{selectedStudent.number}</p>
              </div>
              <div>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Email</p>
                <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>{selectedStudent.email || '-'}</p>
              </div>
              {selectedStudent.uid && (
                <div>
                  <div className="flex items-center justify-between">
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>UID</p>
                    <button
                      onClick={() => setShowUID(!showUID)}
                      className={`p-1 rounded ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                    >
                      {showUID ? <EyeOff size={16} className={isDark ? 'text-gray-400' : 'text-gray-500'} /> : <Eye size={16} className={isDark ? 'text-gray-400' : 'text-gray-500'} />}
                    </button>
                  </div>
                  {showUID ? (
                    <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>{selectedStudent.uid}</p>
                  ) : (
                    <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>••••••••••••</p>
                  )}
                </div>
              )}
              {selectedStudent.teacherNodes && selectedStudent.teacherNodes.length > 0 && (
                <div>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Teacher Nodes</p>
                  <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                    {selectedStudent.teacherNodes.join(', ')}
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleEditStudent}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 text-white"
              >
                <Edit size={18} />
                <span>แก้ไข</span>
              </motion.button>
              {selectedStudent.email && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleUnsyncStudent}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500 text-white"
                >
                  <RefreshCw size={18} />
                  <span>ยกเลิกซิงค์</span>
                </motion.button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setShowEditModal(false)}
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
                แก้ไขข้อมูลนักเรียน
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className={`text-2xl ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-1`}>
                  เลขประจำตัวนักเรียน
                </label>
                <input
                  type="text"
                  value={editStudentData.studentId}
                  onChange={(e) => setEditStudentData({ ...editStudentData, studentId: e.target.value })}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                />
              </div>
              <div>
                <label className={`block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-1`}>
                  ชื่อ-สกุล
                </label>
                <input
                  type="text"
                  value={editStudentData.name}
                  onChange={(e) => setEditStudentData({ ...editStudentData, name: e.target.value })}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                />
              </div>
              <div>
                <label className={`block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-1`}>
                  ชั้น
                </label>
                <input
                  type="text"
                  value={editStudentData.class}
                  onChange={(e) => setEditStudentData({ ...editStudentData, class: e.target.value })}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                />
              </div>
              <div>
                <label className={`block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-1`}>
                  เลขที่
                </label>
                <input
                  type="text"
                  value={editStudentData.number}
                  onChange={(e) => setEditStudentData({ ...editStudentData, number: e.target.value })}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowEditModal(false)}
                className={`flex-1 py-3 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}
              >
                ยกเลิก
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveStudentEdit}
                className="flex-1 bg-blue-500 text-white py-3 rounded-xl"
              >
                บันทึก
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className={`rounded-2xl p-6 max-w-lg w-full shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}
          >
            <div className="mb-4">
              <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'} mb-2`}>
                ⚠️ ยืนยันการอัพโหลดรายชื่อนักเรียน
              </h3>
              <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                พบการเปลี่ยนแปลงในรายชื่อนักเรียน
              </p>
            </div>

            {studentsToDelete.length > 0 && (
              <div className={`max-h-40 overflow-y-auto mb-4 rounded-2xl p-4 ${isDark ? 'bg-red-900/30' : 'bg-red-50'}`}>
                <p className={`text-sm mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>รายชื่อที่จะถูกลบ ({studentsToDelete.length} คน):</p>
                {studentsToDelete.map((student) => (
                  <div key={student.studentId} className="flex items-center gap-2 py-1">
                    <span className="text-red-500">🗑️</span>
                    <span className={isDark ? 'text-gray-200' : 'text-gray-800'}>
                      {student.studentId} - {student.name} (ชั้น {student.class})
                    </span>
                  </div>
                ))}
              </div>
            )}

            {studentsToAdd.length > 0 && (
              <div className={`max-h-40 overflow-y-auto mb-4 rounded-2xl p-4 ${isDark ? 'bg-green-900/30' : 'bg-green-50'}`}>
                <p className={`text-sm mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>รายชื่อที่จะถูกเพิ่ม ({studentsToAdd.length} คน):</p>
                {studentsToAdd.map((student) => (
                  <div key={student.studentId} className="flex items-center gap-2 py-1">
                    <span className="text-green-500">➕</span>
                    <span className={isDark ? 'text-gray-200' : 'text-gray-800'}>
                      {student.studentId} - {student.name} (ชั้น {student.class})
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setStudentsToDelete([]);
                  setStudentsToAdd([]);
                  setPendingStudentsData([]);
                }}
                className={`flex-1 py-3 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}
              >
                ยกเลิก
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={confirmDeleteAndUpload}
                className="flex-1 bg-red-500 text-white py-3 rounded-xl"
              >
                ยืนยันและอัพโหลด
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Add Student Modal */}
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
                เพิ่มนักเรียน
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
                  เลขประจำตัวนักเรียน
                </label>
                <input
                  type="text"
                  value={newStudentData.studentId}
                  onChange={(e) => setNewStudentData({ ...newStudentData, studentId: e.target.value })}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                  placeholder="เช่น S001"
                />
              </div>
              <div>
                <label className={`block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-1`}>
                  ชื่อ-สกุล
                </label>
                <input
                  type="text"
                  value={newStudentData.name}
                  onChange={(e) => setNewStudentData({ ...newStudentData, name: e.target.value })}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                  placeholder="ชื่อ-สกุล"
                />
              </div>
              <div>
                <label className={`block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-1`}>
                  ชั้น
                </label>
                <input
                  type="text"
                  value={newStudentData.class}
                  onChange={(e) => setNewStudentData({ ...newStudentData, class: e.target.value })}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                  placeholder="เช่น M.1"
                />
              </div>
              <div>
                <label className={`block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-1`}>
                  เลขที่
                </label>
                <input
                  type="text"
                  value={newStudentData.number}
                  onChange={(e) => setNewStudentData({ ...newStudentData, number: e.target.value })}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                  placeholder="เช่น 1"
                />
              </div>
              <div>
                <label className={`block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-1`}>
                  Email (ไม่บังคับ)
                </label>
                <input
                  type="email"
                  value={newStudentData.email}
                  onChange={(e) => setNewStudentData({ ...newStudentData, email: e.target.value })}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
                  placeholder="email@example.com"
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
                onClick={handleAddStudent}
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
