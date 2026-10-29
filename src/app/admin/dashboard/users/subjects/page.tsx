'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService, SubjectData, StudentData, ScheduleSlot, SubjectWhitelistRow } from '@/services/school-database.service';
import { teacherDatabaseService } from '@/services/teacher-database.service';
import { runPool } from '@/lib/firestore-helpers';
import { downloadSubjectSheet, parseSubjectRows } from '@/lib/subject-excel';
import UploadProgressModal, { UploadProgress } from '@/components/UploadProgressModal';
import { ActionButton, AdminPageHeader, Initial, RosterRow, SearchWell, SectionCard, SelectionBar, UploadButton } from '@/components/admin/AdminUI';
import { buildHueMap, hueColor } from '@/lib/timetable';
import * as XLSX from 'xlsx';
import { Download, Upload, Trash2, Plus, ArrowLeft, Search, BookOpen, Calendar, Clock, Loader2, X, ChevronRight, Pencil } from 'lucide-react';
import { GoogleBasicSubjectIcon, GoogleElectiveSubjectIcon } from '@/components/GoogleSubjectIcons';
import { useTheme } from '@/contexts/ThemeContext';
import Modal from '@/components/Modal';

function emptySubjectForm(teacherId = ''): {
  teacherId: string;
  subjectName: string;
  subjectCode: string;
  subjectType: 'basic' | 'elective';
  classroom: string;
  room: string;
  studentIds: string[];
  schedules: ScheduleSlot[];
} {
  return {
    teacherId,
    subjectName: '',
    subjectCode: '',
    subjectType: 'basic',
    classroom: '',
    room: '',
    studentIds: [],
    schedules: [{ day: 'จันทร์', time: '08:30-09:30', duration: '1' }],
  };
}

export default function SubjectsManagement() {
  const router = useRouter();
  const { userAccount, invalidateCache } = useAuth();
  const [subjects, setSubjects] = useState<SubjectData[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<StudentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [touchStartX, setTouchStartX] = useState(0);
  const { isDark } = useTheme();
  const [isSavingSubject, setIsSavingSubject] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState<string>('all');
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  // Upload waiting for confirmation because it adds or removes subjects
  const [pendingUpload, setPendingUpload] = useState<{
    rows: SubjectWhitelistRow[];
    toAdd: SubjectWhitelistRow[];
    toDelete: SubjectData[];
    updatedCount: number;
    /** Subjects with data whose classroom/students change in the file: those two fields are kept. */
    kept: SubjectData[];
    /** Electives the file leaves with no students. */
    emptyElectives: SubjectWhitelistRow[];
  } | null>(null);

  const [newSubject, setNewSubject] = useState(emptySubjectForm);
  // Detail popup, the subject being edited in the add/edit form, and the removal warning
  const [detailSubject, setDetailSubject] = useState<SubjectData | null>(null);
  const [editingSubject, setEditingSubject] = useState<SubjectData | null>(null);
  const [removalConfirm, setRemovalConfirm] = useState<{ count: number } | null>(null);

  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [teacherQuery, setTeacherQuery] = useState('');
  const [showTeacherDropdown, setShowTeacherDropdown] = useState(false);
  const lastLoadedConfigRef = useRef<string | null>(null);

  const loadData = useCallback(async (force = false) => {
    try {
      if (!userAccount?.schoolFirebaseConfig) return;
      const configKey = userAccount.schoolFirebaseConfig.projectId;
      if (!force && configKey === lastLoadedConfigRef.current) return;
      setLoading(true);
      const [subjectsData, teachersData, studentsData] = await Promise.all([
        schoolDatabaseService.getAllSubjects(userAccount.schoolFirebaseConfig),
        schoolDatabaseService.getAllTeachers(userAccount.schoolFirebaseConfig),
        schoolDatabaseService.getAllStudents(userAccount.schoolFirebaseConfig)
      ]);
      setSubjects(subjectsData);
      setTeachers(teachersData);
      setAllStudents(studentsData);
      lastLoadedConfigRef.current = configKey;
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [userAccount]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Available classrooms from student data
  const availableClassrooms = Array.from(new Set(allStudents.map(s => s.class)))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'th'));

  const handleAddScheduleSlot = () => {
    if (newSubject.schedules.length >= 3) return;
    const days = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
    const usedDays = newSubject.schedules.map(s => s.day);
    const nextDay = days.find(d => !usedDays.includes(d)) || 'อังคาร';
    setNewSubject(prev => ({
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
    if (newSubject.schedules.length <= 1) return;
    setNewSubject(prev => ({
      ...prev,
      schedules: prev.schedules.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateScheduleSlot = (index: number, field: keyof ScheduleSlot, value: string) => {
    setNewSubject(prev => ({
      ...prev,
      schedules: prev.schedules.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot))
    }));
  };

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

  const selectedStudentsForElective = allStudents.filter(s => newSubject.studentIds.includes(s.studentId));
  const detectedClassesForElective = Array.from(new Set(selectedStudentsForElective.map(s => s.class).filter(Boolean))).sort();

  const toggleStudentSelection = (studentId: string) => {
    setNewSubject(prev => {
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
    setNewSubject(prev => ({
      ...prev,
      studentIds: Array.from(new Set([...prev.studentIds, ...idsToAdd]))
    }));
  };

  const handleClearAllStudents = () => {
    setNewSubject(prev => ({
      ...prev,
      studentIds: []
    }));
  };

  const handleDownload = async () => {
    try {
      await downloadSubjectSheet(subjects);
    } catch (error) {
      console.error('Error downloading subjects:', error);
      alert('ดาวน์โหลดไฟล์ไม่สำเร็จ');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so choosing the same file again still triggers onChange
    e.target.value = '';
    if (!file) return;

    if (!userAccount?.schoolFirebaseConfig) {
      alert('ไม่พบ School Firebase Config');
      return;
    }

    setLoading(true);
    setUploadProgress({ title: 'กำลังอัพโหลดวิชาเรียน', label: 'กำลังอ่านไฟล์และตรวจสอบข้อมูล', step: 1, totalSteps: 2, done: 0, total: 0 });
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const headers = ((XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0] as unknown[]) || []).map(h => String(h ?? '').trim());
      const parsed = parseSubjectRows(headers, XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[]);

      // Subjects already in the system keep their subjectId, so their attendance, scores and
      // assignments (keyed by subjectId in the teacher DBs) stay attached. A row matches by its
      // system ID (รหัสอ้างอิงระบบ) first, so renamed subjects still match; otherwise by
      // teacher + subject name + classroom.
      const existingSubjects = await schoolDatabaseService.getAllSubjects(userAccount.schoolFirebaseConfig, true);
      const subjectKey = (teacherId: string, subjectName: string, classroom: string) =>
        `${teacherId.trim()}|${subjectName.trim()}|${classroom.trim()}`;
      const byId = new Map(existingSubjects.map(s => [s.subjectId, s]));
      const byKey = new Map<string, SubjectData[]>();
      for (const subject of existingSubjects) {
        const key = subjectKey(String(subject.teacherId ?? ''), String(subject.subjectName ?? ''), String(subject.classroom ?? ''));
        byKey.set(key, [...(byKey.get(key) || []), subject]);
      }
      const taken = new Set<string>();
      const take = (subject: SubjectData | undefined) => {
        if (!subject || taken.has(subject.subjectId)) return undefined;
        taken.add(subject.subjectId);
        return subject;
      };
      const takeMatch = (key: string) => take(byKey.get(key)?.find(s => !taken.has(s.subjectId)));

      const rows: SubjectWhitelistRow[] = [];
      const toAdd: SubjectWhitelistRow[] = [];
      const rosterChanges: { row: SubjectWhitelistRow; existing: SubjectData }[] = [];
      for (const r of parsed) {
        if (!r.teacherId || !r.subjectName) continue;

        const buildRow = (classroom: string, existing?: SubjectData): SubjectWhitelistRow => {
          // Replace "/" with "-" in classroom name for valid Firestore document ID, e.g. "ม.1/1" → "ม.1-1"
          const safeClassroom = classroom.replace(/\//g, '-');
          const first = r.schedules?.[0];
          const result: SubjectWhitelistRow = {
            subjectId: existing?.subjectId || `SUB${Date.now()}_${r.index}_${safeClassroom}`,
            teacherId: r.teacherId,
            subjectName: r.subjectName,
            classroom,
            day: first?.day ?? (r.schedules ? '' : existing?.day ?? ''),
            time: first?.time ?? (r.schedules ? '' : existing?.time ?? ''),
            duration: first?.duration ?? (r.schedules ? '1' : existing?.duration ?? '1'),
            subjectType: r.subjectType || (existing ? undefined : 'basic'),
          };
          if (r.subjectCode !== undefined) result.subjectCode = r.subjectCode;
          if (r.room !== undefined) result.room = r.room;
          if (r.schedules && !r.legacySlot) {
            result.schedules = r.schedules;
          } else if (r.legacySlot && first) {
            // Old one-slot file: screens read schedules before day/time, so keep the first slot in step
            const slots = existing?.schedules;
            if (slots && slots.length > 0) {
              const s0 = slots[0];
              if (s0.day !== first.day || s0.time !== first.time || (s0.duration || '1') !== first.duration) {
                result.schedules = [{ ...s0, ...first }, ...slots.slice(1)];
              }
            }
          }
          const type = r.subjectType || existing?.subjectType || 'basic';
          if (r.studentIds !== undefined && type === 'elective') result.studentIds = r.studentIds;
          return result;
        };

        const idMatch = take(r.subjectId ? byId.get(r.subjectId) : undefined);
        if (idMatch) {
          const built = buildRow(r.classroom || idMatch.classroom, idMatch);
          rows.push(built);
          const lostStudents = built.studentIds !== undefined && (idMatch.studentIds || []).some(id => !built.studentIds!.includes(id));
          if (built.classroom !== idMatch.classroom || lostStudents) rosterChanges.push({ row: built, existing: idMatch });
          continue;
        }

        // A downloaded file lists a multi-room subject (e.g. an elective) as one "ม.1/1, ม.1/2" cell
        const wholeMatch = r.classroom ? takeMatch(subjectKey(r.teacherId, r.subjectName, r.classroom)) : undefined;
        if (wholeMatch) {
          rows.push(buildRow(wholeMatch.classroom, wholeMatch));
          continue;
        }

        // Otherwise a comma-separated cell means one subject per classroom
        const classrooms = r.classroom.split(',').map(c => c.trim()).filter(c => c);
        classrooms.forEach(classroom => {
          const existing = takeMatch(subjectKey(r.teacherId, r.subjectName, classroom));
          const built = buildRow(existing?.classroom ?? classroom, existing);
          rows.push(built);
          if (!existing) toAdd.push(built);
        });
      }

      // Subjects that already have attendance or scores keep their classroom and students
      // (changing them would orphan that data); teachers change those from their subject menu.
      const kept: SubjectData[] = [];
      await runPool(rosterChanges, 5, async ({ row, existing }) => {
        const teacher = teachers.find(t => t.teacherId === existing.teacherId);
        const dataConfig = teacher?.firebaseConfig || userAccount.schoolFirebaseConfig;
        const hasData = await teacherDatabaseService.subjectHasData(dataConfig, existing.subjectId).catch(() => true);
        if (!hasData) return;
        row.classroom = existing.classroom;
        delete row.studentIds;
        kept.push(existing);
      });

      const toDelete = existingSubjects.filter(s => !taken.has(s.subjectId));
      const updatedCount = rows.length - toAdd.length;
      const emptyElectives = rows.filter(row => row.studentIds !== undefined && row.studentIds.length === 0);

      if (toAdd.length > 0 || toDelete.length > 0 || kept.length > 0 || emptyElectives.length > 0) {
        setPendingUpload({ rows, toAdd, toDelete, updatedCount, kept, emptyElectives });
        setUploadProgress(null);
        setLoading(false);
        return;
      }

      await runSubjectUpload(rows, []);
    } catch (error) {
      console.error('Error uploading subjects:', error);
      setUploadProgress(null);
      alert('ไม่สามารถอัพโหลดรายชื่อวิชาเรียนได้');
    } finally {
      setUploadProgress(null);
      setLoading(false);
    }
  };

  const confirmSubjectUpload = async () => {
    if (!pendingUpload) return;
    const { rows, toDelete } = pendingUpload;
    setPendingUpload(null);
    setLoading(true);
    try {
      await runSubjectUpload(rows, toDelete);
    } catch (error) {
      console.error('Error uploading subjects:', error);
      setUploadProgress(null);
      alert('ไม่สามารถอัพโหลดรายชื่อวิชาเรียนได้');
    } finally {
      setUploadProgress(null);
      setLoading(false);
    }
  };

  /** Delete subjects missing from the file (with their data), then save every row. */
  const runSubjectUpload = async (rows: SubjectWhitelistRow[], toDelete: SubjectData[]) => {
    if (!userAccount?.schoolFirebaseConfig) return;
    const schoolConfig = userAccount.schoolFirebaseConfig;
    const totalSteps = toDelete.length > 0 ? 2 : 1;
    const title = 'กำลังอัพโหลดวิชาเรียน';

    const failedSubjects: string[] = [];
    if (toDelete.length > 0) {
      let deleted = 0;
      setUploadProgress({ title, label: 'กำลังลบวิชาที่ไม่อยู่ในไฟล์', step: 1, totalSteps, done: 0, total: toDelete.length });
      await runPool(toDelete, 3, async subject => {
        const teacher = teachers.find(t => t.teacherId === subject.teacherId);
        try {
          await Promise.all([
            // Delete all subject related data from teacher's database
            teacher?.firebaseConfig
              ? teacherDatabaseService.deleteSubjectAllData(teacher.firebaseConfig, subject.subjectId, subject.classroom)
                .catch(error => console.error('Error deleting subject data from teacher database:', subject.subjectId, error))
              : Promise.resolve(),
            // Always delete all subject related data from school database (for admin teachers or as backup)
            schoolDatabaseService.deleteSubjectAllData(schoolConfig, subject.subjectId, subject.classroom)
              .catch(error => console.error('Error deleting subject data from school database:', subject.subjectId, error)),
          ]);
          // Delete subject from school database
          await schoolDatabaseService.deleteSubject(schoolConfig, subject.subjectId);
        } catch (error) {
          console.error('Error deleting subject:', subject.subjectId, error);
          failedSubjects.push(`${subject.subjectName} (${subject.classroom})`);
        }
        deleted++;
        setUploadProgress(p => p && { ...p, done: deleted });
      });
    }

    setUploadProgress({ title, label: 'กำลังบันทึกวิชาเรียน', step: totalSteps, totalSteps, done: 0, total: rows.length });
    await schoolDatabaseService.saveSubjectWhitelist(schoolConfig, rows, (done, total) => setUploadProgress(p => p && { ...p, done, total }));
    setUploadProgress(p => p && { ...p, label: 'กำลังโหลดรายการล่าสุด', done: 0, total: 0 });
    await loadData(true);
    invalidateCache();
    setUploadProgress(null);
    if (failedSubjects.length > 0) {
      alert(`ลบวิชาบางวิชาไม่สำเร็จ: ${failedSubjects.join(', ')}`);
    }
    alert('อัพโหลดรายชื่อวิชาเรียนสำเร็จ');
  };

  /** Students enrolled in a subject: its whole classroom, or an elective's listed students. */
  const rosterOf = (sub: { subjectType?: string; classroom: string; studentIds?: string[] }) =>
    sub.subjectType === 'elective'
      ? sub.studentIds || []
      : allStudents.filter(st => st.class === sub.classroom).map(st => st.studentId);

  const openSubjectEditor = (sub: SubjectData | null) => {
    setDetailSubject(null);
    setEditingSubject(sub);
    setStudentSearchQuery('');
    setStudentClassFilter('all');
    setNewSubject(sub ? {
      teacherId: sub.teacherId,
      subjectName: sub.subjectName,
      subjectCode: sub.subjectCode || '',
      subjectType: sub.subjectType === 'elective' ? 'elective' : 'basic',
      classroom: sub.classroom,
      room: sub.room || '',
      studentIds: sub.studentIds || [],
      schedules: sub.schedules?.length ? sub.schedules : [{ day: sub.day || 'จันทร์', time: sub.time || '08:30-09:30', duration: sub.duration || '1' }],
    } : emptySubjectForm(selectedTeacherId));
    setShowAddModal(true);
  };

  const closeSubjectEditor = () => {
    setShowAddModal(false);
    setEditingSubject(null);
  };

  const handleAddSubject = async (confirmedRemoval = false) => {
    if (!userAccount?.schoolFirebaseConfig) return;
    if (!newSubject.teacherId || !newSubject.subjectName.trim()) {
      alert('กรุณากรอกข้อมูลให้ครบ');
      return;
    }

    let finalClassroom = newSubject.classroom.trim();
    if (newSubject.subjectType === 'basic') {
      if (!finalClassroom) {
        alert('กรุณาเลือกห้องเรียน');
        return;
      }
    } else {
      if (newSubject.studentIds.length === 0) {
        alert('กรุณาเลือกนักเรียนที่เรียนในวิชาเพิ่มเติมอย่างน้อย 1 คน');
        return;
      }
      if (!finalClassroom) {
        finalClassroom = detectedClassesForElective.join(', ') || 'วิชาเพิ่มเติม';
      }
    }

    setIsSavingSubject(true);
    try {
      const primarySlot = newSubject.schedules[0] || { day: 'จันทร์', time: '08:30-09:30', duration: '1' };
      const fields = {
        subjectName: newSubject.subjectName.trim(),
        subjectCode: newSubject.subjectCode.trim(),
        subjectType: newSubject.subjectType,
        classroom: finalClassroom,
        room: newSubject.room.trim(),
        day: primarySlot.day || 'จันทร์',
        time: primarySlot.time || '08:30-09:30',
        duration: primarySlot.duration || '1',
        schedules: newSubject.schedules,
        studentIds: newSubject.subjectType === 'elective' ? newSubject.studentIds : [],
      };

      if (editingSubject) {
        // Students who leave the subject (room change or removed from an elective) lose its data
        const after = new Set(rosterOf(fields));
        const removed = rosterOf(editingSubject).filter(id => !after.has(id));
        const owner = teachers.find(t => t.teacherId === editingSubject.teacherId);
        const dataConfig = owner?.firebaseConfig || userAccount.schoolFirebaseConfig;
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
          teacherId: newSubject.teacherId,
          ...fields,
        } as SubjectData);
      }
      await loadData(true);
      invalidateCache();
      closeSubjectEditor();
      setNewSubject(emptySubjectForm());
    } catch (error) {
      console.error('Error saving subject:', error);
      alert(editingSubject ? 'ไม่สามารถบันทึกการแก้ไขได้' : 'ไม่สามารถเพิ่มวิชาเรียนได้');
    } finally {
      setIsSavingSubject(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedSubjects.size === 0) return;
    if (!userAccount?.schoolFirebaseConfig) return;

    if (!confirm(`ยืนยันการลบ ${selectedSubjects.size} วิชาเรียน? (รวมข้อมูลที่เกี่ยวข้องทั้งหมด เช่น คะแนน เช็คชื่อ การบ้าน ตารางเรียน สื่อการสอน)`)) return;

    setLoading(true);
    try {
      const subjectIdsArray = Array.from(selectedSubjects);
      for (const subjectId of subjectIdsArray) {
        const subject = subjects.find(s => s.subjectId === subjectId);
        if (subject) {
          // Delete all subject related data from teacher's database
          const teacher = teachers.find(t => t.teacherId === subject.teacherId);
          if (teacher?.firebaseConfig) {
            try {
              await teacherDatabaseService.deleteSubjectAllData(
                teacher.firebaseConfig,
                subject.subjectId,
                subject.classroom
              );
            } catch (error) {
              console.error('Error deleting subject data from teacher database:', subjectId, error);
            }
          }

          // Always delete all subject related data from school database (for admin teachers or as backup)
          try {
            await schoolDatabaseService.deleteSubjectAllData(
              userAccount.schoolFirebaseConfig,
              subject.subjectId,
              subject.classroom
            );
          } catch (error) {
            console.error('Error deleting subject data from school database:', subjectId, error);
          }

          // Delete subject from school database
          await schoolDatabaseService.deleteSubject(userAccount.schoolFirebaseConfig, subjectId);
        }
      }
      setSelectedSubjects(new Set());
      await loadData(true);
      invalidateCache();
      alert('ลบวิชาเรียนและข้อมูลที่เกี่ยวข้องทั้งหมดสำเร็จ');
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

  // Filter subjects by selected teacher
  const filteredSubjects = selectedTeacherId
    ? subjects.filter(s => s.teacherId === selectedTeacherId)
    : [];

  // Helper function to convert Thai day names to English 3-letter abbreviations
  const convertDayToEnglish = (day: string) => {
    const dayMap: { [key: string]: string } = {
      'จันทร์': 'Mon',
      'อังคาร': 'Tue',
      'พุธ': 'Wed',
      'พฤหัสบดี': 'Thu',
      'ศุกร์': 'Fri',
      'เสาร์': 'Sat',
      'อาทิตย์': 'Sun',
      'Mon': 'Mon',
      'Tue': 'Tue',
      'Wed': 'Wed',
      'Thu': 'Thu',
      'Fri': 'Fri',
      'Sat': 'Sat',
      'Sun': 'Sun'
    };
    return dayMap[day] || day;
  };

  const THAI_DAY_NAMES: Record<string, string> = {
    Mon: 'วันจันทร์', Tue: 'วันอังคาร', Wed: 'วันพุธ', Thu: 'วันพฤหัสบดี', Fri: 'วันศุกร์', Sat: 'วันเสาร์', Sun: 'วันอาทิตย์',
  };

  // Day order for sorting (Monday to Sunday)
  const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Group filtered subjects by day
  const groupedByDay = filteredSubjects.reduce((acc: any, subject: any) => {
    if (subject.schedules && subject.schedules.length > 0) {
      subject.schedules.forEach((sch: any) => {
        const day = sch.day || subject.day || 'ไม่ระบุวัน';
        if (!acc[day]) acc[day] = [];
        acc[day].push({ ...subject, day: sch.day, time: sch.time, duration: sch.duration || subject.duration });
      });
    } else {
      const day = subject.day || 'ไม่ระบุวัน';
      if (!acc[day]) acc[day] = [];
      acc[day].push(subject);
    }
    return acc;
  }, {});

  const handleTeacherSelect = (teacherId: string) => {
    setSelectedTeacherId(teacherId);
    setShowTeacherDropdown(false);
  };

  const selectedTeacher = teachers.find(t => t.teacherId === selectedTeacherId);
  const subjectHues = buildHueMap(filteredSubjects);

  // Get teacher name by ID
  const getTeacherName = (teacherId: string) => {
    const teacher = teachers.find(t => t.teacherId === teacherId);
    return teacher ? teacher.name : teacherId;
  };

  if (loading && subjects.length === 0 && !uploadProgress) {
    return (
      <div className="min-h-screen bg-surface px-4 pb-28 pt-2 text-gray-900 sm:px-6 dark:text-gray-50">
        <h1 className={`text-3xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-800'}`}>จัดการวิชาเรียน</h1>
        <div className="animate-pulse space-y-4">
          <div className={`h-12 rounded-2xl bg-surface shadow-neu-lg`} />
          <div className={`h-10 w-48 rounded-lg ${isDark ? 'bg-white/10' : 'bg-gray-300/60'}`} />
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`rounded-2xl p-4 bg-surface shadow-neu-lg`}>
              <div className="space-y-2">
                <div className={`h-4 w-40 rounded ${isDark ? 'bg-white/10' : 'bg-gray-300/60'}`} />
                <div className={`h-3 w-28 rounded ${isDark ? 'bg-white/10' : 'bg-gray-300/60'}`} />
                <div className={`h-3 w-20 rounded ${isDark ? 'bg-white/10' : 'bg-gray-300/60'}`} />
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
          title="วิชาเรียน"
          subtitle={`${subjects.length} วิชา · ครู ${teachers.length} คน`}
          onBack={() => (selectedTeacherId ? setSelectedTeacherId('') : router.push('/admin/dashboard'))}
          actions={<>
            <ActionButton icon={<Download size={18} />} label="ดาวน์โหลด" onClick={handleDownload} />
            <UploadButton icon={<Upload size={18} />} label="อัปโหลด" onChange={handleUpload} />
            <ActionButton icon={<Plus size={18} />} label="เพิ่มวิชา" onClick={() => openSubjectEditor(null)} primary />
          </>}
        />

        {!selectedTeacherId ? (
          <>
            <SearchWell value={teacherQuery} onChange={setTeacherQuery} placeholder="ค้นหาครู" />
            <SectionCard title="เลือกครูเพื่อดูวิชาที่สอน">
              {teachers.length === 0 ? (
                <p className="py-8 text-center text-gray-500 dark:text-gray-400">ยังไม่มีข้อมูลครู</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {teachers
                    .filter(t => !teacherQuery || `${t.name} ${t.teacherId}`.toLowerCase().includes(teacherQuery.toLowerCase()))
                    .map(teacher => {
                      const count = subjects.filter(s => s.teacherId === teacher.teacherId).length;
                      return (
                        <button
                          key={teacher.teacherId}
                          type="button"
                          onClick={() => handleTeacherSelect(teacher.teacherId)}
                          className="flex items-center gap-3 rounded-2xl bg-surface p-3 text-left shadow-neu-sm transition-shadow active:shadow-neu-in-sm"
                        >
                          <Initial name={teacher.name} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold">{teacher.name}</div>
                            <div className="truncate text-sm text-gray-500 dark:text-gray-400">{teacher.teacherId}</div>
                          </div>
                          <span className={`flex-none text-sm font-semibold tabular-nums ${count ? '' : 'text-gray-500 dark:text-gray-400'}`}>{count} วิชา</span>
                          <ChevronRight size={18} className="flex-none text-gray-400" />
                        </button>
                      );
                    })}
                </div>
              )}
            </SectionCard>
          </>
        ) : (
          <>
            <div className="mb-5 flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-neu-in-sm">
              {selectedTeacher && <Initial name={selectedTeacher.name} />}
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{selectedTeacher?.name ?? selectedTeacherId}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{filteredSubjects.length} วิชา · สอน {Object.keys(groupedByDay).length} วัน</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTeacherId('')}
                className="flex h-9 flex-none items-center rounded-xl bg-surface px-3 text-sm font-semibold text-gray-700 shadow-neu-sm active:shadow-neu-in-sm dark:text-gray-200"
              >
                เปลี่ยนครู
              </button>
            </div>

            {Object.keys(groupedByDay).length === 0 ? (
              <SectionCard>
                <p className="py-8 text-center text-gray-500 dark:text-gray-400">ยังไม่มีวิชาของครูท่านนี้</p>
              </SectionCard>
            ) : (
              <div className="space-y-5">
                {Object.keys(groupedByDay)
                  .sort((a, b) => dayOrder.indexOf(convertDayToEnglish(a)) - dayOrder.indexOf(convertDayToEnglish(b)))
                  .map(day => (
                    <SectionCard key={day} title={THAI_DAY_NAMES[convertDayToEnglish(day)] ?? day}>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {groupedByDay[day]
                          .sort((a: any, b: any) => (a.time.split('-')[0] || a.time).localeCompare(b.time.split('-')[0] || b.time))
                          .map((subject: any, index: number) => {
                            const isElective = subject.subjectType === 'elective';
                            const studentCount = isElective && Array.isArray(subject.studentIds) ? subject.studentIds.length : null;
                            return (
                              <RosterRow
                                key={`${subject.subjectId}-${index}`}
                                leading={<span aria-hidden className="h-10 w-1.5 flex-none rounded-full" style={{ background: hueColor(subjectHues.get(subject.subjectName) ?? 'blue') }} />}
                                title={<>{subject.subjectName}{subject.subjectCode && <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">{subject.subjectCode}</span>}</>}
                                meta={`ห้อง ${subject.classroom} · ${(subject.time || '').replace('-', '–')} · ${subject.duration || 1} ชม.`}
                                trailing={
                                  <span className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-semibold ${isElective ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-gray-500/10 text-gray-600 dark:text-gray-300'}`}>
                                    {isElective ? `เพิ่มเติม${studentCount !== null ? ` · ${studentCount} คน` : ''}` : 'พื้นฐาน'}
                                  </span>
                                }
                                selected={selectedSubjects.has(subject.subjectId)}
                                selecting={selectedSubjects.size > 0}
                                onOpen={() => setDetailSubject(subjects.find(s => s.subjectId === subject.subjectId) ?? subject)}
                                onToggle={() => toggleSubjectSelection(subject.subjectId)}
                                touch={{
                                  onTouchStart: () => handleSubjectTouchStart(subject.subjectId),
                                  onTouchEnd: handleSubjectTouchEnd,
                                  onTouchMove: handleSubjectTouchMove,
                                }}
                              />
                            );
                          })}
                      </div>
                    </SectionCard>
                  ))}
              </div>
            )}
          </>
        )}
      </div>

      <SelectionBar count={selectedSubjects.size} onDelete={handleDeleteSelected} onClear={() => setSelectedSubjects(new Set())} />

      <UploadProgressModal progress={uploadProgress} isDark={isDark} />

      {/* Upload Confirmation Dialog */}
      <Modal open={!!pendingUpload} onClose={() => setPendingUpload(null)} size="lg" closeOnBackdrop={false}>
        {pendingUpload && (<>
            <div className="mb-4">
              <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'} mb-2`}>
                ⚠️ ยืนยันการอัพโหลดวิชาเรียน
              </h3>
              <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                วิชาเดิม {pendingUpload.updatedCount} วิชาจะอัปเดตตามไฟล์ โดยข้อมูลเช็คชื่อและคะแนนยังอยู่ครบ
              </p>
            </div>

            {pendingUpload.kept.length > 0 && (
              <div className={`max-h-40 overflow-y-auto mb-4 rounded-2xl p-4 ${isDark ? 'bg-amber-900/30' : 'bg-amber-50'}`}>
                <p className={`text-sm mb-1 font-semibold ${isDark ? 'text-amber-200' : 'text-amber-800'}`}>
                  ข้ามการเปลี่ยนห้อง/นักเรียนของวิชาที่มีข้อมูลแล้ว {pendingUpload.kept.length} วิชา
                </p>
                <p className={`text-xs mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>ข้อมูลอื่นในแถวยังอัปเดตตามไฟล์ ครูเปลี่ยนห้องหรือนักเรียนได้จากเมนูวิชาที่สอน</p>
                {pendingUpload.kept.map((subject) => (
                  <div key={subject.subjectId} className={`py-0.5 text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    {subject.subjectName} - {subject.classroom} (ครู {subject.teacherId})
                  </div>
                ))}
              </div>
            )}

            {pendingUpload.emptyElectives.length > 0 && (
              <div className={`max-h-40 overflow-y-auto mb-4 rounded-2xl p-4 ${isDark ? 'bg-amber-900/30' : 'bg-amber-50'}`}>
                <p className={`text-sm mb-2 font-semibold ${isDark ? 'text-amber-200' : 'text-amber-800'}`}>
                  วิชาเพิ่มเติมที่จะไม่มีนักเรียน ({pendingUpload.emptyElectives.length} วิชา)
                </p>
                {pendingUpload.emptyElectives.map((subject) => (
                  <div key={subject.subjectId} className={`py-0.5 text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    {subject.subjectName} - {subject.classroom} (ครู {subject.teacherId})
                  </div>
                ))}
              </div>
            )}

            {pendingUpload.toDelete.length > 0 && (
              <div className={`max-h-40 overflow-y-auto mb-4 rounded-2xl p-4 ${isDark ? 'bg-red-900/30' : 'bg-red-50'}`}>
                <p className={`text-sm mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>วิชาที่ไม่อยู่ในไฟล์และจะถูกลบ ({pendingUpload.toDelete.length} วิชา):</p>
                <p className="text-sm font-semibold text-red-600 mb-2">
                  ข้อมูลเช็คชื่อ คะแนน และการบ้านของวิชาเหล่านี้จะถูกลบด้วย
                </p>
                {pendingUpload.toDelete.map((subject) => (
                  <div key={subject.subjectId} className="flex items-center gap-2 py-1">
                    <span className="text-red-500">🗑️</span>
                    <span className={isDark ? 'text-gray-200' : 'text-gray-800'}>
                      {subject.subjectName} - {subject.classroom} (ครู {subject.teacherId})
                    </span>
                  </div>
                ))}
              </div>
            )}

            {pendingUpload.toAdd.length > 0 && (
              <div className={`max-h-40 overflow-y-auto mb-4 rounded-2xl p-4 ${isDark ? 'bg-green-900/30' : 'bg-green-50'}`}>
                <p className={`text-sm mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>วิชาที่จะถูกเพิ่ม ({pendingUpload.toAdd.length} วิชา):</p>
                {pendingUpload.toAdd.map((subject) => (
                  <div key={subject.subjectId} className="flex items-center gap-2 py-1">
                    <span className="text-green-500">➕</span>
                    <span className={isDark ? 'text-gray-200' : 'text-gray-800'}>
                      {subject.subjectName} - {subject.classroom} (ครู {subject.teacherId})
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setPendingUpload(null)}
                className={`flex-1 py-3 rounded-xl ${isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'}`}
              >
                ยกเลิก
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={confirmSubjectUpload}
                className={`flex-1 text-white py-3 rounded-xl ${pendingUpload.toDelete.length > 0 ? 'bg-red-500' : 'bg-blue-500'}`}
              >
                ยืนยันและอัพโหลด
              </motion.button>
            </div>
        </>)}
      </Modal>

      {/* Subject details */}
      <Modal open={!!detailSubject} onClose={() => setDetailSubject(null)} labelledBy="subject-detail-title">
        {detailSubject && (() => {
          const d = detailSubject;
          const hue = buildHueMap(subjects.filter(x => x.teacherId === d.teacherId)).get(d.subjectName) ?? 'blue';
          const teacher = teachers.find(t => t.teacherId === d.teacherId);
          const elective = d.subjectType === 'elective';
          const roster = rosterOf(d);
          const slots = d.schedules?.length ? d.schedules : [{ day: d.day, time: d.time, duration: d.duration }];
          const enrolled = elective
            ? allStudents.filter(st => roster.includes(st.studentId)).sort((a, b) => a.class.localeCompare(b.class, 'th', { numeric: true }) || (parseInt(a.number) || 0) - (parseInt(b.number) || 0))
            : [];
          const facts: [string, string][] = [
            ['ครูผู้สอน', teacher ? `${teacher.name} (${teacher.teacherId})` : d.teacherId],
            ['ประเภท', elective ? 'วิชาเพิ่มเติม' : 'วิชาพื้นฐาน'],
            ['ห้องเรียน', d.classroom || '–'],
            ['ห้องที่สอน', d.room || (teacher?.defaultRoom ? `${teacher.defaultRoom} (ห้องประจำครู)` : '–')],
            ['นักเรียน', `${roster.length} คน`],
          ];
          return (
            <div className="text-gray-900 dark:text-gray-50">
              <div className="mb-5 flex items-start gap-3">
                <span aria-hidden className="mt-1 h-12 w-1.5 flex-none rounded-full" style={{ background: hueColor(hue) }} />
                <div className="min-w-0 flex-1">
                  <h3 id="subject-detail-title" className="text-xl font-bold leading-tight">{d.subjectName}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{[d.subjectCode, `รหัสอ้างอิง ${d.subjectId}`].filter(Boolean).join(' · ')}</p>
                </div>
                <button type="button" onClick={() => setDetailSubject(null)} aria-label="ปิด" className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-surface shadow-neu-sm active:shadow-neu-in-sm">
                  <X size={18} />
                </button>
              </div>

              <dl className="grid grid-cols-2 gap-3">
                {facts.map(([label, value]) => (
                  <div key={label} className={`rounded-xl p-3 shadow-neu-in-sm ${label === 'ครูผู้สอน' ? 'col-span-2' : ''}`}>
                    <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
                    <dd className="font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>

              <h4 className="mb-2 mt-5 text-sm font-semibold text-gray-500 dark:text-gray-400">คาบเรียน</h4>
              <ul className="space-y-2">
                {slots.filter(sl => sl.day || sl.time).map((sl, i) => (
                  <li key={i} className="flex items-center justify-between rounded-xl p-3 shadow-neu-in-sm">
                    <span className="font-semibold">{sl.day ? `วัน${sl.day.replace(/^วัน/, '')}` : '–'}</span>
                    <span className="tabular-nums text-gray-600 dark:text-gray-300">{(sl.time || '').replace('-', '–')} · {sl.duration || 1} ชม.</span>
                  </li>
                ))}
              </ul>

              {elective && (
                <>
                  <h4 className="mb-2 mt-5 text-sm font-semibold text-gray-500 dark:text-gray-400">นักเรียนที่ลงทะเบียน</h4>
                  <ul className="max-h-48 divide-y divide-gray-300/50 overflow-y-auto rounded-xl px-3 shadow-neu-in-sm dark:divide-white/5">
                    {enrolled.length === 0 ? (
                      <li className="py-3 text-sm text-gray-500 dark:text-gray-400">ยังไม่มีนักเรียน</li>
                    ) : enrolled.map(st => (
                      <li key={st.studentId} className="flex justify-between gap-3 py-2 text-sm">
                        <span className="truncate">{st.name}</span>
                        <span className="flex-none tabular-nums text-gray-500 dark:text-gray-400">{st.class} · {st.number}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => setDetailSubject(null)} className="h-12 flex-1 rounded-xl bg-surface font-semibold text-gray-700 shadow-neu-sm active:shadow-neu-in-sm dark:text-gray-200">
                  ปิด
                </button>
                <button type="button" onClick={() => openSubjectEditor(d)} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 font-semibold text-white shadow-neu-sm active:bg-red-700">
                  <Pencil size={18} /> แก้ไข
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Students leaving an edited subject lose its data: confirm first */}
      <Modal open={!!removalConfirm} onClose={() => setRemovalConfirm(null)} dismissible={!isSavingSubject} labelledBy="admin-removal-title">
        {removalConfirm && (
          <div className="text-gray-900 dark:text-gray-50">
            <h3 id="admin-removal-title" className="mb-2 text-lg font-bold">นักเรียน {removalConfirm.count} คนจะไม่อยู่ในวิชานี้แล้ว</h3>
            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              ข้อมูลการเช็คชื่อและคะแนนของนักเรียนกลุ่มนี้ในวิชา {editingSubject?.subjectName} จะถูกลบถาวร และย้อนกลับไม่ได้
            </p>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setRemovalConfirm(null)} disabled={isSavingSubject} className="h-12 flex-1 rounded-xl bg-surface text-sm font-semibold text-gray-700 shadow-neu-sm active:shadow-neu-in-sm dark:text-gray-200">
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={async () => { await handleAddSubject(true); setRemovalConfirm(null); }}
                disabled={isSavingSubject}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-semibold text-white active:bg-red-700 disabled:opacity-50"
              >
                {isSavingSubject && <Loader2 size={16} className="animate-spin" />}
                ลบข้อมูลและบันทึก
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Subject Modal */}
      <Modal open={showAddModal} onClose={closeSubjectEditor} dismissible={!isSavingSubject} size="lg" closeOnBackdrop={false} className="flex flex-col p-6">
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-300/60 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <div className={`p-2.5 rounded-xl ${isDark ? 'bg-blue-950/40 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                    <BookOpen size={22} />
                  </div>
                  <h3 className="text-xl font-bold">{editingSubject ? 'แก้ไขวิชาเรียน' : 'เพิ่มวิชาเรียน'}</h3>
                </div>
                <button
                  onClick={closeSubjectEditor}
                  className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-black/5 text-gray-500'}`}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Content - Scrollable */}
              <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                {/* Teacher Select */}
                <div>
                  <label className={`text-xs font-semibold block mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    เลขประจำตัวครู *
                  </label>
                  <select
                    value={newSubject.teacherId}
                    disabled={!!editingSubject}
                    onChange={(e) => setNewSubject({ ...newSubject, teacherId: e.target.value })}
                    className={`w-full p-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-900'
                      }`}
                  >
                    <option value="">เลือกครู</option>
                    {teachers.map((teacher) => (
                      <option key={teacher.teacherId} value={teacher.teacherId}>
                        {teacher.teacherId} - {teacher.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Subject Name */}
                <div>
                  <label className={`text-xs font-semibold block mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    ชื่อวิชา *
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น คณิตศาสตร์พื้นฐาน, วิทยาการคำนวณ"
                    value={newSubject.subjectName}
                    onChange={(e) => setNewSubject({ ...newSubject, subjectName: e.target.value })}
                    className={`w-full p-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-900'
                      }`}
                  />
                </div>

                {/* Subject code and teaching room */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="admin-subject-code" className={`text-xs font-semibold block mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      รหัสวิชา
                    </label>
                    <input
                      id="admin-subject-code"
                      type="text"
                      placeholder="เช่น ค31101"
                      value={newSubject.subjectCode}
                      onChange={(e) => setNewSubject({ ...newSubject, subjectCode: e.target.value })}
                      className="w-full p-3 rounded-xl border border-transparent bg-surface shadow-neu-in-sm text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-subject-room" className={`text-xs font-semibold block mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      ห้องที่สอน
                    </label>
                    <input
                      id="admin-subject-room"
                      type="text"
                      placeholder="เว้นว่าง = ห้องประจำครู"
                      value={newSubject.room}
                      onChange={(e) => setNewSubject({ ...newSubject, room: e.target.value })}
                      className="w-full p-3 rounded-xl border border-transparent bg-surface shadow-neu-in-sm text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                    />
                  </div>
                </div>

                {/* Subject Type: Basic vs Elective */}
                <div>
                  <label className={`text-xs font-semibold block mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    ประเภทวิชา *
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setNewSubject({ ...newSubject, subjectType: 'basic', studentIds: [] })}
                      className={`p-3 rounded-2xl border-2 flex items-center justify-center gap-2.5 transition-all ${
                        newSubject.subjectType === 'basic'
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
                      onClick={() => setNewSubject({ ...newSubject, subjectType: 'elective' })}
                      className={`p-3 rounded-2xl border-2 flex items-center justify-center gap-2.5 transition-all ${
                        newSubject.subjectType === 'elective'
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
                {newSubject.subjectType === 'basic' ? (
                  <div>
                    <label className={`text-xs font-semibold block mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      ห้องเรียน *
                    </label>
                    <select
                      value={newSubject.classroom}
                      onChange={(e) => setNewSubject({ ...newSubject, classroom: e.target.value })}
                      className={`w-full p-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
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
                          onClick={() => setNewSubject({ ...newSubject, classroom: detectedClassesForElective.join(', ') })}
                          className="text-[11px] text-blue-500 hover:underline"
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
                      value={newSubject.classroom}
                      onChange={(e) => setNewSubject({ ...newSubject, classroom: e.target.value })}
                      className={`w-full p-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-900'
                      }`}
                    />
                  </div>
                )}

                {/* Elective Student Selector: Cross-Classroom Support */}
                {newSubject.subjectType === 'elective' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className={`p-3.5 rounded-2xl border border-transparent bg-surface shadow-neu-in-sm`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <label className={`text-xs font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                        เลือกนักเรียนในวิชาเพิ่มเติม ({newSubject.studentIds.length} คน)
                      </label>
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={handleSelectAllStudentsInCurrentView}
                          className="text-blue-500 font-semibold hover:underline"
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
                          const isChecked = newSubject.studentIds.includes(student.studentId);
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
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
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
                      <Calendar size={14} className="text-blue-500" />
                      <span>กำหนดวัน เวลา และจำนวนคาบที่สอน</span>
                    </label>
                    {newSubject.schedules.length < 3 && (
                      <button
                        type="button"
                        onClick={handleAddScheduleSlot}
                        className="text-xs text-blue-500 hover:text-blue-600 font-semibold flex items-center gap-1 transition-colors"
                      >
                        <Plus size={14} />
                        <span>เพิ่มวันสอน ({newSubject.schedules.length}/3)</span>
                      </button>
                    )}
                  </div>

                  {newSubject.schedules.map((slot, index) => (
                    <div
                      key={index}
                      className={`p-3.5 rounded-2xl border transition-all border-transparent bg-surface shadow-neu-in-sm`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-blue-500 dark:text-blue-400">
                          วันที่ {index + 1}
                        </span>
                        {newSubject.schedules.length > 1 && (
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
                            className={`w-full p-2.5 rounded-xl border text-xs transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
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
                            className={`w-full p-2.5 rounded-xl border text-xs transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
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
                            className={`w-full p-2.5 rounded-xl border text-xs transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
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

                  {newSubject.schedules.length < 3 && (
                    <button
                      type="button"
                      onClick={handleAddScheduleSlot}
                      className={`w-full py-2.5 px-3 rounded-xl border border-dashed text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        isDark
                          ? 'border-gray-600 text-gray-400 hover:border-blue-500 hover:text-blue-400'
                          : 'border-gray-400 text-gray-600 hover:border-blue-500 hover:text-blue-700'
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
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'
                    }`}
                >
                  ยกเลิก
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleAddSubject()}
                  disabled={isSavingSubject}
                  className="flex-1 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-neu-sm transition-all disabled:opacity-50"
                >
                  {isSavingSubject && <Loader2 size={16} className="animate-spin" />}
                  {isSavingSubject ? 'กำลังบันทึก...' : editingSubject ? 'บันทึกการแก้ไข' : 'บันทึกวิชาเรียน'}
                </motion.button>
              </div>
      </Modal>

    </div>
  );
}
