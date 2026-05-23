'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { storageService } from '@/services/storage.service';
import { firestoreService } from '@/services/firestore.service';
import { schoolDatabaseService } from '@/services/school-database.service';
import { WhitelistEntry, TeacherNode } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import * as XLSX from 'xlsx';

export default function AdminUsers() {
  const router = useRouter();
  const { userAccount } = useAuth();
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [savedTeachers, setSavedTeachers] = useState<any[]>([]);
  const [savedStudents, setSavedStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    async function loadSavedData() {
      try {
        let schoolFirebaseConfig = null;

        // Try to get from userAccount first (new system)
        if (userAccount && userAccount.role === 'admin' && userAccount.schoolFirebaseConfig) {
          schoolFirebaseConfig = userAccount.schoolFirebaseConfig;
          console.log('Using userAccount schoolFirebaseConfig');
        } else {
          // Fallback to localStorage (old system)
          const config = await storageService.getMasterRegistryConfig();
          if (config && config.schoolProjectId) {
            // Fetch from Master Registry Firestore
            const hub = await firestoreService.getHub(config.schoolProjectId);
            if (hub && hub.schoolFirebaseConfig) {
              schoolFirebaseConfig = hub.schoolFirebaseConfig;
            }
          }
        }

        if (schoolFirebaseConfig) {
          const teachers = await schoolDatabaseService.getAllTeachers(schoolFirebaseConfig);
          const students = await schoolDatabaseService.getAllStudents(schoolFirebaseConfig);
          setSavedTeachers(teachers);
          setSavedStudents(students);
        }
      } catch (error) {
        console.error('Error loading saved data:', error);
      }
    }
    loadSavedData();
  }, [loading, userAccount]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const entries: WhitelistEntry[] = jsonData.map((row: any) => ({
        id: row['เลขประจำตัว'] || row['ID'] || '',
        name: row['ชื่อ-สกุล'] || row['Name'] || '',
        type: row['ประเภท'] || row['Type'] || 'student',
        class: row['ชั้น'] || row['Class'] || '',
        number: row['เลขที่'] || row['Number'] || '',
      }));

      setWhitelist(entries);
    } catch (error) {
      console.error('Error parsing file:', error);
      alert('ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบรูปแบบไฟล์');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const template = [
      {
        'เลขประจำตัว': 'S001',
        'ชื่อ-สกุล': 'นายสมชาย ใจดี',
        'ประเภท': 'student',
        'ชั้น': 'ม.1',
        'เลขที่': '1'
      },
      {
        'เลขประจำตัว': 'S002',
        'ชื่อ-สกุล': 'นายสมศรี มีสุข',
        'ประเภท': 'student',
        'ชั้น': 'ม.1',
        'เลขที่': '2'
      },
      {
        'เลขประจำตัว': 'T001',
        'ชื่อ-สกุล': 'นายวิชัย สอนดี',
        'ประเภท': 'teacher',
        'ชั้น': '',
        'เลขที่': ''
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(template);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Whitelist');
    XLSX.writeFile(workbook, 'nexore_whitelist_template.xlsx');
  };

  const handleDownloadWhitelist = () => {
    if (whitelist.length === 0) {
      alert('ไม่มีข้อมูลรายชื่อ');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(whitelist);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Whitelist');
    XLSX.writeFile(workbook, 'nexore_whitelist.xlsx');
  };

  const handleSaveWhitelist = async () => {
    setLoading(true);

    try {
      let schoolFirebaseConfig = null;

      // Try to get from userAccount first (new system)
      if (userAccount && userAccount.role === 'admin' && userAccount.schoolFirebaseConfig) {
        schoolFirebaseConfig = userAccount.schoolFirebaseConfig;
        console.log('Using userAccount schoolFirebaseConfig for save');
      } else {
        // Fallback to localStorage (old system)
        const config = await storageService.getMasterRegistryConfig();
        if (config && config.schoolProjectId) {
          // Fetch from Master Registry Firestore
          const hub = await firestoreService.getHub(config.schoolProjectId);
          if (hub && hub.schoolFirebaseConfig) {
            schoolFirebaseConfig = hub.schoolFirebaseConfig;
          }
        }
      }

      if (!schoolFirebaseConfig) {
        alert('ไม่พบ School Firebase Config กรุณาทำ Admin Setup ก่อน');
        setLoading(false);
        return;
      }

      // Separate teachers and students
      const teachers = whitelist.filter(entry => entry.type === 'teacher');
      const students = whitelist.filter(entry => entry.type === 'student');

      // Save teachers to Firestore
      await schoolDatabaseService.saveTeacherWhitelist(
        schoolFirebaseConfig,
        teachers.map(t => ({
          teacherId: t.id,
          name: t.name,
          email: '',
        }))
      );

      // Save students to Firestore
      await schoolDatabaseService.saveStudentWhitelist(
        schoolFirebaseConfig,
        students.map(s => ({
          studentId: s.id,
          name: s.name,
          class: s.class || '',
          number: s.number || '',
          schoolId: 'default',
          teacherNodes: teachers.map(t => t.id),
        }))
      );

      // Reload saved data
      const updatedTeachers = await schoolDatabaseService.getAllTeachers(schoolFirebaseConfig);
      const updatedStudents = await schoolDatabaseService.getAllStudents(schoolFirebaseConfig);
      setSavedTeachers(updatedTeachers);
      setSavedStudents(updatedStudents);

      alert('บันทึกรายชื่อสำเร็จ');
      setWhitelist([]);
      setFileName('');
    } catch (error) {
      console.error('Error saving whitelist:', error);
      alert('ไม่สามารถบันทึกรายชื่อได้');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black overflow-hidden relative p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="text-3xl font-bold text-white" style={{
            textShadow: '0 0 10px #39ff14, 0 0 20px #39ff14'
          }}>
            จัดการผู้ใช้
          </h1>
          <p className="text-neon-glow text-sm tracking-widest">
            USER MANAGEMENT
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => router.push('/admin/dashboard')}
          className="bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
        >
          Back
        </motion.button>
      </motion.div>

      {/* Upload Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-black-500 border-2 border-neon-glow rounded-xl p-6 mb-6"
      >
        <h2 className="text-xl font-bold text-white mb-6">
          📋 อัปโหลดรายชื่อ
        </h2>

        <div className="flex gap-4 mb-6">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleDownloadTemplate}
            className="flex-1 bg-gray-700 text-white py-3 rounded-lg hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
          >
            📥 ดาวน์โหลด Template
          </motion.button>
          {whitelist.length > 0 && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDownloadWhitelist}
              className="flex-1 bg-gray-700 text-white py-3 rounded-lg hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
            >
              📥 ดาวน์โหลดรายชื่อ
            </motion.button>
          )}
        </div>

        <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-neon-glow transition-colors cursor-pointer relative mb-6">
          <input
            type="file"
            accept=".xlsx"
            onChange={handleFileUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="text-4xl mb-4">📁</div>
          <p className="text-gray-400 mb-2">
            {fileName ? fileName : 'คลิกเพื่ออัปโหลดไฟล์ .xlsx'}
          </p>
          <p className="text-gray-500 text-sm">
            รองรับไฟล์ Excel (.xlsx) เท่านั้น
          </p>
          {whitelist.length > 0 && (
            <p className="text-neon-glow mt-2">
              อัปโหลดสำเร็จ: {whitelist.length} รายชื่อ
            </p>
          )}
        </div>

        {whitelist.length > 0 && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSaveWhitelist}
            disabled={loading}
            className="w-full bg-neon-glow text-black font-bold py-3 rounded-lg hover:bg-neon-bright transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'บันทึกรายชื่อ'}
          </motion.button>
        )}
      </motion.div>

      {/* Preview Section */}
      {whitelist.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-black-500 border-2 border-neon-glow rounded-xl p-6"
        >
          <h2 className="text-xl font-bold text-white mb-6">
            👥 รายชื่อที่อัปโหลด ({whitelist.length})
          </h2>

          {/* Teachers Section */}
          {whitelist.filter(e => e.type === 'teacher').length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-bold text-green-400 mb-3">
                👨‍🏫 ครู ({whitelist.filter(e => e.type === 'teacher').length})
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {whitelist.filter(e => e.type === 'teacher').map((entry, index) => (
                  <div
                    key={`teacher-${index}`}
                    className="bg-black-400 rounded-lg p-4 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-white font-medium">{entry.name}</p>
                      <p className="text-gray-400 text-sm">{entry.id}</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-sm bg-green-600 text-white">
                      ครู
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Students Section */}
          {whitelist.filter(e => e.type === 'student').length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-blue-400 mb-3">
                👨‍🎓 นักเรียน ({whitelist.filter(e => e.type === 'student').length})
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {whitelist.filter(e => e.type === 'student').map((entry, index) => (
                  <div
                    key={`student-${index}`}
                    className="bg-black-400 rounded-lg p-4 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-white font-medium">{entry.name}</p>
                      <p className="text-gray-400 text-sm">
                        {entry.id} • ชั้น {entry.class} เลขที่ {entry.number}
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-sm bg-blue-600 text-white">
                      นักเรียน
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Saved Data Section */}
      {savedTeachers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-black-500 border-2 border-neon-glow rounded-xl p-6"
        >
          <h2 className="text-xl font-bold text-white mb-6">
            💾 รายชื่อที่บันทึกแล้ว
          </h2>

          {/* Saved Teachers */}
          <div className="mb-6">
            <h3 className="text-lg font-bold text-green-400 mb-3">
              👨‍🏫 ครู ({savedTeachers.length})
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {savedTeachers.map((teacher, index) => (
                <div
                  key={`saved-teacher-${index}`}
                  className="bg-black-400 rounded-lg p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="text-white font-medium">{teacher.name}</p>
                    <p className="text-gray-400 text-sm">{teacher.teacherId}</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-sm bg-green-600 text-white">
                ครู
              </span>
                </div>
              ))}
            </div>
          </div>

          {/* Saved Students */}
          {savedStudents.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-blue-400 mb-3">
                👨‍🎓 นักเรียน ({savedStudents.length})
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {savedStudents.map((student: any, index: number) => (
                  <div
                    key={`saved-student-${index}`}
                    className="bg-black-400 rounded-lg p-4 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-white font-medium">{student.name}</p>
                      <p className="text-gray-400 text-sm">
                        {student.studentId} • ชั้น {student.class} เลขที่ {student.number}
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-sm bg-blue-600 text-white">
                      นักเรียน
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
