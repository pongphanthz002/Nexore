'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import { firestoreService } from '@/services/firestore.service';
import { teacherDatabaseService } from '@/services/teacher-database.service';
import { runPool } from '@/lib/firestore-helpers';
import UploadProgressModal, { UploadProgress } from '@/components/UploadProgressModal';
import { ActionButton, AdminPageHeader, Initial, RosterRow, SearchWell, SectionCard, SelectionBar, StatusPill, UploadButton } from '@/components/admin/AdminUI';
import * as XLSX from 'xlsx';
import { Eye, EyeOff, Edit, RefreshCw, Trash2, Download, Upload, Plus, ArrowLeft, Search, X } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import Modal from '@/components/Modal';

export default function TeachersManagement() {
  const router = useRouter();
  const { userAccount, invalidateCache } = useAuth();
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [teachersToDelete, setTeachersToDelete] = useState<any[]>([]);
  const [teachersToAdd, setTeachersToAdd] = useState<any[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingTeachersData, setPendingTeachersData] = useState<any[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const { isDark } = useTheme();
  const [showUID, setShowUID] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTeacherData, setEditTeacherData] = useState({
    teacherId: '',
    name: ''
  });
  const [selectedTeachers, setSelectedTeachers] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [touchStartX, setTouchStartX] = useState(0);
  const [newTeacherData, setNewTeacherData] = useState({
    teacherId: '',
    name: '',
    email: ''
  });
  const [searchQuery, setSearchQuery] = useState('');
  const lastLoadedConfigRef = useRef<string | null>(null);

  const loadTeachers = useCallback(async (force = false) => {
    try {
      if (!userAccount?.schoolFirebaseConfig) return;
      const configKey = userAccount.schoolFirebaseConfig.projectId;
      if (!force && configKey === lastLoadedConfigRef.current) return;
      setLoading(true);
      const data = await schoolDatabaseService.getAllTeachers(userAccount.schoolFirebaseConfig);
      data.sort((a, b) => a.teacherId.localeCompare(b.teacherId));
      setTeachers(data);
      lastLoadedConfigRef.current = configKey;
    } catch (error) {
      console.error('Error loading teachers:', error);
    } finally {
      setLoading(false);
    }
  }, [userAccount]);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  const filteredTeachers = teachers.filter(teacher =>
    teacher.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    teacher.teacherId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (teacher.email && teacher.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleDownload = () => {
    if (teachers.length === 0) {
      // Download template with headers only
      const template = [
        {
          'เลขประจำตัวครู': '',
          'ชื่อ-สกุล': '',
          'Email': ''
        }
      ];
      const worksheet = XLSX.utils.json_to_sheet(template);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'ครู');
      XLSX.writeFile(workbook, 'รายชื่อครู_template.xlsx');
    } else {
      // Download all teachers
      const data = teachers.map(t => ({
        'เลขประจำตัวครู': t.teacherId,
        'ชื่อ-สกุล': t.name,
        'Email': t.email || ''
      }));
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'ครู');
      XLSX.writeFile(workbook, 'รายชื่อครู.xlsx');
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
    setUploadProgress({ title: 'กำลังอัพโหลดรายชื่อครู', label: 'กำลังอ่านไฟล์และตรวจสอบข้อมูล', step: 1, totalSteps: 2, done: 0, total: 0 });
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      // Excel may give numeric cells as numbers; document IDs and fields are strings
      const teachersData = jsonData.map((row: any) => ({
        teacherId: String(row['เลขประจำตัวครู'] ?? ''),
        name: String(row['ชื่อ-สกุล'] ?? ''),
        email: String(row['Email'] ?? '')
      }));

      // Get existing teachers
      const existingTeachers = await schoolDatabaseService.getAllTeachers(userAccount.schoolFirebaseConfig);
      const newTeacherIds = new Set(teachersData.map(t => t.teacherId));
      const existingTeacherIds = new Set(existingTeachers.map(t => t.teacherId));

      // Find teachers to delete (in old but not in new)
      const teachersToDelete = existingTeachers.filter(t => !newTeacherIds.has(t.teacherId));

      // Find teachers to add (in new but not in old)
      const teachersToAdd = teachersData.filter(t => !existingTeacherIds.has(t.teacherId));

      // If there are teachers to delete or add, show confirmation dialog
      if (teachersToDelete.length > 0 || teachersToAdd.length > 0) {
        setTeachersToDelete(teachersToDelete);
        setTeachersToAdd(teachersToAdd);
        setPendingTeachersData(teachersData);
        setShowDeleteConfirm(true);
        setUploadProgress(null);
        setLoading(false);
        return;
      }

      // No changes, proceed with upload
      await schoolDatabaseService.saveTeacherWhitelist(
        userAccount.schoolFirebaseConfig,
        teachersData,
        (done, total) => setUploadProgress(p => p && { ...p, label: 'กำลังบันทึกรายชื่อ', step: 2, done, total })
      );
      setUploadProgress(p => p && { ...p, label: 'กำลังโหลดรายชื่อล่าสุด', done: 0, total: 0 });
      await loadTeachers(true);
      setUploadProgress(null);
      alert('อัพโหลดรายชื่อครูสำเร็จ');
    } catch (error) {
      console.error('Error uploading teachers:', error);
      setUploadProgress(null);
      alert('ไม่สามารถอัพโหลดรายชื่อครูได้');
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
    const schoolConfig = userAccount.schoolFirebaseConfig;
    const hasDeletes = teachersToDelete.length > 0;
    const totalSteps = hasDeletes ? 2 : 1;
    const title = 'กำลังอัพโหลดรายชื่อครู';
    try {
      // Delete teachers that are not in the new file, a few at a time
      const failedTeacherIds: string[] = [];
      if (hasDeletes) {
        let deleted = 0;
        setUploadProgress({ title, label: 'กำลังลบครูที่ไม่อยู่ในไฟล์', step: 1, totalSteps, done: 0, total: teachersToDelete.length });
        await runPool(teachersToDelete, 3, async teacher => {
          try {
            // Delete from School Database
            await schoolDatabaseService.deleteTeacher(schoolConfig, teacher.teacherId);

            // Delete user account from Master Registry (if email exists)
            if (teacher.email) {
              await firestoreService.deleteUserAccount(teacher.email);
            }

            // Note: Firebase Auth deletion requires Admin SDK (server-side)
            // Cannot be done from client SDK - will need manual cleanup or server endpoint

            // Delete all data from the teacher's own database. Never when it points at the
            // school project: that would wipe data of every teacher stored in the School DB.
            if (teacher.firebaseConfig && teacher.firebaseConfig.projectId !== schoolConfig.projectId) {
              await teacherDatabaseService.deleteTeacherDatabase(teacher.firebaseConfig);
            }
          } catch (error) {
            console.error('Error deleting teacher:', teacher.teacherId, error);
            failedTeacherIds.push(teacher.teacherId);
          }
          deleted++;
          setUploadProgress(p => p && { ...p, done: deleted });
        });
      }

      // Save new teachers to School Database
      setUploadProgress({ title, label: 'กำลังบันทึกรายชื่อ', step: totalSteps, totalSteps, done: 0, total: pendingTeachersData.length });
      await schoolDatabaseService.saveTeacherWhitelist(
        schoolConfig,
        pendingTeachersData,
        (done, total) => setUploadProgress(p => p && { ...p, done, total })
      );
      setUploadProgress(p => p && { ...p, label: 'กำลังโหลดรายชื่อล่าสุด', done: 0, total: 0 });
      await loadTeachers(true);
      invalidateCache();
      setUploadProgress(null);
      if (failedTeacherIds.length > 0) {
        alert(`ลบครูบางคนไม่สำเร็จ: ${failedTeacherIds.join(', ')}`);
      }
      alert('อัพโหลดรายชื่อครูสำเร็จ');
    } catch (error) {
      console.error('Error uploading teachers:', error);
      setUploadProgress(null);
      alert('ไม่สามารถอัพโหลดรายชื่อครูได้');
    } finally {
      setUploadProgress(null);
      setLoading(false);
      setTeachersToDelete([]);
      setTeachersToAdd([]);
      setPendingTeachersData([]);
    }
  };

  const handleTeacherClick = (teacher: any) => {
    setSelectedTeacher(teacher);
    setShowPopup(true);
  };

  const handleEditTeacher = () => {
    setEditTeacherData({
      teacherId: selectedTeacher.teacherId,
      name: selectedTeacher.name
    });
    setShowEditModal(true);
    setShowPopup(false);
  };

  const handleSaveTeacherEdit = async () => {
    if (!userAccount?.schoolFirebaseConfig) return;
    if (!editTeacherData.teacherId || !editTeacherData.name) {
      alert('กรุณากรอกข้อมูลให้ครบ');
      return;
    }

    if (!confirm('ยืนยันการแก้ไขข้อมูลครู?')) return;

    setLoading(true);
    try {
      const oldTeacherId = selectedTeacher.teacherId;
      const newTeacherId = editTeacherData.teacherId;

      // If teacherId changed, we need to delete old and create new
      if (oldTeacherId !== newTeacherId) {
        console.log('TeacherId changed, deleting old:', oldTeacherId);
        await schoolDatabaseService.deleteTeacher(userAccount.schoolFirebaseConfig, oldTeacherId);
      }

      console.log('Saving teacher with new data:', {
        teacherId: newTeacherId,
        name: editTeacherData.name,
        email: selectedTeacher.email || '',
        uid: selectedTeacher.uid || '',
        role: selectedTeacher.role || 'teacher',
        firebaseConfig: selectedTeacher.firebaseConfig || null,
        createdAt: selectedTeacher.createdAt || new Date(),
        updatedAt: new Date()
      });

      await schoolDatabaseService.saveTeacherConfig(userAccount.schoolFirebaseConfig, {
        teacherId: newTeacherId,
        name: editTeacherData.name,
        email: selectedTeacher.email || '',
        uid: selectedTeacher.uid || '',
        role: selectedTeacher.role || 'teacher',
        firebaseConfig: selectedTeacher.firebaseConfig || null,
        createdAt: selectedTeacher.createdAt || new Date(),
        updatedAt: new Date()
      });

      await loadTeachers(true);
      invalidateCache();
      setShowEditModal(false);
      setSelectedTeacher(null);
      alert('แก้ไขข้อมูลครูสำเร็จ');
    } catch (error) {
      console.error('Error editing teacher:', error);
      alert('ไม่สามารถแก้ไขข้อมูลครูได้: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnsyncTeacher = async () => {
    if (!userAccount?.schoolFirebaseConfig) return;
    if (!confirm('ยืนยันการยกเลิกการซิงค์? จะลบ email และ UID ออก')) return;

    setLoading(true);
    try {
      await schoolDatabaseService.saveTeacherConfig(userAccount.schoolFirebaseConfig, {
        ...selectedTeacher,
        email: '',
        uid: '',
        updatedAt: new Date()
      });

      // Also remove from master registry
      if (selectedTeacher.email) {
        await firestoreService.deleteUserAccount(selectedTeacher.email);
      }

      await loadTeachers(true);
      setShowPopup(false);
      setSelectedTeacher(null);
      alert('ยกเลิกการซิงค์สำเร็จ');
    } catch (error) {
      console.error('Error unsyncing teacher:', error);
      alert('ไม่สามารถยกเลิกการซิงค์ได้');
    } finally {
      setLoading(false);
    }
  };

  const toggleTeacherSelection = (teacherId: string) => {
    const newSelection = new Set(selectedTeachers);
    if (newSelection.has(teacherId)) {
      newSelection.delete(teacherId);
    } else {
      newSelection.add(teacherId);
    }
    setSelectedTeachers(newSelection);
  };

  const handleTeacherTouchStart = (teacherId: string) => {
    const timer = setTimeout(() => {
      toggleTeacherSelection(teacherId);
    }, 500);
    setLongPressTimer(timer);
  };

  const handleTeacherTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleTeacherTouchMove = () => {
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

  const handleDeleteSelectedTeachers = async () => {
    if (selectedTeachers.size === 0) return;
    if (!userAccount?.schoolFirebaseConfig) return;

    if (!confirm(`ยืนยันการลบ ${selectedTeachers.size} ครู?`)) return;

    setLoading(true);
    try {
      const teacherIdsArray = Array.from(selectedTeachers);
      for (const teacherId of teacherIdsArray) {
        const teacher = teachers.find(t => t.teacherId === teacherId);
        if (teacher?.email) {
          await firestoreService.deleteUserAccount(teacher.email);
        }
        await schoolDatabaseService.deleteTeacher(userAccount.schoolFirebaseConfig, teacherId);
      }
      setSelectedTeachers(new Set());
      await loadTeachers(true);
      invalidateCache();
      alert('ลบครูสำเร็จ');
    } catch (error) {
      console.error('Error deleting teachers:', error);
      alert('ไม่สามารถลบครูได้');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTeacher = async () => {
    if (!userAccount?.schoolFirebaseConfig) return;
    if (!newTeacherData.teacherId || !newTeacherData.name) {
      alert('กรุณากรอกข้อมูลให้ครบ');
      return;
    }

    setLoading(true);
    try {
      await schoolDatabaseService.saveTeacherConfig(userAccount.schoolFirebaseConfig, {
        teacherId: newTeacherData.teacherId,
        name: newTeacherData.name,
        email: newTeacherData.email,
        role: 'teacher',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Also add to master registry if email is provided
      if (newTeacherData.email) {
        await firestoreService.saveUserAccount(
          newTeacherData.email,
          userAccount.schoolId,
          undefined,
          'teacher',
          newTeacherData.teacherId
        );
      }

      await loadTeachers(true);
      invalidateCache();
      setShowAddModal(false);
      setNewTeacherData({
        teacherId: '',
        name: '',
        email: ''
      });
      alert('เพิ่มครูสำเร็จ');
    } catch (error) {
      console.error('Error adding teacher:', error);
      alert('ไม่สามารถเพิ่มครูได้');
    } finally {
      setLoading(false);
    }
  };

  if (loading && teachers.length === 0 && !uploadProgress) {
    return (
      <div className="min-h-screen bg-surface px-4 pb-28 pt-2 text-gray-900 sm:px-6 dark:text-gray-50">
        <h1 className={`text-3xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-800'}`}>จัดการข้อมูลครู</h1>
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
          title="ครู"
          subtitle={`${teachers.length} คน · ลงทะเบียนแล้ว ${teachers.filter(t => t.uid).length} คน`}
          onBack={() => router.push('/admin/dashboard')}
          actions={<>
            <ActionButton icon={<Download size={18} />} label="ดาวน์โหลด" onClick={handleDownload} />
            <UploadButton icon={<Upload size={18} />} label="อัปโหลด" onChange={handleUpload} />
            <ActionButton icon={<Plus size={18} />} label="เพิ่มครู" onClick={() => setShowAddModal(true)} primary />
          </>}
        />
        <SearchWell value={searchQuery} onChange={handleSearch} placeholder="ค้นหาชื่อ เลขประจำตัว หรืออีเมล" />

        <SectionCard title={searchQuery ? `ผลการค้นหา ${filteredTeachers.length} คน` : undefined}>
          {filteredTeachers.length === 0 ? (
            <p className="py-8 text-center text-gray-500 dark:text-gray-400">
              {searchQuery ? 'ไม่พบครูที่ค้นหา' : 'ยังไม่มีข้อมูลครู อัปโหลดไฟล์ Excel หรือกด "เพิ่มครู"'}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {filteredTeachers.map(teacher => (
                <RosterRow
                  key={teacher.teacherId}
                  leading={<Initial name={teacher.name} src={teacher.photoURL} />}
                  title={teacher.name}
                  meta={teacher.teacherId}
                  trailing={<StatusPill ok={!!teacher.uid}>{teacher.uid ? 'ลงทะเบียนแล้ว' : 'ยังไม่ลงทะเบียน'}</StatusPill>}
                  selected={selectedTeachers.has(teacher.teacherId)}
                  selecting={selectedTeachers.size > 0}
                  onOpen={() => handleTeacherClick(teacher)}
                  onToggle={() => toggleTeacherSelection(teacher.teacherId)}
                  touch={{
                    onTouchStart: () => handleTeacherTouchStart(teacher.teacherId),
                    onTouchEnd: handleTeacherTouchEnd,
                    onTouchMove: handleTeacherTouchMove,
                  }}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SelectionBar count={selectedTeachers.size} onDelete={handleDeleteSelectedTeachers} onClear={() => setSelectedTeachers(new Set())} />

      {/* Popup */}
      <Modal open={showPopup && !!selectedTeacher} onClose={() => setShowPopup(false)} closeOnBackdrop={false}>
        {selectedTeacher && (<>
            <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                    รายละเอียดครู
                  </h3>
                  <button
                    onClick={() => {
                      setShowPopup(false);
                    }}
                    className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/5 text-gray-400 hover:text-gray-200' : 'hover:bg-black/5 text-gray-500 hover:text-gray-700'}`}
                  >
                    <X size={24} />
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>เลขประจำตัวครู</p>
                    <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>{selectedTeacher.teacherId}</p>
                  </div>
                  <div>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>ชื่อ-สกุล</p>
                    <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>{selectedTeacher.name}</p>
                  </div>
                  <div>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Email</p>
                    <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>{selectedTeacher.email || '-'}</p>
                  </div>
                  {selectedTeacher.uid && (
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
                        <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>{selectedTeacher.uid}</p>
                      ) : (
                        <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>••••••••••••</p>
                      )}
                    </div>
                  )}
                  <div>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>ฐานข้อมูลครู</p>
                    <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                      {selectedTeacher.firebaseConfig
                        ? 'เชื่อมต่อฐานข้อมูลครูแล้ว'
                        : selectedTeacher.uid
                          ? 'ใช้ฐานข้อมูลโรงเรียน'
                          : 'ยังไม่ได้ลงทะเบียนใช้ระบบ'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleEditTeacher}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 text-white"
                  >
                    <Edit size={18} />
                    <span>แก้ไข</span>
                  </motion.button>
                  {selectedTeacher.email && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleUnsyncTeacher}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500 text-white"
                    >
                      <RefreshCw size={18} />
                      <span>ยกเลิกซิงค์</span>
                    </motion.button>
                  )}
                </div>
            </>
        </>)}
      </Modal>

      {/* Edit Modal */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                แก้ไขข้อมูลครู
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
                  เลขประจำตัวครู
                </label>
                <input
                  type="text"
                  value={editTeacherData.teacherId}
                  onChange={(e) => setEditTeacherData({ ...editTeacherData, teacherId: e.target.value })}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-800'}`}
                />
              </div>
              <div>
                <label className={`block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-1`}>
                  ชื่อ-สกุล
                </label>
                <input
                  type="text"
                  value={editTeacherData.name}
                  onChange={(e) => setEditTeacherData({ ...editTeacherData, name: e.target.value })}
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
                onClick={handleSaveTeacherEdit}
                className="flex-1 bg-blue-500 text-white py-3 rounded-xl"
              >
                บันทึก
              </motion.button>
            </div>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <Modal open={showDeleteConfirm} onClose={() => { setShowDeleteConfirm(false); setTeachersToDelete([]); setTeachersToAdd([]); setPendingTeachersData([]); }} size="lg" closeOnBackdrop={false}>
            <div className="mb-4">
              <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'} mb-2`}>
                ⚠️ ยืนยันการอัพโหลดรายชื่อครู
              </h3>
              <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                พบการเปลี่ยนแปลงในรายชื่อครู
              </p>
            </div>

            {teachersToDelete.length > 0 && (
              <div className={`max-h-40 overflow-y-auto mb-4 rounded-2xl p-4 ${isDark ? 'bg-red-900/30' : 'bg-red-50'}`}>
                <p className={`text-sm mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>รายชื่อที่จะถูกลบ ({teachersToDelete.length} คน):</p>
                {teachersToDelete.some(t => t.uid) && (
                  <p className="text-sm font-semibold text-red-600 mb-2">
                    มี {teachersToDelete.filter(t => t.uid).length} คนที่ใช้งานระบบอยู่แล้ว ข้อมูลเช็คชื่อและคะแนนในฐานข้อมูลของครูเหล่านี้จะถูกลบด้วย
                  </p>
                )}
                {teachersToDelete.map((teacher) => (
                  <div key={teacher.teacherId} className="flex items-center gap-2 py-1">
                    <span className="text-red-500">🗑️</span>
                    <span className={isDark ? 'text-gray-200' : 'text-gray-800'}>
                      {teacher.teacherId} - {teacher.name}
                    </span>
                    {teacher.uid && (
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-red-500 text-white">ใช้งานอยู่</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {teachersToAdd.length > 0 && (
              <div className={`max-h-40 overflow-y-auto mb-4 rounded-2xl p-4 ${isDark ? 'bg-green-900/30' : 'bg-green-50'}`}>
                <p className={`text-sm mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>รายชื่อที่จะถูกเพิ่ม ({teachersToAdd.length} คน):</p>
                {teachersToAdd.map((teacher) => (
                  <div key={teacher.teacherId} className="flex items-center gap-2 py-1">
                    <span className="text-green-500">➕</span>
                    <span className={isDark ? 'text-gray-200' : 'text-gray-800'}>
                      {teacher.teacherId} - {teacher.name}
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
                  setTeachersToDelete([]);
                  setTeachersToAdd([]);
                  setPendingTeachersData([]);
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

      {/* Add Teacher Modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                เพิ่มครู
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
                <input
                  type="text"
                  value={newTeacherData.teacherId}
                  onChange={(e) => setNewTeacherData({ ...newTeacherData, teacherId: e.target.value })}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-800'}`}
                  placeholder="เช่น T001"
                />
              </div>
              <div>
                <label className={`block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-1`}>
                  ชื่อ-สกุล
                </label>
                <input
                  type="text"
                  value={newTeacherData.name}
                  onChange={(e) => setNewTeacherData({ ...newTeacherData, name: e.target.value })}
                  className={`w-full p-3 rounded-xl border ${isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-800'}`}
                  placeholder="ชื่อ-สกุล"
                />
              </div>
              <div>
                <label className={`block text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'} mb-1`}>
                  Email (ไม่บังคับ)
                </label>
                <input
                  type="email"
                  value={newTeacherData.email}
                  onChange={(e) => setNewTeacherData({ ...newTeacherData, email: e.target.value })}
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
                onClick={handleAddTeacher}
                className="flex-1 bg-blue-500 text-white py-3 rounded-xl"
              >
                เพิ่ม
              </motion.button>
            </div>
      </Modal>
    </div>
  );
}
