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
import * as XLSX from 'xlsx';
import { Download, Upload, Trash2, Plus, ArrowLeft, Search, BookOpen, Calendar, Clock, Loader2, X } from 'lucide-react';
import { GoogleBasicSubjectIcon, GoogleElectiveSubjectIcon } from '@/components/GoogleSubjectIcons';
import { useTheme } from '@/contexts/ThemeContext';
import Modal from '@/components/Modal';

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

  const [newSubject, setNewSubject] = useState<{
    teacherId: string;
    subjectName: string;
    subjectType: 'basic' | 'elective';
    classroom: string;
    studentIds: string[];
    schedules: ScheduleSlot[];
  }>({
    teacherId: '',
    subjectName: '',
    subjectType: 'basic',
    classroom: '',
    studentIds: [],
    schedules: [{ day: 'จันทร์', time: '08:30-09:30', duration: '1' }]
  });

  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
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

  const handleAddSubject = async () => {
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
      const subject: any = {
        subjectId: `SUB${Date.now()}`,
        teacherId: newSubject.teacherId,
        subjectName: newSubject.subjectName.trim(),
        subjectType: newSubject.subjectType,
        classroom: finalClassroom,
        day: primarySlot.day || 'จันทร์',
        time: primarySlot.time || '08:30-09:30',
        duration: primarySlot.duration || '1',
        schedules: newSubject.schedules
      };

      if (newSubject.subjectType === 'elective') {
        subject.studentIds = newSubject.studentIds;
      }

      await schoolDatabaseService.addSubject(userAccount.schoolFirebaseConfig, subject);
      await loadData(true);
      invalidateCache();
      setShowAddModal(false);
      setStudentSearchQuery('');
      setStudentClassFilter('all');
      setNewSubject({
        teacherId: '',
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

  // Get teacher name by ID
  const getTeacherName = (teacherId: string) => {
    const teacher = teachers.find(t => t.teacherId === teacherId);
    return teacher ? teacher.name : teacherId;
  };

  if (loading && subjects.length === 0 && !uploadProgress) {
    return (
      <div className={`min-h-screen p-6 pb-24 bg-surface`}>
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
      className={`min-h-screen p-6 pb-24 bg-surface`}
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
          จัดการข้อมูลวิชาเรียน
        </h1>

        {/* Teacher Dropdown */}
        <div className={`flex items-center gap-3 p-4 rounded-2xl bg-surface shadow-neu-in-sm`}>
          {/* Back Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push('/admin/dashboard/users')}
            className={`p-2 rounded-xl ${isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'}`}
          >
            <ArrowLeft size={20} />
          </motion.button>

          {/* Custom Teacher Dropdown */}
          <div className="flex-1 relative">
            <div
              onClick={() => setShowTeacherDropdown(!showTeacherDropdown)}
              className={`w-full px-4 py-2 rounded-xl cursor-pointer flex items-center justify-between bg-surface shadow-neu-sm active:shadow-neu-in-sm ${isDark ? 'text-white' : 'text-gray-700'}`}
            >
              <span>{selectedTeacher ? selectedTeacher.name : 'เลือกครู'}</span>
              <motion.span
                animate={{ rotate: showTeacherDropdown ? 180 : 0 }}
                className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
              >
                ▼
              </motion.span>
            </div>

            {/* Dropdown List */}
            {showTeacherDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`absolute top-full left-0 right-0 mt-2 rounded-xl shadow-neu-lg z-50 max-h-64 overflow-y-auto bg-surface`}
              >
                {teachers.map((teacher) => (
                  <div
                    key={teacher.teacherId}
                    onClick={() => handleTeacherSelect(teacher.teacherId)}
                    className={`p-3 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 ${isDark ? 'text-white' : 'text-gray-800'}`}
                  >
                    <div className="font-medium">{teacher.name}</div>
                    <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {teacher.teacherId}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Subjects List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={`rounded-2xl p-6 bg-surface shadow-neu-lg`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
            {selectedTeacherId
              ? `ข้อมูลวิชาที่สอน (${Object.keys(groupedByDay).length} วัน)`
              : 'รายชื่อวิชาเรียนทั้งหมด'
            }
          </h2>
          {selectedSubjects.size > 0 && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDeleteSelected}
              className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-xl"
            >
              <Trash2 size={16} />
              <span>ลบ {selectedSubjects.size} รายการ</span>
            </motion.button>
          )}
        </div>

        {!selectedTeacherId ? (
          <p className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            กรุณาเลือกครูเพื่อดูวิชาที่สอน
          </p>
        ) : Object.keys(groupedByDay).length === 0 ? (
          <p className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            ยังไม่มีข้อมูลวิชาเรียนสำหรับครูท่านนี้
          </p>
        ) : (
          <div className="space-y-4">
            {Object.keys(groupedByDay)
              .sort((a, b) => {
                const dayA = convertDayToEnglish(a);
                const dayB = convertDayToEnglish(b);
                const indexA = dayOrder.indexOf(dayA);
                const indexB = dayOrder.indexOf(dayB);
                return indexA - indexB;
              })
              .map((day, dayIndex) => (
                <div key={day}>
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + dayIndex * 0.1 }}
                    className={`rounded-2xl p-4 shadow-neu-in-sm`}
                  >
                    <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-800'}`}>
                      {convertDayToEnglish(day)}
                    </h3>
                    <div className="space-y-2">
                      {groupedByDay[day]
                        .sort((a: any, b: any) => {
                          // Sort by time (extract start time from time range)
                          const timeA = a.time.split('-')[0] || a.time;
                          const timeB = b.time.split('-')[0] || b.time;
                          return timeA.localeCompare(timeB);
                        })
                        .map((subject: any, index: number) => {
                          const isElective = subject.subjectType === 'elective';
                          const studentCount = isElective && Array.isArray(subject.studentIds) ? subject.studentIds.length : null;

                          return (
                            <motion.div
                              key={subject.subjectId}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.3 + dayIndex * 0.1 + index * 0.02 }}
                              whileHover={{ scale: 1.01, x: 5 }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                toggleSubjectSelection(subject.subjectId);
                              }}
                              onTouchStart={() => handleSubjectTouchStart(subject.subjectId)}
                              onTouchEnd={handleSubjectTouchEnd}
                              onTouchMove={handleSubjectTouchMove}
                              className={`rounded-xl p-3 cursor-pointer transition-all ${selectedSubjects.has(subject.subjectId) ? 'bg-red-100 border-2 border-red-500' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm'}`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>{subject.subjectName}</p>
                                    <span
                                      title={isElective ? `วิชาเพิ่มเติม${studentCount !== null ? ` (${studentCount} คน)` : ''}` : 'วิชาพื้นฐาน'}
                                      className="inline-flex items-center shrink-0"
                                    >
                                      {isElective ? (
                                        <GoogleElectiveSubjectIcon size={18} />
                                      ) : (
                                        <GoogleBasicSubjectIcon size={18} />
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
                                  <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                    ห้อง {subject.classroom} • {subject.time} • {subject.duration === '1' ? '1hr.' : `${subject.duration}hrs.`}
                                  </p>
                                </div>
                                {selectedSubjects.has(subject.subjectId) && (
                                  <span className="text-red-500">✓</span>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                    </div>
                  </motion.div>
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
        <div className={`dock-container relative px-6 py-3 bg-surface shadow-neu-lg`}>
          <div className="flex items-center justify-center gap-6 max-w-4xl mx-auto">
            {/* Download Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDownload}
              className={`flex items-center justify-center p-4 rounded-xl transition-colors w-24 ${isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'}`}
            >
              <Download size={28} />
            </motion.button>

            {/* Hero Action Button (Larger) */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowAddModal(true)}
              className="hero-action-button relative z-50 flex items-center justify-center p-5 rounded-3xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white transition-all w-32"
              style={{
                boxShadow: 'var(--neu-raised)'
              }}
            >
              <Plus size={32} />
            </motion.button>

            {/* Upload Button */}
            <div className={`relative p-4 rounded-xl transition-colors w-24 flex items-center justify-center ${isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'}`}>
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

      {/* Add Subject Modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} size="lg" closeOnBackdrop={false} className="flex flex-col p-6">
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-300/60 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <div className={`p-2.5 rounded-xl ${isDark ? 'bg-blue-950/40 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                    <BookOpen size={22} />
                  </div>
                  <h3 className="text-xl font-bold">เพิ่มวิชาเรียน</h3>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
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
                  onClick={() => setShowAddModal(false)}
                  disabled={isSavingSubject}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'
                    }`}
                >
                  ยกเลิก
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleAddSubject}
                  disabled={isSavingSubject}
                  className="flex-1 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-neu-sm transition-all disabled:opacity-50"
                >
                  {isSavingSubject && <Loader2 size={16} className="animate-spin" />}
                  {isSavingSubject ? 'กำลังบันทึก...' : 'บันทึกวิชาเรียน'}
                </motion.button>
              </div>
      </Modal>

    </div>
  );
}
