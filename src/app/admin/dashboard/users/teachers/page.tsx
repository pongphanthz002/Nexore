'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import { firestoreService } from '@/services/firestore.service';
import { teacherDatabaseService } from '@/services/teacher-database.service';
import * as XLSX from 'xlsx';
import { Eye, EyeOff, Edit, RefreshCw, Trash2, Download, Upload, Plus, ArrowLeft } from 'lucide-react';

export default function TeachersManagement() {
  const router = useRouter();
  const { userAccount } = useAuth();
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [teachersToDelete, setTeachersToDelete] = useState<any[]>([]);
  const [teachersToAdd, setTeachersToAdd] = useState<any[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingTeachersData, setPendingTeachersData] = useState<any[]>([]);
  const [isDark, setIsDark] = useState(false);
  const [showUID, setShowUID] = useState(false);
  const [showFirebaseConfigInline, setShowFirebaseConfigInline] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTeacherData, setEditTeacherData] = useState({
    teacherId: '',
    name: ''
  });
  const [selectedTeachers, setSelectedTeachers] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [newTeacherData, setNewTeacherData] = useState({
    teacherId: '',
    name: '',
    email: ''
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
    loadTeachers();
  }, [userAccount]);

  const loadTeachers = async () => {
    try {
      console.log('loadTeachers called, schoolFirebaseConfig:', userAccount?.schoolFirebaseConfig);
      if (!userAccount?.schoolFirebaseConfig) {
        console.log('No schoolFirebaseConfig, skipping loadTeachers');
        return;
      }
      const data = await schoolDatabaseService.getAllTeachers(userAccount.schoolFirebaseConfig);
      console.log('Teachers data loaded:', data);
      // Sort by teacherId
      data.sort((a, b) => a.teacherId.localeCompare(b.teacherId));
      setTeachers(data);
    } catch (error) {
      console.error('Error loading teachers:', error);
    }
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

      const teachersData = jsonData.map((row: any) => ({
        teacherId: row['เลขประจำตัวครู'] || '',
        name: row['ชื่อ-สกุล'] || '',
        email: row['Email'] || ''
      }));

      // Get existing teachers
      const existingTeachers = await schoolDatabaseService.getAllTeachers(userAccount.schoolFirebaseConfig);
      const newTeacherIds = teachersData.map(t => t.teacherId);
      const existingTeacherIds = existingTeachers.map(t => t.teacherId);
      
      // Find teachers to delete (in old but not in new)
      const teachersToDelete = existingTeachers.filter(t => !newTeacherIds.includes(t.teacherId));
      
      // Find teachers to add (in new but not in old)
      const teachersToAdd = teachersData.filter(t => !existingTeacherIds.includes(t.teacherId));

      // If there are teachers to delete or add, show confirmation dialog
      if (teachersToDelete.length > 0 || teachersToAdd.length > 0) {
        setTeachersToDelete(teachersToDelete);
        setTeachersToAdd(teachersToAdd);
        setPendingTeachersData(teachersData);
        setShowDeleteConfirm(true);
        setLoading(false);
        return;
      }

      // No changes, proceed with upload
      await schoolDatabaseService.saveTeacherWhitelist(userAccount.schoolFirebaseConfig, teachersData);
      await loadTeachers();
      alert('อัพโหลดรายชื่อครูสำเร็จ');
    } catch (error) {
      console.error('Error uploading teachers:', error);
      alert('ไม่สามารถอัพโหลดรายชื่อครูได้');
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
      // Delete teachers that are not in the new file
      for (const teacher of teachersToDelete) {
        try {
          // Delete from School Database
          await schoolDatabaseService.deleteTeacher(userAccount.schoolFirebaseConfig, teacher.teacherId);

          // Delete user account from Master Registry (if email exists)
          if (teacher.email) {
            await firestoreService.deleteUserAccount(teacher.email);
          }

          // Note: Firebase Auth deletion requires Admin SDK (server-side)
          // Cannot be done from client SDK - will need manual cleanup or server endpoint

          // Delete all data from Teacher Database (if teacher has firebaseConfig)
          if (teacher.firebaseConfig) {
            await teacherDatabaseService.deleteTeacherDatabase(teacher.firebaseConfig);
          }
        } catch (error) {
          console.error('Error deleting teacher:', teacher.teacherId, error);
        }
      }

      // Save new teachers to School Database
      await schoolDatabaseService.saveTeacherWhitelist(userAccount.schoolFirebaseConfig, pendingTeachersData);
      await loadTeachers();
      alert('อัพโหลดรายชื่อครูสำเร็จ');
    } catch (error) {
      console.error('Error uploading teachers:', error);
      alert('ไม่สามารถอัพโหลดรายชื่อครูได้');
    } finally {
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

      await loadTeachers();
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

      await loadTeachers();
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
      await loadTeachers();
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
          'teacher'
        );
      }

      await loadTeachers();
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
            จัดการครู
          </h1>
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            TEACHERS MANAGEMENT
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

      {/* Teachers List Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={`rounded-2xl p-6 shadow-lg ${isDark ? 'bg-gray-800' : 'bg-white'}`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
            รายชื่อครูทั้งหมด ({teachers.length})
          </h2>
          {selectedTeachers.size > 0 && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDeleteSelectedTeachers}
              className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-xl"
            >
              <Trash2 size={16} />
              <span>ลบ {selectedTeachers.size} รายการ</span>
            </motion.button>
          )}
        </div>
        {teachers.length === 0 ? (
          <p className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            ยังไม่มีข้อมูลครู
          </p>
        ) : (
          <div className="space-y-3">
            {teachers.map((teacher, index) => (
              <motion.div
                key={teacher.teacherId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.05 }}
                whileHover={{ scale: 1.01, x: 5 }}
                whileTap={{ scale: 0.99 }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  toggleTeacherSelection(teacher.teacherId);
                }}
                onTouchStart={() => handleTeacherTouchStart(teacher.teacherId)}
                onTouchEnd={handleTeacherTouchEnd}
                onTouchMove={handleTeacherTouchMove}
                onClick={() => selectedTeachers.size > 0 ? toggleTeacherSelection(teacher.teacherId) : handleTeacherClick(teacher)}
                className={`rounded-2xl p-4 cursor-pointer transition-all ${selectedTeachers.has(teacher.teacherId) ? 'bg-red-100 border-2 border-red-500' : isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-blue-50'}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>{teacher.name}</p>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{teacher.teacherId}</p>
                  </div>
                  {selectedTeachers.has(teacher.teacherId) ? (
                    <span className="text-red-500">✓</span>
                  ) : (
                    <span className="text-blue-500">→</span>
                  )}
                </div>
              </motion.div>
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
      {showPopup && selectedTeacher && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => {
            setShowPopup(false);
            setShowFirebaseConfigInline(false);
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className={`rounded-2xl p-6 max-w-md w-full shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}
          >
            {/* Firebase Config View */}
            {showFirebaseConfigInline ? (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={() => setShowFirebaseConfigInline(false)}
                    className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                  >
                    <ArrowLeft size={20} className={isDark ? 'text-gray-400' : 'text-gray-600'} />
                  </button>
                  <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                    Firebase Config
                  </h3>
                </div>
                <pre className={`p-4 rounded-xl overflow-x-auto text-xs ${isDark ? 'bg-gray-900 text-green-400' : 'bg-black text-green-400'}`}>
                  <code>{JSON.stringify(selectedTeacher.firebaseConfig, null, 2)}</code>
                </pre>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                    รายละเอียดครู
                  </h3>
                  <button
                    onClick={() => {
                      setShowPopup(false);
                      setShowFirebaseConfigInline(false);
                    }}
                    className={`text-2xl ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    ×
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
                          className={`p-1 rounded ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
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
                  {selectedTeacher.firebaseConfig && (
                    <div
                      onClick={() => setShowFirebaseConfigInline(true)}
                      className={`cursor-pointer ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} p-2 rounded-lg transition-colors`}
                    >
                      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Firebase Config</p>
                    </div>
                  )}
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
            )}
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
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
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
                onClick={handleSaveTeacherEdit}
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
                ⚠️ ยืนยันการอัพโหลดรายชื่อครู
              </h3>
              <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                พบการเปลี่ยนแปลงในรายชื่อครู
              </p>
            </div>

            {teachersToDelete.length > 0 && (
              <div className={`max-h-40 overflow-y-auto mb-4 rounded-2xl p-4 ${isDark ? 'bg-red-900/30' : 'bg-red-50'}`}>
                <p className={`text-sm mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>รายชื่อที่จะถูกลบ ({teachersToDelete.length} คน):</p>
                {teachersToDelete.map((teacher) => (
                  <div key={teacher.teacherId} className="flex items-center gap-2 py-1">
                    <span className="text-red-500">🗑️</span>
                    <span className={isDark ? 'text-gray-200' : 'text-gray-800'}>
                      {teacher.teacherId} - {teacher.name}
                    </span>
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

      {/* Add Teacher Modal */}
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
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
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
                  className={`w-full p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
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
                onClick={handleAddTeacher}
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
