'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService, SubjectData, StudentData, ScheduleSlot, TeacherFirebaseConfig } from '@/services/school-database.service';
import { teacherDatabaseService, normalizeFirebaseConfig } from '@/services/teacher-database.service';
import { firestoreService } from '@/services/firestore.service';
import { firebaseManager } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import type { FirebaseConfig } from '@/types/firebase.types';
import { Edit, Save, X, Settings, Files, Eye, EyeOff, AlertTriangle, Loader2, BookOpen, Plus, Trash2, Clock, Calendar, Users, GraduationCap, ChevronRight, Search, CheckSquare, Square } from 'lucide-react';
import { GoogleBasicSubjectIcon, GoogleElectiveSubjectIcon } from '@/components/GoogleSubjectIcons';
import { useTheme } from '@/contexts/ThemeContext';

export default function ProfilePage() {
  const { userAccount, setUserAccount, invalidateCache, user } = useAuth();
  const { isDark } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [showConfigPopup, setShowConfigPopup] = useState(false);
  const [showConfigValues, setShowConfigValues] = useState(false);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [showConfigConfirm, setShowConfigConfirm] = useState(false);
  const [configConfirmText, setConfigConfirmText] = useState('');
  const [configValidating, setConfigValidating] = useState(false);
  const [configError, setConfigError] = useState('');
  /** Normalized config (JSON) that last passed validation; saving requires the form to still match it. */
  const [validatedConfigKey, setValidatedConfigKey] = useState<string | null>(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [showLinkConfirm, setShowLinkConfirm] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Subject Management State
  const [teacherSubjects, setTeacherSubjects] = useState<SubjectData[]>([]);
  const [allStudents, setAllStudents] = useState<StudentData[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [showManageSubjectsModal, setShowManageSubjectsModal] = useState(false);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [showDeleteSubjectConfirm, setShowDeleteSubjectConfirm] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState<SubjectData | null>(null);
  const [isDeletingSubject, setIsDeletingSubject] = useState(false);
  const [isSavingSubject, setIsSavingSubject] = useState(false);
  const [teacherConfig, setTeacherConfig] = useState<TeacherFirebaseConfig | null>(null);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState<string>('all');
  const [newSubjectData, setNewSubjectData] = useState<{
    subjectName: string;
    subjectType: 'basic' | 'elective';
    classroom: string;
    studentIds: string[];
    schedules: ScheduleSlot[];
  }>({
    subjectName: '',
    subjectType: 'basic',
    classroom: '',
    studentIds: [],
    schedules: [{ day: 'จันทร์', time: '08:30-09:30', duration: '1' }]
  });

  const [formData, setFormData] = useState({ name: '' });
  const [configFormData, setConfigFormData] = useState({
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  });

  useEffect(() => {
    if (userAccount) {
      setFormData({ name: userAccount.name || '' });
    }
  }, [userAccount]);

  useEffect(() => {
    async function loadTeachers() {
      if (userAccount?.role === 'admin' && userAccount?.schoolFirebaseConfig) {
        try {
          const allTeachers = await schoolDatabaseService.getAllTeachers(userAccount.schoolFirebaseConfig);
          setTeachers(allTeachers);
        } catch (error) {
          console.error('Error loading teachers:', error);
        }
      }
    }
    loadTeachers();
  }, [userAccount]);

  const loadTeacherSubjects = async () => {
    if (!userAccount?.schoolFirebaseConfig || !userAccount?.userId) return;
    setLoadingSubjects(true);
    try {
      const [allSubjects, config, students] = await Promise.all([
        schoolDatabaseService.getSubjectsForTeacher(userAccount.schoolFirebaseConfig, userAccount.userId),
        schoolDatabaseService.getTeacherConfig(userAccount.schoolFirebaseConfig, userAccount.userId),
        schoolDatabaseService.getAllStudents(userAccount.schoolFirebaseConfig)
      ]);
      const mySubjects = allSubjects;
      setTeacherSubjects(mySubjects);
      setTeacherConfig(config);
      setAllStudents(students);
    } catch (err) {
      console.error('Error loading teacher subjects:', err);
    } finally {
      setLoadingSubjects(false);
    }
  };

  useEffect(() => {
    loadTeacherSubjects();
  }, [userAccount]);

  const handleAddScheduleSlot = () => {
    if (newSubjectData.schedules.length >= 3) return;
    const days = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
    const usedDays = newSubjectData.schedules.map(s => s.day);
    const nextDay = days.find(d => !usedDays.includes(d)) || 'อังคาร';
    setNewSubjectData(prev => ({
      ...prev,
      schedules: [
        ...prev.schedules,
        {
          day: nextDay,
          time: prev.schedules[0]?.time || '08:30-09:30',
          duration: prev.schedules[0]?.duration || '1'
        }
      ]
    }));
  };

  const handleRemoveScheduleSlot = (index: number) => {
    if (newSubjectData.schedules.length <= 1) return;
    setNewSubjectData(prev => ({
      ...prev,
      schedules: prev.schedules.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateScheduleSlot = (index: number, field: keyof ScheduleSlot, value: string) => {
    setNewSubjectData(prev => ({
      ...prev,
      schedules: prev.schedules.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot))
    }));
  };

  const handleAddSubject = async () => {
    if (!userAccount?.schoolFirebaseConfig || !userAccount?.userId) {
      alert('ไม่พบข้อมูลครูผู้สอนหรือข้อมูลโรงเรียน');
      return;
    }
    if (!newSubjectData.subjectName.trim()) {
      alert('กรุณากรอกชื่อวิชา');
      return;
    }

    let finalClassroom = newSubjectData.classroom.trim();
    if (newSubjectData.subjectType === 'basic') {
      if (!finalClassroom) {
        alert('กรุณาเลือกห้องเรียน');
        return;
      }
    } else {
      if (newSubjectData.studentIds.length === 0) {
        alert('กรุณาเลือกนักเรียนที่เรียนในวิชาเพิ่มเติมอย่างน้อย 1 คน');
        return;
      }
      if (!finalClassroom) {
        const selected = allStudents.filter(s => newSubjectData.studentIds.includes(s.studentId));
        const detected = Array.from(new Set(selected.map(s => s.class).filter(Boolean))).sort();
        finalClassroom = detected.join(', ') || 'วิชาเพิ่มเติม';
      }
    }

    setIsSavingSubject(true);
    try {
      const primarySlot = newSubjectData.schedules[0] || { day: 'จันทร์', time: '08:30-09:30', duration: '1' };
      const subject: any = {
        subjectId: `SUB${Date.now()}`,
        teacherId: userAccount.userId,
        subjectName: newSubjectData.subjectName.trim(),
        subjectType: newSubjectData.subjectType,
        classroom: finalClassroom,
        day: primarySlot.day || 'จันทร์',
        time: primarySlot.time || '08:30-09:30',
        duration: primarySlot.duration || '1',
        schedules: newSubjectData.schedules
      };

      if (newSubjectData.subjectType === 'elective') {
        subject.studentIds = newSubjectData.studentIds;
      }

      await schoolDatabaseService.addSubject(userAccount.schoolFirebaseConfig, subject);
      invalidateCache();
      await loadTeacherSubjects();
      setShowAddSubjectModal(false);
      setStudentSearchQuery('');
      setStudentClassFilter('all');
      setNewSubjectData({
        subjectName: '',
        subjectType: 'basic',
        classroom: '',
        studentIds: [],
        schedules: [{ day: 'จันทร์', time: '08:30-09:30', duration: '1' }]
      });
    } catch (error) {
      console.error('Error adding subject:', error);
      alert('ไม่สามารถเพิ่มวิชาเรียนได้');
    } finally {
      setIsSavingSubject(false);
    }
  };

  const confirmDeleteSubject = async () => {
    if (!subjectToDelete || !userAccount?.schoolFirebaseConfig) return;
    setIsDeletingSubject(true);
    try {
      // 1. Delete from teacher's own database if configured
      if (teacherConfig?.firebaseConfig) {
        try {
          await teacherDatabaseService.deleteSubjectAllData(
            teacherConfig.firebaseConfig,
            subjectToDelete.subjectId,
            subjectToDelete.classroom
          );
        } catch (err) {
          console.error('Error deleting subject data from teacher database:', err);
        }
      }

      // 2. Delete all subject data from school database
      try {
        await schoolDatabaseService.deleteSubjectAllData(
          userAccount.schoolFirebaseConfig,
          subjectToDelete.subjectId,
          subjectToDelete.classroom
        );
      } catch (err) {
        console.error('Error deleting subject data from school database:', err);
      }

      // 3. Delete subject document
      await schoolDatabaseService.deleteSubject(
        userAccount.schoolFirebaseConfig,
        subjectToDelete.subjectId
      );

      invalidateCache();
      await loadTeacherSubjects();
      setShowDeleteSubjectConfirm(false);
      setSubjectToDelete(null);
    } catch (error) {
      console.error('Error deleting subject:', error);
      alert('ไม่สามารถลบวิชาเรียนได้');
    } finally {
      setIsDeletingSubject(false);
    }
  };

  const availableClassrooms = Array.from(new Set(allStudents.map(s => s.class)))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'th'));

  // For elective: filter across all classrooms with optional room filter + search query
  const studentsForElective = allStudents
    .filter(s => {
      if (studentClassFilter !== 'all' && s.class !== studentClassFilter) return false;
      if (!studentSearchQuery) return true;
      const q = studentSearchQuery.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        (s.number && s.number.includes(q)) ||
        (s.class && s.class.toLowerCase().includes(q)) ||
        (s.studentId && s.studentId.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      if (a.class !== b.class) return a.class.localeCompare(b.class, 'th');
      return (parseInt(a.number) || 0) - (parseInt(b.number) || 0);
    });

  const selectedStudentsForElective = allStudents.filter(s => newSubjectData.studentIds.includes(s.studentId));
  const detectedClassesForElective = Array.from(new Set(selectedStudentsForElective.map(s => s.class).filter(Boolean))).sort();

  const toggleStudentSelection = (studentId: string) => {
    setNewSubjectData(prev => {
      const exists = prev.studentIds.includes(studentId);
      return {
        ...prev,
        studentIds: exists
          ? prev.studentIds.filter(id => id !== studentId)
          : [...prev.studentIds, studentId]
      };
    });
  };

  const handleSelectAllStudentsInCurrentView = () => {
    const idsToAdd = studentsForElective.map(s => s.studentId);
    setNewSubjectData(prev => ({
      ...prev,
      studentIds: Array.from(new Set([...prev.studentIds, ...idsToAdd]))
    }));
  };

  const handleClearAllStudents = () => {
    setNewSubjectData(prev => ({
      ...prev,
      studentIds: []
    }));
  };

  const handleSave = () => {
    if (userAccount) {
      setUserAccount({ ...userAccount, name: formData.name });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData({ name: userAccount?.name || '' });
    setSelectedTeacherId('');
    setIsEditing(false);
  };

  const handleCopySchoolId = () => {
    if (userAccount?.schoolId) {
      navigator.clipboard.writeText(userAccount.schoolId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const maskValue = (val: string) => {
    if (!val) return '••••••';
    if (val.length <= 4) return '••••••';
    return val.substring(0, 4) + '••••••••';
  };

  // Available teachers: not linked (no uid) OR linked to current user
  const availableTeachers = teachers.filter(t => !t.uid || t.uid === userAccount?.id);

  const handleLinkTeacher = () => {
    if (!selectedTeacherId) return;
    setShowLinkConfirm(true);
  };

  const confirmLinkTeacher = async () => {
    if (!userAccount || !selectedTeacherId) return;
    setLinkLoading(true);
    try {
      const oldTeacherId = userAccount.userId;

      // Unlink old teacher if exists and different
      // Only unlink if oldTeacherId is a valid teacherId (not Firebase UID)
      if (oldTeacherId && oldTeacherId !== selectedTeacherId && userAccount.schoolFirebaseConfig) {
        try {
          const schoolDb = firebaseManager.getSchoolDb(userAccount.schoolFirebaseConfig);
          const oldTeacherRef = doc(schoolDb, 'teachers', oldTeacherId);
          await updateDoc(oldTeacherRef, { uid: '', email: '' });
        } catch (err) {
          // Ignore error if document doesn't exist (oldTeacherId might be Firebase UID)
          console.error('Error unlinking old teacher (document may not exist):', err);
        }
      }

      // Link new teacher: save uid and email to School Database
      // Use user?.uid (Firebase Auth UID) instead of userAccount.id (which is email)
      if (userAccount.schoolFirebaseConfig && user?.uid) {
        try {
          const schoolDb = firebaseManager.getSchoolDb(userAccount.schoolFirebaseConfig);
          const newTeacherRef = doc(schoolDb, 'teachers', selectedTeacherId);
          await updateDoc(newTeacherRef, {
            uid: user.uid,
            email: userAccount.email,
            role: userAccount.role === 'admin' ? 'admin' : 'teacher',
          });
        } catch (err) {
          console.error('Error linking new teacher:', err);
        }
      }

      // Update Master Registry mapping (keyed by Firebase Auth UID), preserving the role
      const accountData = user?.uid ? await firestoreService.getUserMapping(user.uid, userAccount.email) : null;
      const role = accountData?.role || 'admin';
      await firestoreService.saveUserAccount(
        userAccount.email,
        userAccount.schoolId,
        user?.uid || accountData?.uid,
        role,
        selectedTeacherId
      );

      setUserAccount({ ...userAccount, userId: selectedTeacherId, role });
    } finally {
      setLinkLoading(false);
      setShowLinkConfirm(false);
      setSelectedTeacherId('');
    }
  };

  // ---------------------------------------------------------------------------
  // Teacher DB config (the teacher's own Firebase project)
  // Flow: edit → ตรวจสอบ (format + live write/read test) → ยืนยัน → save to School DB
  // ---------------------------------------------------------------------------

  const currentTeacherDbConfig = teacherConfig?.firebaseConfig || null;
  const normalizedConfigForm = normalizeFirebaseConfig(configFormData);
  const configFormKey = JSON.stringify(normalizedConfigForm);
  const isConfigValidated = validatedConfigKey === configFormKey;

  const handleValidateConfig = async () => {
    setConfigError('');
    setValidatedConfigKey(null);

    const shapeError = teacherDatabaseService.validateConfigShape(normalizedConfigForm, {
      schoolProjectId: userAccount?.schoolFirebaseConfig?.projectId,
    });
    if (shapeError) {
      setConfigError(shapeError);
      return;
    }
    if (currentTeacherDbConfig?.projectId === normalizedConfigForm.projectId
        && JSON.stringify(normalizeFirebaseConfig(currentTeacherDbConfig as unknown as Record<string, string>)) === configFormKey) {
      setConfigError('Config นี้เหมือนกับที่ใช้อยู่แล้ว');
      return;
    }

    setConfigValidating(true);
    try {
      await teacherDatabaseService.verifyConnection(normalizedConfigForm, userAccount?.userId || 'check');
      setValidatedConfigKey(configFormKey);
    } catch (err) {
      console.error('Config validation failed:', err);
      setConfigError((err as Error).message || 'ไม่สามารถเชื่อมต่อกับฐานข้อมูลได้ กรุณาตรวจสอบ Config');
    } finally {
      setConfigValidating(false);
    }
  };

  const handleSaveConfig = () => {
    if (!isConfigValidated) {
      setConfigError('กรุณากด "ตรวจสอบ Config" ให้ผ่านก่อนบันทึก');
      return;
    }
    setConfigError('');
    setConfigConfirmText('');
    setShowConfigConfirm(true);
  };

  const confirmSaveConfig = async () => {
    if (configConfirmText !== 'ยืนยัน' || !userAccount?.schoolFirebaseConfig || !teacherConfig) return;
    // The form must not have changed since it was validated
    if (!isConfigValidated) {
      setConfigError('Config ถูกแก้ไขหลังการตรวจสอบ กรุณาตรวจสอบใหม่อีกครั้ง');
      return;
    }

    setConfigSaving(true);
    setConfigError('');
    try {
      await schoolDatabaseService.updateTeacherFirebaseConfig(
        userAccount.schoolFirebaseConfig,
        teacherConfig.teacherId || userAccount.userId,
        normalizedConfigForm
      );
      setTeacherConfig({ ...teacherConfig, firebaseConfig: normalizedConfigForm });
      setShowConfigConfirm(false);
      setConfigConfirmText('');
      setIsEditingConfig(false);
      setValidatedConfigKey(null);
      setShowConfigPopup(false);
      alert(`เปลี่ยนฐานข้อมูลครูเป็น ${normalizedConfigForm.projectId} เรียบร้อยแล้ว`);
    } catch (err) {
      console.error('Error saving teacher config:', err);
      setConfigError('บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setConfigSaving(false);
    }
  };

  const resetConfigForm = () => {
    const cfg: Partial<FirebaseConfig> = currentTeacherDbConfig || {};
    setConfigFormData({
      apiKey: cfg.apiKey || '',
      authDomain: cfg.authDomain || '',
      projectId: cfg.projectId || '',
      storageBucket: cfg.storageBucket || '',
      messagingSenderId: cfg.messagingSenderId || '',
      appId: cfg.appId || '',
    });
    setIsEditingConfig(false);
    setConfigError('');
    setValidatedConfigKey(null);
  };

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
        >
          <div className="flex items-center justify-between mb-6">
            <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              ข้อมูลส่วนตัว
            </h1>
            {!isEditing && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsEditing(true)}
                className={`p-2 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
              >
                <Edit size={20} />
              </motion.button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>ชื่อ</label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full mt-1 p-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                />
              ) : (
                <p className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>{userAccount?.name || '-'}</p>
              )}
            </div>

            <div>
              <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>อีเมล</label>
              <p className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>{userAccount?.email || '-'}</p>
            </div>

            <div>
              <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                เลขประจำตัวครู (Teacher ID)
              </label>
              {isEditing && userAccount?.role === 'admin' ? (
                <div className="mt-1">
                  <select
                    value={selectedTeacherId || userAccount?.userId || ''}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    className={`w-full p-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                  >
                    <option value="">-- เลือกเลขประจำตัวครู --</option>
                    {availableTeachers.map((teacher) => (
                      <option key={teacher.teacherId} value={teacher.teacherId}>
                        {teacher.name} ({teacher.teacherId})
                      </option>
                    ))}
                  </select>
                  {selectedTeacherId && selectedTeacherId !== userAccount?.userId && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleLinkTeacher}
                      className="w-full mt-2 p-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm shadow-md shadow-red-500/20 transition-all"
                    >
                      ยืนยันการผูกข้อมูล
                    </motion.button>
                  )}
                </div>
              ) : (
                <p className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>{userAccount?.userId || '-'}</p>
              )}
            </div>
          </div>

          {/* Edit Actions */}
          <AnimatePresence>
            {isEditing && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="flex gap-3 mt-6"
              >
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSave}
                  className="flex-1 p-3 rounded-xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center gap-2 shadow-md shadow-red-500/20 transition-all"
                >
                  <Save size={20} />
                  บันทึก
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCancel}
                  className={`flex-1 p-3 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'} flex items-center justify-center gap-2`}
                >
                  <X size={20} />
                  ยกเลิก
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Manage Subjects Menu Tile */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.05 }}
        >
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setShowManageSubjectsModal(true)}
            className={`w-full p-5 rounded-2xl flex items-center justify-between shadow-lg transition-all ${
              isDark ? 'bg-gray-800 hover:bg-gray-700/80 text-white' : 'bg-white hover:bg-gray-50 text-gray-900'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className={`p-3 rounded-2xl ${isDark ? 'bg-red-950/40 text-red-400' : 'bg-red-50 text-red-600'}`}>
                <BookOpen size={24} />
              </div>
              <div className="text-left">
                <h2 className="font-bold text-lg leading-tight">จัดการวิชาเรียนที่สอน</h2>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  เพิ่มหรือลบรายวิชาพื้นฐานและเพิ่มเติม
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                teacherSubjects.length > 0
                  ? isDark ? 'bg-red-950/40 text-red-400 border border-red-800/40' : 'bg-red-50 text-red-600 border border-red-200'
                  : isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
              }`}>
                {teacherSubjects.length} วิชา
              </span>
              <ChevronRight size={20} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
            </div>
          </motion.button>
        </motion.div>

        {/* School ID Snippet */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.1 }}
          className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
        >
          <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-4`}>School ID</h2>
          {userAccount?.schoolId && (
            <div className="relative p-4 rounded-2xl bg-gray-100 dark:bg-gray-700 font-mono text-sm">
              <div className="flex items-center justify-between">
                <p className="text-gray-800 dark:text-white">
                  <span className="text-purple-600 dark:text-purple-400">School ID: </span>
                  <span className="text-red-500 dark:text-red-400">{userAccount.schoolId}</span>
                </p>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleCopySchoolId}
                  className="p-2 bg-gray-300 dark:bg-gray-600 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-all"
                >
                  <Files size={20} className={isDark ? 'text-white' : 'text-gray-900'} />
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Firebase Config Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.2 }}
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { setShowConfigPopup(true); setShowConfigValues(false); setIsEditingConfig(false); resetConfigForm(); }}
            className={`w-full p-4 rounded-2xl flex items-center justify-center gap-2 ${isDark ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-700'} shadow-lg`}
          >
            <Settings size={20} />
            <span className="font-medium">Firebase Config</span>
          </motion.button>
        </motion.div>

        {/* Copied Toast */}
        {copied && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-2xl shadow-lg z-50"
          >
            คัดลอกแล้ว!
          </motion.div>
        )}

        {/* Link Teacher Confirmation Dialog */}
        {showLinkConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`rounded-2xl p-6 max-w-md w-full ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
            >
              <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>
                ยืนยันการผูกข้อมูล
              </h3>
              <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                คุณต้องการผูกบัญชีเข้ากับเลขประจำตัวครู <strong>{selectedTeacherId}</strong> ใช่ไหม?
              </p>
              {userAccount?.userId && userAccount.userId !== selectedTeacherId && (
                <p className={`mt-2 text-sm ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
                  ⚠️ การผูกบัญชีใหม่จะยกเลิกการผูกกับเลข {userAccount.userId} โดยอัตโนมัติ
                </p>
              )}
              <div className="flex gap-3 mt-6">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowLinkConfirm(false)}
                  disabled={linkLoading}
                  className={`flex-1 py-3 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                >
                  ยกเลิก
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={confirmLinkTeacher}
                  disabled={linkLoading}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl flex items-center justify-center gap-2 shadow-md shadow-red-500/20 transition-all"
                >
                  {linkLoading && <Loader2 size={16} className="animate-spin" />}
                  ยืนยัน
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Firebase Config Popup */}
        <AnimatePresence>
          {showConfigPopup && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
              onClick={() => { if (!isEditingConfig) { setShowConfigPopup(false); } }}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className={`rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Firebase Config
                  </h2>
                  <div className="flex gap-2">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setShowConfigValues(!showConfigValues)}
                      className={`p-2 rounded-lg ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}
                    >
                      {showConfigValues ? <EyeOff size={16} /> : <Eye size={16} />}
                    </motion.button>
                    {!isEditingConfig && teacherConfig && (
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => { setIsEditingConfig(true); setConfigError(''); setValidatedConfigKey(null); }}
                        className={`p-2 rounded-lg ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}
                      >
                        <Edit size={16} />
                      </motion.button>
                    )}
                    {!isEditingConfig && (
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setShowConfigPopup(false)}
                        className={`p-2 rounded-lg ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}
                      >
                        <X size={16} />
                      </motion.button>
                    )}
                  </div>
                </div>

                <p className={`text-sm mb-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {!teacherConfig
                    ? 'ยังไม่ได้ผูกบัญชีกับข้อมูลครู จึงยังตั้งค่าฐานข้อมูลครูไม่ได้'
                    : currentTeacherDbConfig
                      ? <>ฐานข้อมูลครูที่ใช้อยู่: <span className="font-mono font-semibold">{currentTeacherDbConfig.projectId}</span></>
                      : 'ตอนนี้ใช้ฐานข้อมูลของโรงเรียน (ยังไม่ได้ตั้งฐานข้อมูลครู)'}
                </p>

                {isEditingConfig && (
                  <div className="flex items-start gap-2 mb-4 text-red-500">
                    <AlertTriangle size={20} className="shrink-0" />
                    <span className="text-sm font-medium">
                      เมื่อเปลี่ยนฐานข้อมูล คะแนน งาน และการเช็คชื่อเดิมจะไม่ถูกย้ายไปด้วย ระบบจะเริ่มอ่าน/บันทึกที่ฐานข้อมูลใหม่ทันที
                    </span>
                  </div>
                )}

                <div className={`p-4 rounded-xl border-2 ${isEditingConfig ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : isDark ? 'border-gray-600 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="space-y-3">
                    {Object.entries(configFormData).map(([key, value]) => (
                      <div key={key}>
                        <label className={`text-xs font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{key}</label>
                        {isEditingConfig ? (
                          <input
                            type={showConfigValues ? 'text' : 'password'}
                            value={value}
                            onChange={(e) => { setConfigFormData({ ...configFormData, [key]: e.target.value }); setConfigError(''); setValidatedConfigKey(null); }}
                            autoComplete="off"
                            spellCheck={false}
                            className={`w-full mt-1 p-2 rounded-lg border text-sm font-mono ${isDark ? 'bg-gray-800 border-red-700 text-white' : 'bg-white border-red-300 text-gray-900'}`}
                          />
                        ) : (
                          <p className={`text-sm font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            {value ? (showConfigValues ? value : maskValue(value)) : '-'}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {isEditingConfig && (
                  <div className="mt-4 space-y-3">
                    {configError && !showConfigConfirm && (
                      <p role="alert" className="text-red-500 text-sm">{configError}</p>
                    )}
                    {isConfigValidated && (
                      <p className="text-green-600 text-sm font-medium">
                        ✓ ตรวจสอบผ่าน: เชื่อมต่อและบันทึกข้อมูลทดสอบที่ {normalizedConfigForm.projectId} ได้
                      </p>
                    )}
                    <div className="flex gap-3">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleValidateConfig}
                        disabled={configValidating}
                        className={`flex-1 p-2 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-50 ${isDark ? 'bg-gray-700 text-gray-100' : 'bg-gray-800 text-white'}`}
                      >
                        {configValidating ? <Loader2 size={16} className="animate-spin" /> : <CheckSquare size={16} />}
                        {configValidating ? 'กำลังตรวจสอบ...' : 'ตรวจสอบ Config'}
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleSaveConfig}
                        disabled={!isConfigValidated || configValidating}
                        className="flex-1 p-2 rounded-lg bg-red-500 text-white text-sm flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                      >
                        <Save size={16} />
                        บันทึก Config
                      </motion.button>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => resetConfigForm()}
                      disabled={configValidating}
                      className={`w-full p-2 rounded-lg text-sm flex items-center justify-center gap-2 ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}
                    >
                      <X size={16} />
                      ยกเลิก
                    </motion.button>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Firebase Config Save Confirmation Dialog */}
        {showConfigConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-[60]"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`rounded-2xl p-6 max-w-md w-full ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
            >
              <div className="flex items-center gap-2 mb-4 text-red-500">
                <AlertTriangle size={24} />
                <h3 className="text-xl font-bold">ยืนยันการเปลี่ยนฐานข้อมูลครู</h3>
              </div>
              <div className={`mb-4 space-y-2 text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                <p>
                  จาก <span className="font-mono font-semibold">{currentTeacherDbConfig?.projectId || 'ฐานข้อมูลโรงเรียน'}</span>
                  {' '}→ <span className="font-mono font-semibold">{normalizedConfigForm.projectId}</span>
                </p>
                <p>ข้อมูลเดิม (คะแนน งาน เช็คชื่อ) จะยังอยู่ที่ฐานข้อมูลเดิม และจะไม่แสดงหลังเปลี่ยน</p>
                <p>พิมพ์ <strong>&quot;ยืนยัน&quot;</strong> เพื่อดำเนินการ</p>
              </div>
              <input
                type="text"
                value={configConfirmText}
                onChange={(e) => setConfigConfirmText(e.target.value)}
                placeholder='พิมพ์ &quot;ยืนยัน&quot;'
                className={`w-full p-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
              />
              {configError && (
                <p className="text-red-500 text-sm mt-2">{configError}</p>
              )}
              <div className="flex gap-3 mt-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setShowConfigConfirm(false); setConfigConfirmText(''); setConfigError(''); }}
                  disabled={configSaving}
                  className={`flex-1 py-3 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                >
                  ยกเลิก
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={confirmSaveConfig}
                  disabled={configConfirmText !== 'ยืนยัน' || configSaving}
                  className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 ${
                    configConfirmText === 'ยืนยัน' && !configSaving
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {configSaving && <Loader2 size={16} className="animate-spin" />}
                  {configSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Manage Subjects Modal */}
        <AnimatePresence>
          {showManageSubjectsModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className={`w-full max-w-2xl max-h-[85vh] rounded-3xl p-6 shadow-2xl flex flex-col ${
                  isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'
                }`}
              >
                {/* Modal Header */}
                <div className="pb-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl sm:text-2xl font-bold">วิชาที่สอน</h3>
                    <div className="flex items-center gap-2">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowAddSubjectModal(true)}
                        title="เพิ่มวิชา"
                        className="p-2 sm:p-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white shadow-md shadow-red-500/20 transition-all flex items-center justify-center"
                      >
                        <Plus size={20} />
                      </motion.button>
                      <button 
                        onClick={() => setShowManageSubjectsModal(false)}
                        title="ปิด"
                        className={`p-2 sm:p-2.5 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>
                  <p className={`text-xs sm:text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    มีทั้งหมด {teacherSubjects.length} วิชา
                  </p>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
                  {loadingSubjects ? (
                    <div className="py-12 flex items-center justify-center gap-2 text-sm text-gray-500">
                      <Loader2 size={20} className="animate-spin text-red-500" />
                      กำลังโหลดข้อมูลวิชาเรียน...
                    </div>
                  ) : teacherSubjects.length === 0 ? (
                    <div className={`p-10 text-center rounded-2xl border-2 border-dashed ${
                      isDark ? 'border-gray-700 bg-gray-900/40 text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-500'
                    }`}>
                      <BookOpen size={40} className="mx-auto mb-2 opacity-40" />
                      <p className="font-semibold text-base">ยังไม่มีวิชาเรียนที่สอน</p>
                      <p className="text-xs opacity-70 mt-1 mb-4">กดปุ่ม &quot;+&quot; ด้านบนเพื่อเพิ่มวิชาเรียนใหม่</p>
                      <button
                        onClick={() => setShowAddSubjectModal(true)}
                        className="px-4 py-2 rounded-xl bg-red-500 text-white font-medium text-sm inline-flex items-center gap-1.5 shadow-md shadow-red-500/20"
                      >
                        <Plus size={16} />
                        เพิ่มวิชาเรียนแรก
                      </button>
                    </div>
                  ) : (
                    teacherSubjects.map((sub) => {
                      const isElective = sub.subjectType === 'elective';
                      const studentCount = isElective && Array.isArray(sub.studentIds) ? sub.studentIds.length : null;

                      return (
                        <div
                          key={sub.subjectId}
                          className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                            isDark 
                              ? 'bg-gray-900/60 border-gray-700/80 hover:border-gray-600' 
                              : 'bg-gray-50/80 border-gray-200/90 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <h4 className="font-bold text-base truncate">{sub.subjectName}</h4>
                              <span
                                title={isElective ? `วิชาเพิ่มเติม${studentCount !== null ? ` (${studentCount} คน)` : ''}` : 'วิชาพื้นฐาน'}
                                className="inline-flex items-center shrink-0"
                              >
                                {isElective ? (
                                  <GoogleElectiveSubjectIcon size={20} />
                                ) : (
                                  <GoogleBasicSubjectIcon size={20} />
                                )}
                              </span>
                              {isElective && studentCount !== null && (
                                <span className={`text-[11px] px-2 py-0.5 rounded-md font-semibold ${
                                  isDark ? 'bg-amber-950/40 text-amber-300' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {studentCount} คน
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-xs opacity-75">
                              <span className="font-semibold text-red-500 dark:text-red-400">
                                ห้อง {sub.classroom}
                              </span>
                              {sub.schedules && sub.schedules.length > 0 ? (
                                sub.schedules.map((sch, i) => (
                                  <span key={i} className="flex items-center gap-1">
                                    <span>•</span>
                                    <Calendar size={12} />
                                    <span>{sch.day}</span>
                                    <Clock size={12} className="ml-0.5" />
                                    <span className="font-mono">{sch.time}</span>
                                    {sch.duration && <span>({sch.duration} คาบ)</span>}
                                  </span>
                                ))
                              ) : (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <Calendar size={12} />
                                    {sub.day || '-'}
                                  </span>
                                  <span>•</span>
                                  <span className="flex items-center gap-1 font-mono">
                                    <Clock size={12} />
                                    {sub.time || '-'}
                                  </span>
                                  {sub.duration && (
                                    <>
                                      <span>•</span>
                                      <span>{sub.duration} คาบ</span>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              setSubjectToDelete(sub);
                              setShowDeleteSubjectConfirm(true);
                            }}
                            title="ลบวิชาเรียน"
                            className="p-2 rounded-xl text-red-500 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Modal Footer */}
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700 text-right">
                  <button
                    onClick={() => setShowManageSubjectsModal(false)}
                    className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                      isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    ปิด
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Add Subject Modal */}
        <AnimatePresence>
          {showAddSubjectModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className={`w-full max-w-lg max-h-[90vh] rounded-3xl p-6 shadow-2xl flex flex-col ${
                  isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'
                }`}
              >
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <div className={`p-2.5 rounded-xl ${isDark ? 'bg-red-950/40 text-red-400' : 'bg-red-50 text-red-600'}`}>
                      <BookOpen size={22} />
                    </div>
                    <h3 className="text-xl font-bold">เพิ่มวิชาเรียนใหม่</h3>
                  </div>
                  <button 
                    onClick={() => setShowAddSubjectModal(false)}
                    className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                  {/* Subject Name */}
                  <div>
                    <label className={`text-xs font-semibold block mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      ชื่อวิชา *
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น คณิตศาสตร์พื้นฐาน, วิทยาการคำนวณ"
                      value={newSubjectData.subjectName}
                      onChange={(e) => setNewSubjectData({ ...newSubjectData, subjectName: e.target.value })}
                      className={`w-full p-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-red-500 ${
                        isDark ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'
                      }`}
                    />
                  </div>

                  {/* Subject Type: Basic vs Elective */}
                  <div>
                    <label className={`text-xs font-semibold block mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      ประเภทวิชา *
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setNewSubjectData({ ...newSubjectData, subjectType: 'basic', studentIds: [] })}
                        className={`p-3 rounded-2xl border-2 flex items-center justify-center gap-2.5 transition-all ${
                          newSubjectData.subjectType === 'basic'
                            ? isDark
                              ? 'border-blue-500 bg-blue-950/40 text-blue-300 font-bold shadow-md shadow-blue-500/10'
                              : 'border-blue-500 bg-blue-50 text-blue-700 font-bold shadow-md shadow-blue-500/10'
                            : isDark
                              ? 'border-gray-700 bg-gray-900/40 text-gray-400 hover:border-gray-600'
                              : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <GoogleBasicSubjectIcon size={22} />
                        <span className="text-sm">วิชาพื้นฐาน</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setNewSubjectData({ ...newSubjectData, subjectType: 'elective' })}
                        className={`p-3 rounded-2xl border-2 flex items-center justify-center gap-2.5 transition-all ${
                          newSubjectData.subjectType === 'elective'
                            ? isDark
                              ? 'border-amber-500 bg-amber-950/40 text-amber-300 font-bold shadow-md shadow-amber-500/10'
                              : 'border-amber-500 bg-amber-50 text-amber-800 font-bold shadow-md shadow-amber-500/10'
                            : isDark
                              ? 'border-gray-700 bg-gray-900/40 text-gray-400 hover:border-gray-600'
                              : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <GoogleElectiveSubjectIcon size={22} />
                        <span className="text-sm">วิชาเพิ่มเติม</span>
                      </button>
                    </div>
                  </div>

                  {/* Classroom input */}
                  {newSubjectData.subjectType === 'basic' ? (
                    <div>
                      <label className={`text-xs font-semibold block mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        ห้องเรียน *
                      </label>
                      <select
                        value={newSubjectData.classroom}
                        onChange={(e) => setNewSubjectData({ ...newSubjectData, classroom: e.target.value })}
                        className={`w-full p-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-red-500 ${
                          isDark ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'
                        }`}
                      >
                        <option value="">-- เลือกห้องเรียน --</option>
                        {availableClassrooms.map((cls) => (
                          <option key={cls} value={cls}>
                            ห้อง {cls}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className={`text-xs font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                          ห้องเรียน / กลุ่มเรียน
                        </label>
                        {detectedClassesForElective.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setNewSubjectData({ ...newSubjectData, classroom: detectedClassesForElective.join(', ') })}
                            className="text-[11px] text-red-500 hover:underline"
                          >
                            ใช้ห้อง: {detectedClassesForElective.join(', ')}
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder={
                          detectedClassesForElective.length > 0
                            ? `เช่น ${detectedClassesForElective.join(', ')}`
                            : 'เช่น ม.1 (รวม), เพิ่มเติมคอมฯ'
                        }
                        value={newSubjectData.classroom}
                        onChange={(e) => setNewSubjectData({ ...newSubjectData, classroom: e.target.value })}
                        className={`w-full p-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-red-500 ${
                          isDark ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'
                        }`}
                      />
                    </div>
                  )}

                  {/* Elective Student Selector: Cross-Classroom Support */}
                  {newSubjectData.subjectType === 'elective' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className={`p-3.5 rounded-2xl border ${
                        isDark ? 'bg-gray-900/60 border-gray-700' : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <label className={`text-xs font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                          เลือกนักเรียนในวิชาเพิ่มเติม ({newSubjectData.studentIds.length} คน)
                        </label>
                        <div className="flex items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={handleSelectAllStudentsInCurrentView}
                            className="text-red-500 font-semibold hover:underline"
                          >
                            เลือกทั้งหมดในหน้านี้
                          </button>
                          <span className="opacity-40">|</span>
                          <button
                            type="button"
                            onClick={handleClearAllStudents}
                            className="opacity-70 hover:underline"
                          >
                            ล้างทั้งหมด
                          </button>
                        </div>
                      </div>

                      {/* Filter by Classroom + Search Input */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                        <div>
                          <select
                            value={studentClassFilter}
                            onChange={(e) => setStudentClassFilter(e.target.value)}
                            className={`w-full p-2 rounded-lg border text-xs ${
                              isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'
                            }`}
                          >
                            <option value="all">ทุกห้องเรียน ({allStudents.length} คน)</option>
                            {availableClassrooms.map((cls) => (
                              <option key={cls} value={cls}>
                                ห้อง {cls} ({allStudents.filter(s => s.class === cls).length} คน)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                          <input
                            type="text"
                            placeholder="ค้นหาชื่อ หรือ เลขที่ หรือ ห้อง..."
                            value={studentSearchQuery}
                            onChange={(e) => setStudentSearchQuery(e.target.value)}
                            className={`w-full pl-8 pr-3 py-2 rounded-lg border text-xs ${
                              isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Student list */}
                      {studentsForElective.length === 0 ? (
                        <p className={`text-xs py-4 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          ไม่พบข้อมูลนักเรียนตามเงื่อนไขที่เลือก
                        </p>
                      ) : (
                        <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                          {studentsForElective.map((student) => {
                            const isChecked = newSubjectData.studentIds.includes(student.studentId);
                            return (
                              <label
                                key={student.studentId}
                                className={`flex items-center gap-2.5 p-2 rounded-xl cursor-pointer text-xs transition-colors ${
                                  isChecked
                                    ? isDark ? 'bg-amber-950/40 text-amber-300' : 'bg-amber-100/70 text-amber-900'
                                    : isDark ? 'hover:bg-gray-800/80' : 'hover:bg-gray-100'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleStudentSelection(student.studentId)}
                                  className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
                                />
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                  isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                                }`}>
                                  {student.class || '-'}
                                </span>
                                <span className="font-mono font-semibold opacity-70 w-7">
                                  #{student.number}
                                </span>
                                <span className="font-medium flex-1 truncate">
                                  {student.name}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Day, Time, and Duration combined with multi-day support (up to 3 days) */}
                  <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <label className={`text-xs font-bold flex items-center gap-1.5 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                        <Calendar size={14} className="text-red-500" />
                        <span>กำหนดวัน เวลา และจำนวนคาบที่สอน</span>
                      </label>
                      {newSubjectData.schedules.length < 3 && (
                        <button
                          type="button"
                          onClick={handleAddScheduleSlot}
                          className="text-xs text-red-500 hover:text-red-600 font-semibold flex items-center gap-1 transition-colors"
                        >
                          <Plus size={14} />
                          <span>เพิ่มวันสอน ({newSubjectData.schedules.length}/3)</span>
                        </button>
                      )}
                    </div>

                    {newSubjectData.schedules.map((slot, index) => (
                      <div
                        key={index}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          isDark ? 'bg-gray-900/60 border-gray-700' : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-red-500 dark:text-red-400">
                            วันที่ {index + 1}
                          </span>
                          {newSubjectData.schedules.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveScheduleSlot(index)}
                              className="text-xs text-red-400 hover:text-red-600 p-1 rounded-lg transition-colors"
                              title="ลบวันสอนนี้"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          {/* Day */}
                          <div>
                            <label className={`text-[11px] font-semibold block mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                              วันที่สอน
                            </label>
                            <select
                              value={slot.day}
                              onChange={(e) => handleUpdateScheduleSlot(index, 'day', e.target.value)}
                              className={`w-full p-2.5 rounded-xl border text-xs transition-all focus:outline-none focus:ring-2 focus:ring-red-500 ${
                                isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'
                              }`}
                            >
                              <option value="จันทร์">จันทร์</option>
                              <option value="อังคาร">อังคาร</option>
                              <option value="พุธ">พุธ</option>
                              <option value="พฤหัสบดี">พฤหัสบดี</option>
                              <option value="ศุกร์">ศุกร์</option>
                              <option value="เสาร์">เสาร์</option>
                              <option value="อาทิตย์">อาทิตย์</option>
                            </select>
                          </div>

                          {/* Time */}
                          <div>
                            <label className={`text-[11px] font-semibold block mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                              เวลาที่สอน
                            </label>
                            <input
                              type="text"
                              placeholder="เช่น 08:30-09:30"
                              value={slot.time}
                              onChange={(e) => handleUpdateScheduleSlot(index, 'time', e.target.value)}
                              className={`w-full p-2.5 rounded-xl border text-xs transition-all focus:outline-none focus:ring-2 focus:ring-red-500 ${
                                isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'
                              }`}
                            />
                          </div>

                          {/* Duration */}
                          <div>
                            <label className={`text-[11px] font-semibold block mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                              จำนวนคาบ / ชม.
                            </label>
                            <select
                              value={slot.duration || '1'}
                              onChange={(e) => handleUpdateScheduleSlot(index, 'duration', e.target.value)}
                              className={`w-full p-2.5 rounded-xl border text-xs transition-all focus:outline-none focus:ring-2 focus:ring-red-500 ${
                                isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'
                              }`}
                            >
                              <option value="1">1 คาบ</option>
                              <option value="2">2 คาบ</option>
                              <option value="3">3 คาบ</option>
                              <option value="4">4 คาบ</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}

                    {newSubjectData.schedules.length < 3 && (
                      <button
                        type="button"
                        onClick={handleAddScheduleSlot}
                        className={`w-full py-2.5 px-3 rounded-xl border border-dashed text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                          isDark
                            ? 'border-gray-700 text-gray-400 hover:border-red-500 hover:text-red-400 bg-gray-900/40'
                            : 'border-gray-300 text-gray-600 hover:border-red-500 hover:text-red-600 bg-gray-50'
                        }`}
                      >
                        <Plus size={14} />
                        <span>เพิ่มวันที่สอนอีก (สูงสุด 3 วัน)</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="flex gap-3 mt-5 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowAddSubjectModal(false)}
                    disabled={isSavingSubject}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
                      isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    ยกเลิก
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleAddSubject}
                    disabled={isSavingSubject}
                    className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-md shadow-red-500/20 transition-all disabled:opacity-50"
                  >
                    {isSavingSubject && <Loader2 size={16} className="animate-spin" />}
                    {isSavingSubject ? 'กำลังบันทึก...' : 'บันทึกวิชาเรียน'}
                  </motion.button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Delete Subject Confirmation Modal */}
        <AnimatePresence>
          {showDeleteSubjectConfirm && subjectToDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`w-full max-w-md rounded-3xl p-6 shadow-2xl ${isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}`}
              >
                <div className="flex items-center gap-3 mb-4 text-red-500">
                  <div className="p-3 rounded-2xl bg-red-500/10">
                    <Trash2 size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">ยืนยันการลบวิชาเรียน</h3>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
                  </div>
                </div>

                <div className={`p-4 rounded-2xl mb-4 ${isDark ? 'bg-gray-900/60' : 'bg-gray-50'}`}>
                  <p className="font-bold text-base mb-1">{subjectToDelete.subjectName}</p>
                  <p className="text-sm opacity-70">ห้อง: {subjectToDelete.classroom}</p>
                  {subjectToDelete.day && <p className="text-xs opacity-60 mt-1">วัน/เวลา: {subjectToDelete.day} {subjectToDelete.time}</p>}
                </div>

                <p className={`text-xs leading-relaxed mb-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  ⚠️ การลบวิชานี้จะลบข้อมูลที่เกี่ยวข้องทั้งหมด เช่น บันทึกคะแนน เช็คชื่อ และการบ้าน จากฐานข้อมูลหลักของโรงเรียนโดยอัตโนมัติ
                </p>

                <div className="flex gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setShowDeleteSubjectConfirm(false);
                      setSubjectToDelete(null);
                    }}
                    disabled={isDeletingSubject}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
                      isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    ยกเลิก
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={confirmDeleteSubject}
                    disabled={isDeletingSubject}
                    className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-md shadow-red-500/20 transition-all disabled:opacity-50"
                  >
                    {isDeletingSubject && <Loader2 size={16} className="animate-spin" />}
                    {isDeletingSubject ? 'กำลังลบ...' : 'ยืนยันการลบ'}
                  </motion.button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
