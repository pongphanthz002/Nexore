'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { studentDatabaseService } from '@/services/student-database.service';
import { schoolDatabaseService } from '@/services/school-database.service';
import { firestoreService } from '@/services/firestore.service';
import { runPool } from '@/lib/firestore-helpers';
import UploadProgressModal, { UploadProgress } from '@/components/UploadProgressModal';
import { ActionButton, AdminPageHeader, RosterRow, SearchWell, SectionCard, SelectionBar, StatusPill, UploadButton } from '@/components/admin/AdminUI';
import * as XLSX from 'xlsx';
import { Download, Upload, Trash2, Edit, Eye, EyeOff, RefreshCw, Plus, ArrowLeft, Search, X } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import Modal from '@/components/Modal';

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
  const { isDark } = useTheme();
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
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const lastLoadedConfigRef = useRef<string | null>(null);

  const loadStudents = useCallback(async (force = false) => {
    try {
      if (!userAccount?.schoolFirebaseConfig) return;
      const configKey = userAccount.schoolFirebaseConfig.projectId;
      if (!force && configKey === lastLoadedConfigRef.current) return;
      setLoading(true);
      const data = await schoolDatabaseService.getAllStudents(userAccount.schoolFirebaseConfig);
      setStudents(data);
      lastLoadedConfigRef.current = configKey;
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setLoading(false);
    }
  }, [userAccount]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

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
    // Reset so choosing the same file again still triggers onChange
    e.target.value = '';
    if (!file) return;

    if (!userAccount?.schoolFirebaseConfig) {
      alert('ไม่พบ School Firebase Config กรุณาทำ Admin Setup ก่อน');
      return;
    }

    setLoading(true);
    setUploadProgress({ title: 'กำลังอัพโหลดรายชื่อนักเรียน', label: 'กำลังอ่านไฟล์และตรวจสอบข้อมูล', step: 1, totalSteps: 2, done: 0, total: 0 });
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      // Excel may give numeric cells as numbers; document IDs and fields are strings
      const studentsData = jsonData.map((row: any) => ({
        studentId: String(row['เลขประจำตัวนักเรียน'] ?? ''),
        name: String(row['ชื่อ-สกุล'] ?? ''),
        class: String(row['ชั้น'] ?? ''),
        number: String(row['เลขที่'] ?? ''),
        schoolId: userAccount.schoolId || 'default',
        // teacherNodes isn't in the Excel file: omit it so existing values are kept
      }));

      // Get existing students
      const existingStudents = await schoolDatabaseService.getAllStudents(userAccount.schoolFirebaseConfig);
      const newStudentIds = new Set(studentsData.map(s => s.studentId));
      const existingStudentIds = new Set(existingStudents.map(s => s.studentId));

      // Find students to delete (in old but not in new)
      const studentsToDelete = existingStudents.filter(s => !newStudentIds.has(s.studentId));

      // Find students to add (in new but not in old)
      const studentsToAdd = studentsData.filter(s => !existingStudentIds.has(s.studentId));

      // If there are students to delete or add, show confirmation dialog
      if (studentsToDelete.length > 0 || studentsToAdd.length > 0) {
        setStudentsToDelete(studentsToDelete);
        setStudentsToAdd(studentsToAdd);
        setPendingStudentsData(studentsData);
        setShowDeleteConfirm(true);
        setUploadProgress(null);
        setLoading(false);
        return;
      }

      // No changes, proceed with upload
      const { unknownTeacherIds } = await schoolDatabaseService.saveStudentWhitelist(
        userAccount.schoolFirebaseConfig,
        studentsData,
        (done, total) => setUploadProgress(p => p && { ...p, label: 'กำลังบันทึกรายชื่อ', step: 2, done, total })
      );
      setUploadProgress(p => p && { ...p, label: 'กำลังโหลดรายชื่อล่าสุด', done: 0, total: 0 });
      await loadStudents(true);
      setUploadProgress(null);
      if (unknownTeacherIds.length > 0) {
        alert(`คำเตือน: ไม่พบครูรหัส ${unknownTeacherIds.join(', ')} ในระบบ (teacherNodes) ข้อมูลนักเรียนถูกบันทึกแล้ว`);
      }
      alert('อัพโหลดรายชื่อนักเรียนสำเร็จ');
    } catch (error) {
      console.error('Error uploading students:', error);
      setUploadProgress(null);
      alert('ไม่สามารถอัพโหลดรายชื่อนักเรียนได้');
    } finally {
      setUploadProgress(null);
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
    const hasDeletes = studentsToDelete.length > 0;
    const totalSteps = hasDeletes ? 2 : 1;
    const title = 'กำลังอัพโหลดรายชื่อนักเรียน';
    try {
      // Delete students that are not in the new file (School DB, Master Registry and Teacher DBs).
      // Each delete is independent, so a few run at once; one failure doesn't stop the rest.
      const failedTeacherIds = new Set<string>();
      const failedStudentIds: string[] = [];
      if (hasDeletes) {
        let deleted = 0;
        setUploadProgress({ title, label: 'กำลังลบนักเรียนที่ไม่อยู่ในไฟล์', step: 1, totalSteps, done: 0, total: studentsToDelete.length });
        await runPool(studentsToDelete, 5, async student => {
          try {
            const result = await studentDatabaseService.deleteStudentCompletely(userAccount.schoolFirebaseConfig!, student);
            result.failedTeacherIds.forEach(id => failedTeacherIds.add(id));
          } catch (error) {
            console.error('Error deleting student:', student.studentId, error);
            failedStudentIds.push(student.studentId);
          }
          deleted++;
          setUploadProgress(p => p && { ...p, done: deleted });
        });
      }

      // Save new students to School Database
      setUploadProgress({ title, label: 'กำลังบันทึกรายชื่อ', step: totalSteps, totalSteps, done: 0, total: pendingStudentsData.length });
      const { unknownTeacherIds } = await schoolDatabaseService.saveStudentWhitelist(
        userAccount.schoolFirebaseConfig,
        pendingStudentsData,
        (done, total) => setUploadProgress(p => p && { ...p, done, total })
      );
      setUploadProgress(p => p && { ...p, label: 'กำลังโหลดรายชื่อล่าสุด', done: 0, total: 0 });
      await loadStudents(true);
      invalidateCache();
      setUploadProgress(null);

      if (failedStudentIds.length > 0) {
        alert(`ลบนักเรียนบางคนไม่สำเร็จ: ${failedStudentIds.join(', ')}`);
      }
      if (failedTeacherIds.size > 0) {
        alert(`ลบข้อมูลในฐานข้อมูลครูบางคนไม่สำเร็จ: ${Array.from(failedTeacherIds).join(', ')}`);
      }
      if (unknownTeacherIds.length > 0) {
        alert(`คำเตือน: ไม่พบครูรหัส ${unknownTeacherIds.join(', ')} ในระบบ (teacherNodes) ข้อมูลนักเรียนถูกบันทึกแล้ว`);
      }
      alert('อัพโหลดรายชื่อนักเรียนสำเร็จ');
    } catch (error) {
      console.error('Error uploading students:', error);
      setUploadProgress(null);
      alert('ไม่สามารถอัพโหลดรายชื่อนักเรียนได้');
    } finally {
      setUploadProgress(null);
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

      await loadStudents(true);
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

      await loadStudents(true);
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
      const failedTeacherIds = new Set<string>();
      for (const studentId of studentIdsArray) {
        const student = students.find(s => s.studentId === studentId);
        if (!student) continue;
        const result = await studentDatabaseService.deleteStudentCompletely(userAccount.schoolFirebaseConfig, student);
        result.failedTeacherIds.forEach(id => failedTeacherIds.add(id));
      }
      if (failedTeacherIds.size > 0) {
        alert(`ลบข้อมูลในฐานข้อมูลครูบางคนไม่สำเร็จ: ${Array.from(failedTeacherIds).join(', ')}`);
      }
      setSelectedStudents(new Set());
      await loadStudents(true);
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
          'student',
          newStudentData.studentId
        );
      }

      await loadStudents(true);
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

  // Sort each class by number, then studentId
  Object.keys(groupedStudents).forEach(className => {
    groupedStudents[className].sort((a: any, b: any) =>
      (parseInt(a.number) || 0) - (parseInt(b.number) || 0) || a.studentId.localeCompare(b.studentId));
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
    classGroups[baseLevel].sort((a: string, b: string) => a.localeCompare(b, 'th', { numeric: true }));
  });

  // Sort base levels
  const sortedBaseLevels = Object.keys(classGroups).sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));

  const handleClassClick = (className: string) => {
    setSelectedClass(className);
  };

  const handleBackToClasses = () => {
    setSelectedClass(null);
  };

  if (loading && students.length === 0 && !uploadProgress) {
    return (
      <div className="min-h-screen bg-surface px-4 pb-28 pt-2 text-gray-900 sm:px-6 dark:text-gray-50">
        <h1 className={`text-3xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-800'}`}>จัดการข้อมูลนักเรียน</h1>
        <div className="animate-pulse space-y-4">
          <div className={`h-12 rounded-2xl bg-surface shadow-neu-lg`} />
          <div className={`h-10 w-48 rounded-lg ${isDark ? 'bg-white/10' : 'bg-gray-300/60'}`} />
          {[...Array(6)].map((_, i) => (
            <div key={i} className={`rounded-2xl p-4 bg-surface shadow-neu-lg`}>
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full ${isDark ? 'bg-white/10' : 'bg-gray-300/60'}`} />
                <div className="flex-1 space-y-2">
                  <div className={`h-4 w-32 rounded ${isDark ? 'bg-white/10' : 'bg-gray-300/60'}`} />
                  <div className={`h-3 w-24 rounded ${isDark ? 'bg-white/10' : 'bg-gray-300/60'}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-surface px-4 pb-28 pt-2 text-gray-900 sm:px-6 dark:text-gray-50"
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
      <div className="mx-auto max-w-5xl">
        <AdminPageHeader
          title="นักเรียน"
          subtitle={`${students.length} คน · ลงทะเบียนแล้ว ${students.filter(st => st.uid).length} คน`}
          onBack={() => router.push('/admin/dashboard')}
          actions={<>
            <ActionButton icon={<Download size={18} />} label="ดาวน์โหลด" onClick={handleDownload} />
            <UploadButton icon={<Upload size={18} />} label="อัปโหลด" onChange={handleUpload} />
            <ActionButton icon={<Plus size={18} />} label="เพิ่มนักเรียน" onClick={() => setShowAddModal(true)} primary />
          </>}
        />
        <SearchWell value={searchQuery} onChange={handleSearch} placeholder="ค้นหาชื่อ เลขประจำตัว หรืออีเมล" />

        {selectedClass || searchQuery ? (
          <SectionCard>
            <div className="mb-3 flex items-center gap-3">
              {selectedClass && !searchQuery && (
                <button
                  type="button"
                  onClick={handleBackToClasses}
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-surface px-3 text-sm font-semibold text-gray-700 shadow-neu-sm active:shadow-neu-in-sm dark:text-gray-200"
                >
                  <ArrowLeft size={16} /> ทุกห้อง
                </button>
              )}
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                {selectedClass && !searchQuery
                  ? `ชั้น ${selectedClass} · ${groupedStudents[selectedClass]?.length ?? 0} คน`
                  : `ผลการค้นหา ${filteredStudents.length} คน`}
              </h2>
            </div>
            {(selectedClass && !searchQuery ? groupedStudents[selectedClass] ?? [] : filteredStudents).length === 0 ? (
              <p className="py-8 text-center text-gray-500 dark:text-gray-400">ไม่พบนักเรียนที่ค้นหา</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {(selectedClass && !searchQuery ? groupedStudents[selectedClass] ?? [] : filteredStudents).map((student: any) => (
                  <RosterRow
                    key={student.studentId}
                    leading={
                      <span aria-hidden className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-surface text-sm font-semibold tabular-nums text-gray-700 shadow-neu-in-sm dark:text-gray-200">
                        {student.number || '–'}
                      </span>
                    }
                    title={student.name}
                    meta={`${student.studentId} · ชั้น ${student.class}`}
                    trailing={<StatusPill ok={!!student.uid}>{student.uid ? 'ลงทะเบียนแล้ว' : 'ยังไม่ลงทะเบียน'}</StatusPill>}
                    selected={selectedStudents.has(student.studentId)}
                    selecting={selectedStudents.size > 0}
                    onOpen={() => handleStudentClick(student)}
                    onToggle={() => toggleStudentSelection(student.studentId)}
                    touch={{
                      onTouchStart: () => handleStudentTouchStart(student.studentId),
                      onTouchEnd: handleStudentTouchEnd,
                      onTouchMove: handleStudentTouchMove,
                    }}
                  />
                ))}
              </div>
            )}
          </SectionCard>
        ) : sortedBaseLevels.length === 0 ? (
          <SectionCard>
            <p className="py-8 text-center text-gray-500 dark:text-gray-400">ยังไม่มีข้อมูลนักเรียน อัปโหลดไฟล์ Excel หรือกด &quot;เพิ่มนักเรียน&quot;</p>
          </SectionCard>
        ) : (
          <div className="space-y-5">
            {sortedBaseLevels.map(baseLevel => (
              <SectionCard key={baseLevel} title={baseLevel}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {classGroups[baseLevel].map((className: string) => {
                    const list = groupedStudents[className];
                    const registered = list.filter((st: any) => st.uid).length;
                    return (
                      <button
                        key={className}
                        type="button"
                        onClick={() => handleClassClick(className)}
                        className="rounded-2xl bg-surface p-4 text-left shadow-neu-sm transition-shadow active:shadow-neu-in-sm"
                      >
                        <div className="text-xl font-bold tabular-nums">{className}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{list.length} คน</div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full shadow-neu-in-xs">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${list.length ? (registered / list.length) * 100 : 0}%` }} />
                        </div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">ลงทะเบียน {registered}/{list.length}</div>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>
            ))}
          </div>
        )}
      </div>

      <SelectionBar count={selectedStudents.size} onDelete={handleDeleteSelectedStudents} onClear={() => setSelectedStudents(new Set())} />

      {/* Popup */}
      <Modal open={showPopup && !!selectedStudent} onClose={() => setShowPopup(false)}>
        {selectedStudent && (<>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                รายละเอียดนักเรียน
              </h3>
              <button
                onClick={() => setShowPopup(false)}
                className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/5 text-gray-400 hover:text-gray-200' : 'hover:bg-black/5 text-gray-500 hover:text-gray-700'}`}
              >
                <X size={24} />
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
                      className={`p-1 rounded hover:bg-black/5 dark:hover:bg-white/5`}
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
        </>)}
      </Modal>

      {/* Edit Modal */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)}>
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
                  className={`w-full p-3 rounded-xl border ${isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-800'}`}
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
                  className={`w-full p-3 rounded-xl border ${isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-800'}`}
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
                  className={`w-full p-3 rounded-xl border ${isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-800'}`}
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
                  className={`w-full p-3 rounded-xl border ${isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-800'}`}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowEditModal(false)}
                className={`flex-1 py-3 rounded-xl ${isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'}`}
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
      </Modal>

      {/* Delete Confirmation Dialog */}
      <Modal open={showDeleteConfirm} onClose={() => { setShowDeleteConfirm(false); setStudentsToDelete([]); setStudentsToAdd([]); setPendingStudentsData([]); }} size="lg" closeOnBackdrop={false}>
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
                {studentsToDelete.some(s => s.uid) && (
                  <p className="text-sm font-semibold text-red-600 mb-2">
                    มี {studentsToDelete.filter(s => s.uid).length} คนที่ใช้งานระบบอยู่แล้ว คะแนนและการเช็คชื่อของนักเรียนเหล่านี้จะถูกลบด้วย
                  </p>
                )}
                {studentsToDelete.map((student) => (
                  <div key={student.studentId} className="flex items-center gap-2 py-1">
                    <span className="text-red-500">🗑️</span>
                    <span className={isDark ? 'text-gray-200' : 'text-gray-800'}>
                      {student.studentId} - {student.name} (ชั้น {student.class})
                    </span>
                    {student.uid && (
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-red-500 text-white">ใช้งานอยู่</span>
                    )}
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
                className={`flex-1 py-3 rounded-xl ${isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'}`}
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
      </Modal>

      <UploadProgressModal progress={uploadProgress} isDark={isDark} />

      {/* Add Student Modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)}>
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
                  className={`w-full p-3 rounded-xl border ${isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-800'}`}
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
                  className={`w-full p-3 rounded-xl border ${isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-800'}`}
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
                  className={`w-full p-3 rounded-xl border ${isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-800'}`}
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
                  className={`w-full p-3 rounded-xl border ${isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-800'}`}
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
                  className={`w-full p-3 rounded-xl border ${isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-800'}`}
                  placeholder="email@example.com"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowAddModal(false)}
                className={`flex-1 py-3 rounded-xl ${isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'}`}
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
      </Modal>
    </div>
  );
}
