'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import { firestoreService } from '@/services/firestore.service';
import { teacherDatabaseService } from '@/services/teacher-database.service';
import * as XLSX from 'xlsx';

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

  useEffect(() => {
    loadTeachers();
  }, [userAccount]);

  const loadTeachers = async () => {
    try {
      if (!userAccount?.schoolFirebaseConfig) return;
      const data = await schoolDatabaseService.getAllTeachers(userAccount.schoolFirebaseConfig);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-800">
            จัดการครู
          </h1>
          <p className="text-gray-500 text-sm">
            TEACHERS MANAGEMENT
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => router.push('/admin/dashboard/users')}
          className="bg-white text-gray-700 px-6 py-3 rounded-2xl shadow-sm hover:shadow-md transition-all"
        >
          กลับ
        </motion.button>
      </motion.div>

      {/* Download/Upload Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-3xl p-6 shadow-lg mb-6"
      >
        <h2 className="text-xl font-bold text-gray-800 mb-4">
          ดาวน์โหลดและอัพโหลดรายชื่อครู
        </h2>
        <div className="flex gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleDownload}
            className="flex-1 bg-blue-500 text-white py-3 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
          >
            <span>📥</span>
            <span>ดาวน์โหลดรายชื่อครู</span>
          </motion.button>
          <div className="flex-1 relative">
            <input
              type="file"
              accept=".xlsx"
              onChange={handleUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full bg-gray-200 text-gray-700 py-3 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
            >
              <span>📤</span>
              <span>อัพโหลดรายชื่อครู</span>
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Teachers List Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-3xl p-6 shadow-lg"
      >
        <h2 className="text-xl font-bold text-gray-800 mb-4">
          รายชื่อครูทั้งหมด ({teachers.length})
        </h2>
        {teachers.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
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
                onClick={() => handleTeacherClick(teacher)}
                className="bg-gray-50 rounded-2xl p-4 cursor-pointer hover:bg-blue-50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-800">{teacher.name}</p>
                    <p className="text-sm text-gray-500">{teacher.teacherId}</p>
                  </div>
                  <span className="text-blue-500">→</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Popup */}
      {showPopup && selectedTeacher && (
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
            className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-800">
                รายละเอียดครู
              </h3>
              <button
                onClick={() => setShowPopup(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">เลขประจำตัวครู</p>
                <p className="font-semibold text-gray-800">{selectedTeacher.teacherId}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ชื่อ-สกุล</p>
                <p className="font-semibold text-gray-800">{selectedTeacher.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="font-semibold text-gray-800">{selectedTeacher.email || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">UID</p>
                <p className="font-semibold text-gray-800">{selectedTeacher.uid || '-'}</p>
              </div>
              {selectedTeacher.firebaseConfig && (
                <div>
                  <p className="text-sm text-gray-500">Firebase Config</p>
                  <p className="font-semibold text-gray-800 text-xs break-all">
                    {selectedTeacher.firebaseConfig.projectId || '-'}
                  </p>
                </div>
              )}
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
            className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl"
          >
            <div className="mb-4">
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                ⚠️ ยืนยันการอัพโหลดรายชื่อครู
              </h3>
              <p className="text-gray-600">
                พบการเปลี่ยนแปลงในรายชื่อครู
              </p>
            </div>

            {teachersToDelete.length > 0 && (
              <div className="max-h-40 overflow-y-auto mb-4 bg-red-50 rounded-2xl p-4">
                <p className="text-sm text-gray-500 mb-2">รายชื่อที่จะถูกลบ ({teachersToDelete.length} คน):</p>
                {teachersToDelete.map((teacher) => (
                  <div key={teacher.teacherId} className="flex items-center gap-2 py-1">
                    <span className="text-red-500">🗑️</span>
                    <span className="text-gray-800">
                      {teacher.teacherId} - {teacher.name}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {teachersToAdd.length > 0 && (
              <div className="max-h-40 overflow-y-auto mb-4 bg-green-50 rounded-2xl p-4">
                <p className="text-sm text-gray-500 mb-2">รายชื่อที่จะถูกเพิ่ม ({teachersToAdd.length} คน):</p>
                {teachersToAdd.map((teacher) => (
                  <div key={teacher.teacherId} className="flex items-center gap-2 py-1">
                    <span className="text-green-500">➕</span>
                    <span className="text-gray-800">
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
                className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-2xl hover:bg-gray-300 transition-all"
              >
                ยกเลิก
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={confirmDeleteAndUpload}
                className="flex-1 bg-red-500 text-white py-3 rounded-2xl hover:bg-red-600 transition-all"
              >
                ยืนยันและอัพโหลด
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
