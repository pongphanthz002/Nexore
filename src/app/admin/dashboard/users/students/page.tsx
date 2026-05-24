'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import { firestoreService } from '@/services/firestore.service';
import { teacherDatabaseService } from '@/services/teacher-database.service';
import * as XLSX from 'xlsx';

export default function StudentsManagement() {
  const router = useRouter();
  const { userAccount } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [studentsToDelete, setStudentsToDelete] = useState<any[]>([]);
  const [studentsToAdd, setStudentsToAdd] = useState<any[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingStudentsData, setPendingStudentsData] = useState<any[]>([]);

  useEffect(() => {
    loadStudents();
  }, [userAccount]);

  const loadStudents = async () => {
    try {
      if (!userAccount?.schoolFirebaseConfig) return;
      const data = await schoolDatabaseService.getAllStudents(userAccount.schoolFirebaseConfig);
      setStudents(data);
    } catch (error) {
      console.error('Error loading students:', error);
    }
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

  // Group students by class and sort by number
  const groupedStudents = students.reduce((acc: any, student: any) => {
    const className = student.class || 'ไม่ระบุชั้น';
    if (!acc[className]) {
      acc[className] = [];
    }
    acc[className].push(student);
    return acc;
  }, {});

  // Sort each group by number
  Object.keys(groupedStudents).forEach(className => {
    groupedStudents[className].sort((a: any, b: any) => {
      const numA = parseInt(a.number) || 0;
      const numB = parseInt(b.number) || 0;
      return numA - numB;
    });
  });

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
            จัดการนักเรียน
          </h1>
          <p className="text-gray-500 text-sm">
            STUDENTS MANAGEMENT
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
          ดาวน์โหลดและอัพโหลดรายชื่อนักเรียน
        </h2>
        <div className="flex gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleDownload}
            className="flex-1 bg-blue-500 text-white py-3 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
          >
            <span>📥</span>
            <span>ดาวน์โหลดรายชื่อนักเรียน</span>
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
              <span>อัพโหลดรายชื่อนักเรียน</span>
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Students List Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-3xl p-6 shadow-lg"
      >
        <h2 className="text-xl font-bold text-gray-800 mb-4">
          รายชื่อนักเรียนทั้งหมด ({students.length})
        </h2>
        {students.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            ยังไม่มีข้อมูลนักเรียน
          </p>
        ) : (
          <div className="space-y-6">
            {Object.keys(groupedStudents).sort().map((className, classIndex) => (
              <div key={className}>
                <h3 className="text-lg font-semibold text-gray-700 mb-3">
                  ชั้น {className} ({groupedStudents[className].length})
                </h3>
                <div className="space-y-3">
                  {groupedStudents[className].map((student: any, studentIndex: number) => (
                    <motion.div
                      key={student.studentId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + classIndex * 0.1 + studentIndex * 0.02 }}
                      whileHover={{ scale: 1.01, x: 5 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => handleStudentClick(student)}
                      className="bg-gray-50 rounded-2xl p-4 cursor-pointer hover:bg-blue-50 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-800">{student.name}</p>
                          <p className="text-sm text-gray-500">
                            {student.studentId} • เลขที่ {student.number}
                          </p>
                        </div>
                        <span className="text-blue-500">→</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
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
            className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-800">
                รายละเอียดนักเรียน
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
                <p className="text-sm text-gray-500">เลขประจำตัวนักเรียน</p>
                <p className="font-semibold text-gray-800">{selectedStudent.studentId}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ชื่อ-สกุล</p>
                <p className="font-semibold text-gray-800">{selectedStudent.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ชั้น</p>
                <p className="font-semibold text-gray-800">{selectedStudent.class}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">เลขที่</p>
                <p className="font-semibold text-gray-800">{selectedStudent.number}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="font-semibold text-gray-800">{selectedStudent.email || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">UID</p>
                <p className="font-semibold text-gray-800">{selectedStudent.uid || '-'}</p>
              </div>
              {selectedStudent.teacherNodes && selectedStudent.teacherNodes.length > 0 && (
                <div>
                  <p className="text-sm text-gray-500">Teacher Nodes</p>
                  <p className="font-semibold text-gray-800">
                    {selectedStudent.teacherNodes.join(', ')}
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
                ⚠️ ยืนยันการอัพโหลดรายชื่อนักเรียน
              </h3>
              <p className="text-gray-600">
                พบการเปลี่ยนแปลงในรายชื่อนักเรียน
              </p>
            </div>

            {studentsToDelete.length > 0 && (
              <div className="max-h-40 overflow-y-auto mb-4 bg-red-50 rounded-2xl p-4">
                <p className="text-sm text-gray-500 mb-2">รายชื่อที่จะถูกลบ ({studentsToDelete.length} คน):</p>
                {studentsToDelete.map((student) => (
                  <div key={student.studentId} className="flex items-center gap-2 py-1">
                    <span className="text-red-500">🗑️</span>
                    <span className="text-gray-800">
                      {student.studentId} - {student.name} (ชั้น {student.class})
                    </span>
                  </div>
                ))}
              </div>
            )}

            {studentsToAdd.length > 0 && (
              <div className="max-h-40 overflow-y-auto mb-4 bg-green-50 rounded-2xl p-4">
                <p className="text-sm text-gray-500 mb-2">รายชื่อที่จะถูกเพิ่ม ({studentsToAdd.length} คน):</p>
                {studentsToAdd.map((student) => (
                  <div key={student.studentId} className="flex items-center gap-2 py-1">
                    <span className="text-green-500">➕</span>
                    <span className="text-gray-800">
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
