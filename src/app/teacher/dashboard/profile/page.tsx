'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService, SubjectData, StudentData, ScheduleSlot, TeacherFirebaseConfig } from '@/services/school-database.service';
import { teacherDatabaseService, normalizeFirebaseConfig } from '@/services/teacher-database.service';
import { firestoreService } from '@/services/firestore.service';
import { firebaseManager } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import type { FirebaseConfig } from '@/types/firebase.types';
import { Edit, Save, X, Settings, Files, Eye, EyeOff, AlertTriangle, Loader2, BookOpen, Plus, Trash2, Clock, Calendar, Users, GraduationCap, ChevronRight, Search, CheckSquare, Square, Pencil } from 'lucide-react';
import { GoogleBasicSubjectIcon, GoogleElectiveSubjectIcon } from '@/components/GoogleSubjectIcons';
import { useTheme } from '@/contexts/ThemeContext';
import Modal from '@/components/Modal';
import Avatar from '@/components/Avatar';
import { googlePhotoURL } from '@/lib/google-photo';
import { buildHueMap, hueVars } from '@/lib/timetable';

function emptySubjectForm(): {
  subjectName: string;
  subjectCode: string;
  subjectType: 'basic' | 'elective';
  classroom: string;
  room: string;
  studentIds: string[];
  schedules: ScheduleSlot[];
} {
  return {
    subjectName: '',
    subjectCode: '',
    subjectType: 'basic',
    classroom: '',
    room: '',
    studentIds: [],
    schedules: [{ day: 'จันทร์', time: '08:30-09:30', duration: '1' }],
  };
}

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
  const [newSubjectData, setNewSubjectData] = useState(emptySubjectForm);
  // Edit mode of the subject form, the subject menu (right-click / long press) and the removal warning
  const [editingSubject, setEditingSubject] = useState<SubjectData | null>(null);
  const [subjectMenu, setSubjectMenu] = useState<{ subject: SubjectData; x: number; y: number } | null>(null);
  const [removalConfirm, setRemovalConfirm] = useState<{ count: number } | null>(null);
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);

  const [formData, setFormData] = useState({ name: '', defaultRoom: '' });
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
      setFormData(prev => ({ ...prev, name: userAccount.name || '' }));
    }
  }, [userAccount]);

  useEffect(() => {
    setFormData(prev => ({ ...prev, defaultRoom: teacherConfig?.defaultRoom || '' }));
  }, [teacherConfig]);

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

  const loadTeacherSubjects = useCallback(async () => {
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
  }, [userAccount]);

  useEffect(() => {
    loadTeacherSubjects();
  }, [loadTeacherSubjects]);

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

  /** Student IDs a subject teaches: the whole classroom for basic subjects, the chosen list for electives. */
  const rosterOf = (sub: { subjectType?: string; classroom: string; studentIds?: string[] }) =>
    sub.subjectType === 'elective'
      ? sub.studentIds || []
      : allStudents.filter(st => st.class === sub.classroom).map(st => st.studentId);

  const openSubjectEditor = (sub: SubjectData | null) => {
    setSubjectMenu(null);
    setEditingSubject(sub);
    setNewSubjectData(sub ? {
      subjectName: sub.subjectName,
      subjectCode: sub.subjectCode || '',
      subjectType: sub.subjectType || 'basic',
      classroom: sub.classroom,
      room: sub.room || '',
      studentIds: sub.studentIds || [],
      schedules: sub.schedules && sub.schedules.length > 0
        ? sub.schedules.map(sc => ({ ...sc }))
        : [{ day: sub.day || 'จันทร์', time: sub.time || '08:30-09:30', duration: sub.duration || '1' }],
    } : emptySubjectForm());
    setShowAddSubjectModal(true);
  };

  const closeSubjectEditor = () => {
    setShowAddSubjectModal(false);
    setEditingSubject(null);
    setRemovalConfirm(null);
    setStudentSearchQuery('');
    setStudentClassFilter('all');
    setNewSubjectData(emptySubjectForm());
  };

  // Right-click (mouse) or press-and-hold (touch) on a subject opens its menu
  const openSubjectMenu = (subject: SubjectData, x: number, y: number) => {
    setSubjectMenu({ subject, x: Math.min(x, window.innerWidth - 216), y: Math.min(y, window.innerHeight - 120) });
  };
  const startLongPress = (e: React.PointerEvent, subject: SubjectData) => {
    if (e.pointerType === 'mouse') return;
    const { clientX: x, clientY: y } = e;
    longPress.current = { x, y, timer: setTimeout(() => { longPress.current = null; openSubjectMenu(subject, x, y); }, 500) };
  };
  const cancelLongPress = (e?: React.PointerEvent) => {
    const lp = longPress.current;
    if (!lp) return;
    if (e?.type === 'pointermove' && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) < 8) return;
    clearTimeout(lp.timer);
    longPress.current = null;
  };

  const handleAddSubject = async (confirmedRemoval = false) => {
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
      const fields = {
        subjectName: newSubjectData.subjectName.trim(),
        subjectCode: newSubjectData.subjectCode.trim(),
        subjectType: newSubjectData.subjectType,
        classroom: finalClassroom,
        room: newSubjectData.room.trim(),
        day: primarySlot.day || 'จันทร์',
        time: primarySlot.time || '08:30-09:30',
        duration: primarySlot.duration || '1',
        schedules: newSubjectData.schedules,
        studentIds: newSubjectData.subjectType === 'elective' ? newSubjectData.studentIds : [],
      };

      if (editingSubject) {
        // Students who leave the subject (room change or removed from an elective) lose its data
        const after = new Set(rosterOf(fields));
        const removed = rosterOf(editingSubject).filter(id => !after.has(id));
        const dataConfig = teacherConfig?.firebaseConfig || userAccount.schoolFirebaseConfig;
        if (removed.length > 0) {
          if (!confirmedRemoval) {
            const hasData = await teacherDatabaseService.subjectHasData(dataConfig, editingSubject.subjectId).catch(() => true);
            if (hasData) {
              setRemovalConfirm({ count: removed.length });
              return;
            }
          }
          await teacherDatabaseService.deleteSubjectStudentData(dataConfig, editingSubject.subjectId, removed);
        }
        await schoolDatabaseService.updateSubject(userAccount.schoolFirebaseConfig, editingSubject.subjectId, fields);
      } else {
        await schoolDatabaseService.addSubject(userAccount.schoolFirebaseConfig, {
          subjectId: `SUB${Date.now()}`,
          teacherId: userAccount.userId,
          ...fields,
        });
      }
      invalidateCache();
      await loadTeacherSubjects();
      closeSubjectEditor();
    } catch (error) {
      console.error('Error saving subject:', error);
      alert(editingSubject ? 'ไม่สามารถบันทึกการแก้ไขได้' : 'ไม่สามารถเพิ่มวิชาเรียนได้');
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

  const handleSave = async () => {
    if (userAccount) {
      setUserAccount({ ...userAccount, name: formData.name });
      const room = formData.defaultRoom.trim();
      if (room !== (teacherConfig?.defaultRoom || '')) {
        try {
          await schoolDatabaseService.updateTeacherDefaultRoom(userAccount.schoolFirebaseConfig, userAccount.userId, room);
          setTeacherConfig(prev => (prev ? { ...prev, defaultRoom: room } : prev));
        } catch (error) {
          console.error('Error saving default room:', error);
          alert('บันทึกห้องประจำไม่สำเร็จ ลองอีกครั้ง');
          return;
        }
      }
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData({ name: userAccount?.name || '', defaultRoom: teacherConfig?.defaultRoom || '' });
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
  const subjectHues = buildHueMap(teacherSubjects);
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
    <div className="px-4 pb-32 pt-2 text-gray-900 sm:px-6 dark:text-gray-50">
      <div className="mx-auto max-w-3xl space-y-8">

        {/* Identity */}
        <section className="rounded-2xl bg-surface p-5 shadow-neu-lg sm:p-6">
          <div className="flex items-start gap-4">
            <Avatar src={googlePhotoURL(user)} name={userAccount?.name} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-bold leading-tight">{userAccount?.name || '-'}</h1>
              <p className="truncate text-sm text-gray-500 dark:text-gray-400">{userAccount?.email || '-'}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-red-700 dark:text-red-300">
                  {userAccount?.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ครู'}
                </span>
                {userAccount?.userId && (
                  <span className="rounded-full bg-gray-500/10 px-2.5 py-0.5 font-mono text-gray-600 dark:text-gray-300">{userAccount.userId}</span>
                )}
              </div>
            </div>
            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                aria-label="แก้ไขข้อมูลส่วนตัว"
                className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-surface text-gray-700 shadow-neu-sm active:shadow-neu-in-sm dark:text-gray-200"
              >
                <Pencil size={18} />
              </button>
            )}
          </div>

          <AnimatePresence initial={false}>
            {isEditing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="profile-name" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">ชื่อ</label>
                    <input
                      id="profile-name"
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="h-12 w-full rounded-xl border border-transparent bg-surface px-4 text-gray-900 shadow-neu-in-sm outline-none focus:border-red-400 dark:text-gray-50"
                    />
                  </div>
                  <div>
                    <label htmlFor="default-room" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">ห้องประจำ</label>
                    <input
                      id="default-room"
                      type="text"
                      value={formData.defaultRoom}
                      placeholder="เช่น 204, ห้องภาษา 2"
                      onChange={(e) => setFormData({ ...formData, defaultRoom: e.target.value })}
                      className="h-12 w-full rounded-xl border border-transparent bg-surface px-4 text-gray-900 shadow-neu-in-sm outline-none focus:border-red-400 dark:text-gray-50"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">วิชาที่ไม่ได้ตั้งห้องที่สอนจะใช้ห้องนี้ นักเรียนจะเห็นห้องนี้ในตารางเรียน</p>
                  </div>
                  {userAccount?.role === 'admin' && (
                    <div>
                      <label htmlFor="link-teacher" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">เลขประจำตัวครู (ผูกบัญชีนี้กับข้อมูลครู)</label>
                      <select
                        id="link-teacher"
                        value={selectedTeacherId || userAccount?.userId || ''}
                        onChange={(e) => setSelectedTeacherId(e.target.value)}
                        className="h-12 w-full rounded-xl border border-transparent bg-surface px-3 text-gray-900 shadow-neu-in-sm outline-none focus:border-red-400 dark:text-gray-50"
                      >
                        <option value="">-- เลือกเลขประจำตัวครู --</option>
                        {availableTeachers.map((teacher) => (
                          <option key={teacher.teacherId} value={teacher.teacherId}>
                            {teacher.name} ({teacher.teacherId})
                          </option>
                        ))}
                      </select>
                      {selectedTeacherId && selectedTeacherId !== userAccount?.userId && (
                        <button
                          type="button"
                          onClick={handleLinkTeacher}
                          className="mt-2 h-11 w-full rounded-xl bg-surface text-sm font-semibold text-red-700 shadow-neu-sm active:shadow-neu-in-sm dark:text-red-400"
                        >
                          ผูกบัญชีกับ {selectedTeacherId}
                        </button>
                      )}
                    </div>
                  )}
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-surface font-semibold text-gray-700 shadow-neu-sm active:shadow-neu-in-sm dark:text-gray-200"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 font-semibold text-white shadow-neu-sm active:bg-red-700"
                    >
                      <Save size={18} />
                      บันทึก
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Teaching */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">การสอน</h2>
          <button
            type="button"
            onClick={() => setShowManageSubjectsModal(true)}
            className="w-full rounded-2xl bg-surface p-5 text-left shadow-neu-lg transition-shadow active:shadow-neu-in-sm"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-red-600 shadow-neu-in-sm dark:text-red-400">
                <BookOpen size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold leading-tight">วิชาที่สอน</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {loadingSubjects && teacherSubjects.length === 0
                    ? 'กำลังโหลด…'
                    : `${new Set(teacherSubjects.map(s => s.subjectName)).size} วิชา · ${teacherSubjects.length} ห้อง · ห้องประจำ ${teacherConfig?.defaultRoom || '–'}`}
                </div>
              </div>
              <span className="flex-none text-sm font-semibold text-red-700 dark:text-red-400">จัดการ</span>
              <ChevronRight size={18} className="flex-none text-gray-400" />
            </div>
            {teacherSubjects.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {Array.from(subjectHues.entries()).map(([name, hue]) => (
                  <span
                    key={name}
                    style={hueVars(hue, isDark)}
                    className="timetable-block rounded-lg py-1 pl-3 pr-2.5 text-sm font-semibold text-[var(--st)]"
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}
          </button>
        </section>

        {/* Account and system */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">บัญชีและระบบ</h2>
          <div className="divide-y divide-gray-300/50 overflow-hidden rounded-2xl bg-surface shadow-neu-lg dark:divide-white/5">
            {userAccount?.schoolId && (
              <button type="button" onClick={handleCopySchoolId} className="flex w-full items-center gap-3 p-4 text-left active:bg-black/5 dark:active:bg-white/5">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl shadow-neu-in-sm"><Files size={18} /></span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">School ID</div>
                  <div className="truncate font-mono text-sm text-gray-500 dark:text-gray-400">{userAccount.schoolId}</div>
                </div>
                <span className="flex-none text-sm font-semibold text-gray-500 dark:text-gray-400">{copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => { setShowConfigPopup(true); setShowConfigValues(false); setIsEditingConfig(false); resetConfigForm(); }}
              className="flex w-full items-center gap-3 p-4 text-left active:bg-black/5 dark:active:bg-white/5"
            >
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl shadow-neu-in-sm"><Settings size={18} /></span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">ฐานข้อมูลครู</div>
                <div className="truncate text-sm text-gray-500 dark:text-gray-400">
                  {!teacherConfig
                    ? 'ยังไม่ได้ผูกบัญชีกับข้อมูลครู'
                    : currentTeacherDbConfig
                      ? <span className="font-mono">{currentTeacherDbConfig.projectId}</span>
                      : 'ใช้ฐานข้อมูลของโรงเรียน'}
                </div>
              </div>
              <ChevronRight size={18} className="flex-none text-gray-400" />
            </button>
          </div>
        </section>

        {/* Link Teacher Confirmation Dialog */}
        <Modal open={showLinkConfirm} onClose={() => setShowLinkConfirm(false)} dismissible={!linkLoading}>
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
                  className={`flex-1 py-3 rounded-xl ${isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'}`}
                >
                  ยกเลิก
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={confirmLinkTeacher}
                  disabled={linkLoading}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl flex items-center justify-center gap-2 shadow-neu-sm transition-all"
                >
                  {linkLoading && <Loader2 size={16} className="animate-spin" />}
                  ยืนยัน
                </motion.button>
              </div>
        </Modal>

        {/* Firebase Config Popup */}
        <Modal open={showConfigPopup} onClose={() => setShowConfigPopup(false)} dismissible={!isEditingConfig} size="lg">
                <div className="flex items-center justify-between mb-4">
                  <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Firebase Config
                  </h2>
                  <div className="flex gap-2">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setShowConfigValues(!showConfigValues)}
                      className={`p-2 rounded-lg ${isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'}`}
                    >
                      {showConfigValues ? <EyeOff size={16} /> : <Eye size={16} />}
                    </motion.button>
                    {!isEditingConfig && teacherConfig && (
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => { setIsEditingConfig(true); setConfigError(''); setValidatedConfigKey(null); }}
                        className={`p-2 rounded-lg ${isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'}`}
                      >
                        <Edit size={16} />
                      </motion.button>
                    )}
                    {!isEditingConfig && (
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setShowConfigPopup(false)}
                        className={`p-2 rounded-lg ${isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'}`}
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

                <div className={`p-4 rounded-xl border-2 ${isEditingConfig ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-transparent shadow-neu-in-sm'}`}>
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
                            className={`w-full mt-1 p-2 rounded-lg border text-sm font-mono ${isDark ? 'bg-surface border-red-700 text-white' : 'bg-surface border-red-300 text-gray-900'} shadow-neu-in-xs`}
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
                        className={`flex-1 p-2 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-50 shadow-neu-sm ${isDark ? 'bg-gray-100 text-gray-900' : 'bg-gray-800 text-white'}`}
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
                      className={`w-full p-2 rounded-lg text-sm flex items-center justify-center gap-2 ${isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'}`}
                    >
                      <X size={16} />
                      ยกเลิก
                    </motion.button>
                  </div>
                )}
        </Modal>

        {/* Firebase Config Save Confirmation Dialog */}
        <Modal open={showConfigConfirm} onClose={() => { setShowConfigConfirm(false); setConfigConfirmText(''); setConfigError(''); }} dismissible={!configSaving}>
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
                className={`w-full p-2 rounded-lg border ${isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-900'}`}
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
                  className={`flex-1 py-3 rounded-xl ${isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'}`}
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
        </Modal>

        {/* Manage Subjects Modal */}
        <Modal open={showManageSubjectsModal} onClose={() => setShowManageSubjectsModal(false)} size="2xl" className="flex flex-col p-6">
                {/* Modal Header */}
                <div className="pb-3 border-b border-gray-300/60 dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl sm:text-2xl font-bold">วิชาที่สอน</h3>
                    <div className="flex items-center gap-2">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => openSubjectEditor(null)}
                        title="เพิ่มวิชา"
                        className="p-2 sm:p-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white shadow-neu-sm transition-all flex items-center justify-center"
                      >
                        <Plus size={20} />
                      </motion.button>
                      <button 
                        onClick={() => setShowManageSubjectsModal(false)}
                        title="ปิด"
                        className={`p-2 sm:p-2.5 rounded-xl transition-colors ${isDark ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-black/5 text-gray-500'}`}
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>
                  <p className={`text-xs sm:text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    มีทั้งหมด {teacherSubjects.length} วิชา · กดค้างหรือคลิกขวาที่วิชาเพื่อแก้ไขหรือลบ
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
                    <div className={`p-10 text-center rounded-2xl shadow-neu-in-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      <BookOpen size={40} className="mx-auto mb-2 opacity-40" />
                      <p className="font-semibold text-base">ยังไม่มีวิชาเรียนที่สอน</p>
                      <p className="text-xs opacity-70 mt-1 mb-4">กดปุ่ม &quot;+&quot; ด้านบนเพื่อเพิ่มวิชาเรียนใหม่</p>
                      <button
                        onClick={() => openSubjectEditor(null)}
                        className="px-4 py-2 rounded-xl bg-red-500 text-white font-medium text-sm inline-flex items-center gap-1.5 shadow-neu-sm"
                      >
                        <Plus size={16} />
                        เพิ่มวิชาเรียนแรก
                      </button>
                    </div>
                  ) : (
                    <div className={`rounded-2xl bg-surface shadow-neu overflow-hidden divide-y ${isDark ? 'divide-white/5' : 'divide-gray-300/50'}`}>
                    {teacherSubjects.map((sub) => {
                      const isElective = sub.subjectType === 'elective';
                      const studentCount = isElective && Array.isArray(sub.studentIds) ? sub.studentIds.length : null;

                      return (
                        <div
                          key={sub.subjectId}
                          tabIndex={0}
                          aria-haspopup="menu"
                          aria-label={`${sub.subjectName} ${sub.classroom} กดค้างหรือคลิกขวาเพื่อแก้ไขหรือลบ`}
                          onContextMenu={(e) => { e.preventDefault(); openSubjectMenu(sub, e.clientX, e.clientY); }}
                          onPointerDown={(e) => startLongPress(e, sub)}
                          onPointerMove={cancelLongPress}
                          onPointerUp={() => cancelLongPress()}
                          onPointerCancel={() => cancelLongPress()}
                          onKeyDown={(e) => {
                            if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                              e.preventDefault();
                              const r = e.currentTarget.getBoundingClientRect();
                              openSubjectMenu(sub, r.right - 216, r.bottom);
                            }
                          }}
                          style={{ WebkitTouchCallout: 'none' }}
                          className={`p-4 flex items-center justify-between gap-3 select-none cursor-context-menu outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                            subjectMenu?.subject.subjectId === sub.subjectId
                              ? 'shadow-neu-in-sm'
                              : isDark ? 'hover:bg-white/5' : 'hover:bg-black/5'
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
                              {sub.subjectCode && <span>• {sub.subjectCode}</span>}
                              <span>• สอนที่ {sub.room || (teacherConfig?.defaultRoom ? `${teacherConfig.defaultRoom} (ห้องประจำ)` : '-')}</span>
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

                        </div>
                      );
                    })}
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="pt-3 border-t border-gray-300/60 dark:border-white/10 text-right">
                  <button
                    onClick={() => setShowManageSubjectsModal(false)}
                    className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                      isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-200' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'
                    }`}
                  >
                    ปิด
                  </button>
                </div>
        </Modal>

        {/* Subject menu (right-click / long press) */}
        <AnimatePresence>
          {subjectMenu && (
            <>
              <div className="fixed inset-0 z-[110]" onPointerDown={() => setSubjectMenu(null)} />
              <motion.div
                role="menu"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.16 }}
                style={{ left: Math.max(8, subjectMenu.x), top: subjectMenu.y }}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setSubjectMenu(null); } }}
                className={`fixed z-[111] w-52 rounded-2xl p-1.5 bg-surface shadow-neu-lg origin-top-left ${isDark ? 'text-white' : 'text-gray-900'}`}
              >
                <button
                  role="menuitem"
                  autoFocus
                  onClick={() => openSubjectEditor(subjectMenu.subject)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 h-11 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/5`}
                >
                  <Pencil size={18} /> แก้ไข
                </button>
                <button
                  role="menuitem"
                  onClick={() => { setSubjectToDelete(subjectMenu.subject); setShowDeleteSubjectConfirm(true); setSubjectMenu(null); }}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 h-11 text-sm font-semibold ${isDark ? 'text-red-400 hover:bg-white/5' : 'text-red-700 hover:bg-red-50'}`}
                >
                  <Trash2 size={18} /> ลบวิชา
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Add Subject Modal */}
        <Modal open={showAddSubjectModal} onClose={closeSubjectEditor} size="lg" closeOnBackdrop={false} className="flex flex-col p-6">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-300/60 dark:border-white/10">
                  <div className="flex items-center gap-2">
                    <div className={`p-2.5 rounded-xl ${isDark ? 'bg-red-950/40 text-red-400' : 'bg-red-50 text-red-600'}`}>
                      <BookOpen size={22} />
                    </div>
                    <h3 className="text-xl font-bold">{editingSubject ? 'แก้ไขวิชาเรียน' : 'เพิ่มวิชาเรียนใหม่'}</h3>
                  </div>
                  <button 
                    onClick={closeSubjectEditor}
                    className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-black/5 text-gray-500'}`}
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
                        isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-900'
                      }`}
                    />
                  </div>

                  {/* Subject code */}
                  <div>
                    <label htmlFor="subject-code" className={`text-xs font-semibold block mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      รหัสวิชา
                    </label>
                    <input
                      id="subject-code"
                      type="text"
                      placeholder="เช่น อ31101"
                      value={newSubjectData.subjectCode}
                      onChange={(e) => setNewSubjectData({ ...newSubjectData, subjectCode: e.target.value })}
                      className={`w-full p-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-red-500 ${
                        isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-900'
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
                              ? 'border-blue-500 bg-blue-950/40 text-blue-300 font-bold shadow-neu-in-sm'
                              : 'border-blue-500 bg-blue-50 text-blue-700 font-bold shadow-neu-in-sm'
                            : isDark
                              ? 'border-transparent bg-surface shadow-neu-sm text-gray-400'
                              : 'border-transparent bg-surface shadow-neu-sm text-gray-600'
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
                              ? 'border-amber-500 bg-amber-950/40 text-amber-300 font-bold shadow-neu-in-sm'
                              : 'border-amber-500 bg-amber-50 text-amber-800 font-bold shadow-neu-in-sm'
                            : isDark
                              ? 'border-transparent bg-surface shadow-neu-sm text-gray-400'
                              : 'border-transparent bg-surface shadow-neu-sm text-gray-600'
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
                          isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-900'
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
                          isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-900'
                        }`}
                      />
                    </div>
                  )}

                  {/* Teaching room (empty = the teacher's default room) */}
                  <div>
                    <label htmlFor="subject-room" className={`text-xs font-semibold block mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      ห้องที่สอน
                    </label>
                    <input
                      id="subject-room"
                      type="text"
                      placeholder={teacherConfig?.defaultRoom ? `ใช้ห้องประจำ (${teacherConfig.defaultRoom})` : 'เช่น 204, แล็บ 2'}
                      value={newSubjectData.room}
                      onChange={(e) => setNewSubjectData({ ...newSubjectData, room: e.target.value })}
                      className={`w-full p-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-red-500 ${
                        isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-900'
                      }`}
                    />
                    <p className={`mt-1 text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>เว้นว่างไว้เพื่อใช้ห้องประจำจากข้อมูลส่วนตัว</p>
                  </div>

                  {/* Elective Student Selector: Cross-Classroom Support */}
                  {newSubjectData.subjectType === 'elective' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className={`p-3.5 rounded-2xl border border-transparent bg-surface shadow-neu-in-sm`}
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
                              isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-900'
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
                              isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-900'
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
                                    : isDark ? 'hover:bg-white/5' : 'hover:bg-black/5'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleStudentSelection(student.studentId)}
                                  className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
                                />
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                  isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'
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
                  <div className="space-y-3 pt-2 border-t border-gray-300/60 dark:border-white/10">
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
                        className={`p-3.5 rounded-2xl border transition-all border-transparent bg-surface shadow-neu-in-sm`}
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
                                isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-900'
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
                                isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-900'
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
                                isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-900'
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
                            ? 'border-gray-600 text-gray-400 hover:border-red-500 hover:text-red-400'
                            : 'border-gray-400 text-gray-600 hover:border-red-500 hover:text-red-700'
                        }`}
                      >
                        <Plus size={14} />
                        <span>เพิ่มวันที่สอนอีก (สูงสุด 3 วัน)</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="flex gap-3 mt-5 pt-3 border-t border-gray-300/60 dark:border-white/10">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={closeSubjectEditor}
                    disabled={isSavingSubject}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
                      isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'
                    }`}
                  >
                    ยกเลิก
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleAddSubject()}
                    disabled={isSavingSubject}
                    className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-neu-sm transition-all disabled:opacity-50"
                  >
                    {isSavingSubject && <Loader2 size={16} className="animate-spin" />}
                    {isSavingSubject ? 'กำลังบันทึก...' : editingSubject ? 'บันทึกการแก้ไข' : 'บันทึกวิชาเรียน'}
                  </motion.button>
                </div>
        </Modal>

        {/* Students leaving an edited subject lose its data: confirm first */}
        <Modal open={!!removalConfirm} onClose={() => setRemovalConfirm(null)} labelledBy="removal-title">
          {removalConfirm && (<>
                <h3 id="removal-title" className="text-lg font-bold mb-2">นักเรียน {removalConfirm.count} คนจะไม่อยู่ในวิชานี้แล้ว</h3>
                <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  ข้อมูลการเช็คชื่อและคะแนนของนักเรียนกลุ่มนี้ในวิชา {editingSubject?.subjectName} จะถูกลบถาวร และย้อนกลับไม่ได้
                </p>
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setRemovalConfirm(null)}
                    disabled={isSavingSubject}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold ${isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-200' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'}`}
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={async () => { await handleAddSubject(true); setRemovalConfirm(null); }}
                    disabled={isSavingSubject}
                    className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSavingSubject && <Loader2 size={16} className="animate-spin" />}
                    ลบข้อมูลและบันทึก
                  </button>
                </div>
          </>)}
        </Modal>

        {/* Delete Subject Confirmation Modal */}
        <Modal open={showDeleteSubjectConfirm && !!subjectToDelete} onClose={() => { setShowDeleteSubjectConfirm(false); setSubjectToDelete(null); }} dismissible={!isDeletingSubject}>
          {subjectToDelete && (<>
                <div className="flex items-center gap-3 mb-4 text-red-500">
                  <div className="p-3 rounded-2xl bg-red-500/10">
                    <Trash2 size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">ยืนยันการลบวิชาเรียน</h3>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
                  </div>
                </div>

                <div className={`p-4 rounded-2xl mb-4 shadow-neu-in-sm`}>
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
                      isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'
                    }`}
                  >
                    ยกเลิก
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={confirmDeleteSubject}
                    disabled={isDeletingSubject}
                    className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-neu-sm transition-all disabled:opacity-50"
                  >
                    {isDeletingSubject && <Loader2 size={16} className="animate-spin" />}
                    {isDeletingSubject ? 'กำลังลบ...' : 'ยืนยันการลบ'}
                  </motion.button>
                </div>
          </>)}
        </Modal>

      </div>
    </div>
  );
}
