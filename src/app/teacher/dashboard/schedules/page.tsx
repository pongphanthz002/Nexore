'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { STORAGE_KEYS } from '@/config/storage.keys';
import { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams, useRouter } from 'next/navigation';
import { schoolDatabaseService, SubjectData, StudentData } from '@/services/school-database.service';
import { 
  teacherDatabaseService, AttendanceRecord, AttendanceData 
} from '@/services/teacher-database.service';
import { 
  ChevronLeft, Clock, Users, ClipboardList, Save, CheckCircle2, 
  FileDown, Download, X, Calendar 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import GoogleSheetsIcon from '@/components/GoogleSheetsIcon';
import Modal, { ModalHeader } from '@/components/Modal';
import AttendanceStatusSelect from '@/components/AttendanceStatusSelect';
import SubjectPicker from '@/components/SubjectPicker';
import Avatar from '@/components/Avatar';
import { useTeacherRoster } from '@/hooks/useTeacherRoster';
import { studentAttendanceTotals, type StudentAttendanceTotals } from '@/lib/attendance';
import { useTheme } from '@/contexts/ThemeContext';

// Parse "08:30-09:30" → { startMinutes, endMinutes }
function parseTimeRange(time: string): { startMinutes: number; endMinutes: number } | null {
  if (!time) return null;
  // Support formats like "8:30-9:20", "08.30 - 09.20", "8:30 - 10:30"
  const normalized = time.replace(/\./g, ':').replace(/\s+/g, '');
  const parts = normalized.split('-');
  if (parts.length < 1) return null;
  
  const startPart = parts[0];
  const startSplit = startPart.split(':');
  if (startSplit.length < 2) return null;
  
  const startH = parseInt(startSplit[0]);
  const startM = parseInt(startSplit[1]);
  if (isNaN(startH) || isNaN(startM)) return null;

  // If end time is missing, assume 1 hour duration
  let endMinutes = (startH + 1) * 60 + startM;
  if (parts.length >= 2) {
    const endPart = parts[1];
    const endSplit = endPart.split(':');
    if (endSplit.length >= 2) {
      const endH = parseInt(endSplit[0]);
      const endM = parseInt(endSplit[1]);
      if (!isNaN(endH) && !isNaN(endM)) {
        endMinutes = endH * 60 + endM;
      }
    }
  }

  return {
    startMinutes: startH * 60 + startM,
    endMinutes: endMinutes,
  };
}

function getCurrentDayThai(): string {
  const dayMap: Record<number, string> = {
    0: 'อาทิตย์', 1: 'จันทร์', 2: 'อังคาร', 3: 'พุธ', 4: 'พฤหัสบดี', 5: 'ศุกร์', 6: 'เสาร์',
  };
  return dayMap[new Date().getDay()] || '';
}

function getNowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

// Format date as "Mon 23/5" using local date
function formatDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = days[date.getDay()];
  const day = date.getDate();
  const month = date.getMonth() + 1;
  return `${dayName} ${day}/${month}`;
}

// Format date as "YYYY-MM-DD" for input type="date"
function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Parse "Mon 23/5" back to Date using local timezone
function parseDate(dateStr: string): Date {
  const parts = dateStr.split(' ');
  const dayMonth = parts[1].split('/');
  const day = parseInt(dayMonth[0]);
  const month = parseInt(dayMonth[1]) - 1;
  const now = new Date();
  // Create date with local timezone (no UTC conversion)
  const date = new Date(now.getFullYear(), month, day, 0, 0, 0, 0);
  return date;
}

// Parse "YYYY-MM-DD" and convert to "Mon 23/5" format
function parseInputDateToFormat(dateStr: string): string {
  if (!dateStr) return '';
  if (!dateStr.includes('-')) {
    return dateStr;
  }
  const [year, month, day] = dateStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 0, 0, 0, 0);
  return formatDate(date);
}

// Row colour per attendance status: rows sit sunk into the card (soft UI), tinted by status
function getStatusStyles(status: string, isDark: boolean): string {
  // Same hues as AttendanceStatusSelect; "มา" stays neutral so exceptions stand out
  const tint: Record<string, [string, string]> = {
    'มา': ['text-gray-900', 'text-white'],
    'ขาด': ['bg-red-50/80 text-red-900', 'bg-red-950/40 text-red-100'],
    'สาย': ['bg-amber-50/80 text-amber-900', 'bg-amber-950/40 text-amber-100'],
    'ลาป่วย': ['bg-sky-50/80 text-sky-900', 'bg-sky-950/40 text-sky-100'],
    'ลากิจ': ['bg-fuchsia-50/80 text-fuchsia-900', 'bg-fuchsia-950/40 text-fuchsia-100'],
    'กิจกรรม': ['bg-teal-50/80 text-teal-900', 'bg-teal-950/40 text-teal-100'],
    'หนี': ['bg-orange-50/80 text-orange-900', 'bg-orange-950/40 text-orange-100'],
  };
  const pair = tint[status] ?? ['text-gray-600', 'text-gray-300'];
  return `border-transparent shadow-neu-in-sm ${pair[isDark ? 1 : 0]}`;
}

function SchedulesContent() {
  const { userAccount } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isDark } = useTheme();
  const { subjects, students, teacher: teacherConfig, loading } = useTeacherRoster();
  const [selectedSubject, setSelectedSubject] = useState<SubjectData | null>(null);
  const [filteredStudents, setFilteredStudents] = useState<StudentData[]>([]);
  const [nowMinutes, setNowMinutes] = useState(getNowMinutes());
  
  // Attendance state
  const [isAttendanceMode, setIsAttendanceMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState(formatDateForInput(new Date()));
  const [selectedHours, setSelectedHours] = useState(1);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  // Rooms checked together (one period taught to several rooms); each record keeps its subject in recordOwner
  const [groupSubjects, setGroupSubjects] = useState<SubjectData[]>([]);
  const [recordOwner, setRecordOwner] = useState<Record<string, string>>({});
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [fromSection, setFromSection] = useState<'current' | 'all'>('current');
  const [paramsProcessed, setParamsProcessed] = useState(false);
  const [attendanceSummaries, setAttendanceSummaries] = useState<Record<string, StudentAttendanceTotals>>({});
  const [todayAttendance, setTodayAttendance] = useState<AttendanceData[]>([]);
  
  // Load todayAttendance from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.TODAY_ATTENDANCE);
    if (stored) {
      const parsed = JSON.parse(stored);
      const storedDate = parsed.date;
      const todayFormatted = formatDate(new Date());
      // Only use stored data if it's from today
      if (storedDate === todayFormatted) {
        setTodayAttendance(parsed.data);
      }
    }
  }, []);
  
  // Save todayAttendance to localStorage whenever it changes
  useEffect(() => {
    if (todayAttendance.length > 0) {
      const todayFormatted = formatDate(new Date());
      localStorage.setItem(STORAGE_KEYS.TODAY_ATTENDANCE, JSON.stringify({
        date: todayFormatted,
        data: todayAttendance
      }));
    }
  }, [todayAttendance]);
  
  // Download Modal state
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [selectedSubjectsForDownload, setSelectedSubjectsForDownload] = useState<string[]>([]);
  const [downloadRange, setDownloadRange] = useState<'term' | 'month'>('term');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isDownloading, setIsDownloading] = useState(false);

  // Update current time every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setNowMinutes(getNowMinutes()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Today's sessions (which periods are already checked); not needed to show the subject list
  const teacherDbConfig = teacherConfig?.firebaseConfig;
  useEffect(() => {
    if (!teacherDbConfig) return;
    teacherDatabaseService.getAttendanceByDate(teacherDbConfig, formatDate(new Date()))
      .then(setTodayAttendance)
      .catch(error => console.error('Error loading today\'s attendance:', error));
    // Once per teacher project: the cached and the re-read teacher record hold the same config
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherDbConfig?.projectId]);

  // Current subjects: show 15 min before start, hide 180 min after start
  // Also filter out subjects that have already been checked today
  const todayThai = getCurrentDayThai();
  const currentSubjects: SubjectData[] = [];
  subjects.forEach(s => {
    const activeSchedule = s.schedules && s.schedules.length > 0
      ? s.schedules.find(sch => sch.day === todayThai)
      : (s.day === todayThai ? s : null);
    if (!activeSchedule) return;

    const range = parseTimeRange(activeSchedule.time);
    if (!range) return;

    // 1. Check time range (show from 15 mins before start up to 180 mins after start)
    const isInTime = nowMinutes >= range.startMinutes - 15 && nowMinutes <= range.startMinutes + 180;
    if (!isInTime) return;

    // 2. Check if already checked today
    const alreadyChecked = todayAttendance.some(att => 
      att.subjectId === s.subjectId && 
      att.classroom === s.classroom
    );
    if (alreadyChecked) return;

    currentSubjects.push({
      ...s,
      day: activeSchedule.day,
      time: activeSchedule.time,
      duration: activeSchedule.duration || s.duration
    });
  });
  currentSubjects.sort((a, b) => a.time.localeCompare(b.time));

  // Handle mode=attendance and subjectId query parameters
  useEffect(() => {
    const mode = searchParams.get('mode');
    const subjectId = searchParams.get('subjectId');
    
    if (!loading && !paramsProcessed) {
      const subjectIds = searchParams.get('subjectIds');
      if (subjectIds) {
        // From the home timetable: every room of the current period, today, the period's hours
        setParamsProcessed(true);
        const group = subjectIds.split(',').map(id => subjects.find(s => s.subjectId === id)).filter((s): s is SubjectData => !!s);
        if (group.length) {
          const hours = parseInt(searchParams.get('hours') || '');
          if (hours) setSelectedHours(hours);
          setSelectedSubject(group[0]);
          setFromSection('current');
          setFilteredStudents(matchStudents(group[0]));
          loadAttendanceGroup(group, hours || undefined);
        }
      } else if (subjectId) {
        // Find subject by ID
        const subject = subjects.find(s => s.subjectId === subjectId);
        if (subject) {
          setParamsProcessed(true);
          if (mode === 'attendance') {
            // Auto-open attendance mode for current subjects
            handleSelectSubject(subject, 'current');
          } else if (mode === 'list') {
            // Show student list view (from Short cut)
            handleSelectSubject(subject, 'all');
          }
        } else {
          // If subjectId is in query params but not found in the loaded subjects list (e.g. invalid or not user's), mark as processed anyway to avoid loop
          setParamsProcessed(true);
        }
      } else if (mode === 'attendance' && currentSubjects.length > 0) {
        setParamsProcessed(true);
        // Auto-select first current subject for attendance
        handleSelectSubject(currentSubjects[0], 'current');
      } else if (mode) {
        // If there are other query parameters but we can't process them, mark as processed to prevent loops
        setParamsProcessed(true);
      }
    }
    // Runs once the query params and subjects are ready; the handlers it calls read the latest state anyway
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, subjects, currentSubjects, loading, paramsProcessed]);

  // Helper to get status counts (Updated: Count by hours and new categories)
  const getStatusSummary = (records: AttendanceData[], studentId: string) => {
    let total = 0;
    let present = 0;
    let absent = 0;
    let late = 0;
    let sickLeave = 0;
    let personalLeave = 0;
    let activity = 0;
    let skipped = 0;

    records.forEach(att => {
      const record = att.records.find(r => r.studentId === studentId);
      if (record && record.status) {
        const hours = Number(att.hours) || 1;
        total += hours;
        
        if (record.status === 'มา') present += hours;
        else if (record.status === 'ขาด') absent += hours;
        else if (record.status === 'สาย') late += hours;
        else if (record.status === 'ลาป่วย') sickLeave += hours;
        else if (record.status === 'ลากิจ') personalLeave += hours;
        else if (record.status === 'กิจกรรม') activity += hours;
        else if (record.status === 'หนี') skipped += hours;
      }
    });

    // percentage = (มา + สาย + กิจกรรม) / ทั้งหมด
    const totalPresentHours = present + late + activity;
    const percentage = total > 0 ? Math.round((totalPresentHours / total) * 100) : 0;

    return { total, present, absent, late, sickLeave, personalLeave, activity, skipped, percentage };
  };

  const handleDownloadExcel = async () => {
    if (selectedSubjectsForDownload.length === 0) {
      alert('โปรดเลือกอย่างน้อยหนึ่งวิชา');
      return;
    }

    setIsDownloading(true);
    try {
      const firebaseConfig = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
      if (!firebaseConfig) throw new Error('Firebase configuration not found');

      const wb = XLSX.utils.book_new();

      for (const subjectKey of selectedSubjectsForDownload) {
        const [subjectName, classroom] = subjectKey.split('|||');
        const subjectId = subjects.find(s => s.subjectName === subjectName && s.classroom === classroom)?.subjectId;
        if (!subjectId) continue;

        let allAttendance = await teacherDatabaseService.getAttendanceBySubject(firebaseConfig, subjectId, classroom);

        // Filter by month if needed
        if (downloadRange === 'month') {
          allAttendance = allAttendance.filter(att => {
            const date = parseDate(att.date);
            return (date.getMonth() + 1) === selectedMonth && date.getFullYear() === selectedYear;
          });
        }

        if (allAttendance.length === 0) continue;

        // Sort attendance by date
        allAttendance.sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());

        // Get unique students for this subject/classroom
        const studentIds = new Set<string>();
        const studentMap: Record<string, { name: string, number: string }> = {};
        
        allAttendance.forEach(att => {
          att.records.forEach(r => {
            studentIds.add(r.studentId);
            if (!studentMap[r.studentId]) {
              studentMap[r.studentId] = { name: r.name, number: r.number };
            }
          });
        });

        const sortedStudentIds = Array.from(studentIds).sort((a, b) => {
          const numA = parseInt(studentMap[a].number) || 999;
          const numB = parseInt(studentMap[b].number) || 999;
          return numA - numB;
        });

        // Prepare Worksheet Data
        const wsData: any[][] = [];
        
        // Row 1: Subject Name
        wsData.push([`วิชา: ${subjectName} (ห้อง ${classroom})`]);
        
        // Row 2: Headers
        const dateHeaders = allAttendance.map(att => att.date);
        wsData.push([
          'เลขที่', 'รหัสประจำตัว', 'ชื่อ', 
          'ทั้งหมด', 'มา', 'ขาด', 'สาย', 'ลาป่วย', 'ลากิจ', 'กิจกรรม', 'หนี', '%',
          ...dateHeaders
        ]);

        // Student Rows
        sortedStudentIds.forEach(studentId => {
          const student = studentMap[studentId];
          const summary = getStatusSummary(allAttendance, studentId);
          
          const row = [
            student.number,
            studentId,
            student.name,
            summary.total,
            summary.present,
            summary.absent,
            summary.late,
            summary.sickLeave,
            summary.personalLeave,
            summary.activity,
            summary.skipped,
            `${summary.percentage}%`,
          ];

          // Add daily attendance statuses
          allAttendance.forEach(att => {
            const record = att.records.find(r => r.studentId === studentId);
            row.push(record?.status || '-');
          });

          wsData.push(row);
        });

        // Row for Hours
        const hoursRow = [
          '', '', 'จำนวนชั่วโมงเรียน',
          '', '', '', '', '', '', '', '', '', // Summary columns
          ...allAttendance.map(att => `${att.hours} ชม.`)
        ];
        wsData.push(hoursRow);

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        
        // Basic column widths
        const wscols = [
          { wch: 6 },  // No
          { wch: 15 }, // ID
          { wch: 25 }, // Name
          { wch: 8 },  // Total
          { wch: 5 },  // Present
          { wch: 5 },  // Absent
          { wch: 5 },  // Late
          { wch: 8 },  // Sick
          { wch: 8 },  // Personal
          { wch: 8 },  // Activity
          { wch: 5 },  // Skipped
          { wch: 6 },  // %
          ...dateHeaders.map(() => ({ wch: 10 }))
        ];
        ws['!cols'] = wscols;

        XLSX.utils.book_append_sheet(wb, ws, `${subjectName.substring(0, 20)} (${classroom})`.replace(/[\/\\?*:[\]]/g, '-'));
      }

      if (wb.SheetNames.length === 0) {
        alert('ไม่พบข้อมูลในช่วงเวลาที่เลือก');
        return;
      }

      const fileName = downloadRange === 'term' 
        ? `Attendance_Report_Term.xlsx`
        : `Attendance_Report_${selectedMonth}_${selectedYear}.xlsx`;
        
      XLSX.writeFile(wb, fileName);
      setShowDownloadModal(false);
    } catch (error) {
      console.error('Download error:', error);
      alert('เกิดข้อผิดพลาดในการดาวน์โหลด');
    } finally {
      setIsDownloading(false);
    }
  };
  /** History table: every student's hours per status, from the subject's summary document (1 read). */
  const loadSummaries = async (subject?: SubjectData, studentsList?: StudentData[]) => {
    const targetSubject = subject || selectedSubject;
    const targetStudents = studentsList || filteredStudents;
    const firebaseConfig = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
    if (!targetSubject || targetStudents.length === 0 || !firebaseConfig) return;
    try {
      const summary = await teacherDatabaseService.getSubjectAttendance(firebaseConfig, targetSubject.subjectId, targetSubject.classroom);
      const totals: Record<string, StudentAttendanceTotals> = {};
      for (const student of targetStudents) totals[student.studentId] = studentAttendanceTotals(summary, student.studentId);
      setAttendanceSummaries(totals);
    } catch (error) {
      console.error('Error loading attendance summaries:', error);
    }
  };

  // History view only: checking attendance doesn't show the totals
  useEffect(() => {
    if (fromSection !== 'all' || isAttendanceMode) return;
    loadSummaries();
    // These are the values loadSummaries reads (the teacher record by project: a re-read copy
    // is a new object with the same config); it is recreated every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubject, filteredStudents, teacherConfig?.firebaseConfig?.projectId]);

  // All unique subjects (unique by subjectName + classroom)
  const allUniqueSubjects = subjects
    .reduce((acc, subject) => {
      const key = `${subject.subjectName}-${subject.classroom}`;
      if (!acc.find(s => `${s.subjectName}-${s.classroom}` === key)) {
        acc.push(subject);
      }
      return acc;
    }, [] as SubjectData[])
    .sort((a, b) => a.classroom.localeCompare(b.classroom, 'th'));

  // Google photos saved on student docs at sign-in, for the check list
  const photoById = new Map(students.map(st => [st.studentId, st.photoURL]));

  const matchStudents = (subject: SubjectData) => students
    .filter(s => {
      if (subject.subjectType === 'elective' && Array.isArray(subject.studentIds) && subject.studentIds.length > 0) {
        return subject.studentIds.includes(s.studentId);
      }
      return s.class === subject.classroom;
    })
    .sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0));

  const handleSelectSubject = async (subject: SubjectData, section: 'current' | 'all' = 'current') => {
    setSelectedSubject(subject);
    setFromSection(section);
    setGroupSubjects([]);
    setAttendanceSummaries({});
    const matched = matchStudents(subject);
    setFilteredStudents(matched);
    
    // Set default hours from subject duration
    if (subject.duration) {
      setSelectedHours(parseInt(subject.duration) || 1);
    }
    
    // Auto-open attendance mode for current subjects
    if (section === 'current') {
      await handleOpenAttendance(subject, matched);
    }
  };

  const handleOpenAttendance = async (subject?: SubjectData | React.MouseEvent, studentList?: StudentData[]) => {
    // Handle both direct subject parameter and click event; without one, reload the open group
    if (subject && 'subjectId' in subject) return loadAttendanceGroup([subject], undefined, studentList);
    const group = groupSubjects.length ? groupSubjects : selectedSubject ? [selectedSubject] : [];
    if (group.length) await loadAttendanceGroup(group, undefined, studentList);
  };

  /** Load (or start) the session of every subject in the group for the selected date. New sessions start as "มา". */
  const loadAttendanceGroup = async (group: SubjectData[], hours?: number, studentList?: StudentData[]) => {
    // Use teacher's Firebase config if available, otherwise use school config (for admin teachers)
    const firebaseConfig = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
    if (!firebaseConfig) {
      alert('ไม่พบ Firebase Config กรุณาติดต่อผู้ดูแลระบบ');
      return;
    }

    setGroupSubjects(group);
    setIsAttendanceMode(true);
    setLoadingAttendance(true);
    // Convert selectedDate from YYYY-MM-DD to "Mon 23/5" format
    const formattedDate = parseInputDateToFormat(selectedDate);
    const owner: Record<string, string> = {};
    const records: AttendanceRecord[] = [];
    let savedHours: number | undefined;

    await Promise.all(group.map(async (target, i) => {
      const roster = (group.length === 1 && studentList) || matchStudents(target);
      let existing: AttendanceData | null = null;
      try {
        existing = await teacherDatabaseService.getAttendance(firebaseConfig, target.subjectId, target.classroom, formattedDate);
      } catch (error) {
        console.error('Error loading attendance:', error);
      }
      if (existing && i === 0) savedHours = existing.hours;
      const list = existing
        ? existing.records
        : roster.map(s => ({ studentId: s.studentId, name: s.name, number: s.number, status: 'มา' as const }));
      list.forEach(r => { owner[r.studentId] = target.subjectId; });
      records.push(...list);
    }));

    // Keep rooms in group order
    const order = new Map(group.map((g, i) => [g.subjectId, i]));
    records.sort((a, b) => (order.get(owner[a.studentId]) ?? 0) - (order.get(owner[b.studentId]) ?? 0));
    setRecordOwner(owner);
    setAttendanceRecords(records);
    if (savedHours) setSelectedHours(savedHours);
    else if (hours) setSelectedHours(hours);
    setLoadingAttendance(false);
  };

  const handleMarkAllPresent = () => {
    setAttendanceRecords(records => 
      records.map(r => ({ ...r, status: 'มา' as const }))
    );
  };

  const handleStatusChange = (studentId: string, status: string) => {
    setAttendanceRecords(records => 
      records.map(r => r.studentId === studentId ? { ...r, status: status as AttendanceRecord['status'] } : r)
    );
  };

  const handleSaveAttendance = async () => {
    const group = groupSubjects.length ? groupSubjects : selectedSubject ? [selectedSubject] : [];
    if (!group.length) return;

    // Use teacher's Firebase config if available, otherwise use school config (for admin teachers)
    const firebaseConfig = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
    if (!firebaseConfig) {
      alert('ไม่พบ Firebase Config กรุณาติดต่อผู้ดูแลระบบ');
      return;
    }

    setLoadingAttendance(true);
    try {
      // Convert selectedDate from YYYY-MM-DD to "Mon 23/5" format
      const formattedDate = parseInputDateToFormat(selectedDate);
      // One session per room, even when the rooms were checked together
      const saved: AttendanceData[] = group.map(target => ({
        subjectId: target.subjectId,
        subjectName: target.subjectName || '',
        classroom: target.classroom,
        date: formattedDate,
        hours: Number(selectedHours) || 1,
        records: group.length === 1
          ? attendanceRecords
          : attendanceRecords.filter(r => recordOwner[r.studentId] === target.subjectId),
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      await Promise.all(saved.map(data => teacherDatabaseService.saveAttendance(firebaseConfig, data)));
      alert(group.length > 1 ? `บันทึกเช็คชื่อ ${group.length} ห้องสำเร็จ` : 'บันทึกเช็คชื่อสำเร็จ');

      // Update todayAttendance state after successful save
      const todayFormatted = formatDate(new Date());
      if (formattedDate === todayFormatted) {
        setTodayAttendance(prev => [
          ...prev.filter(att => !saved.some(d => d.subjectId === att.subjectId && d.classroom === att.classroom)),
          ...saved,
        ]);
      }

      if (searchParams.get('subjectIds')) {
        // Opened from the home timetable: go back there (its attendance bar is now gone)
        router.push('/teacher/dashboard');
      } else if (fromSection === 'current') {
        handleBackToMain();
      } else {
        // Reload summaries before returning to student list
        await loadSummaries(selectedSubject ?? group[0], filteredStudents);
        setIsAttendanceMode(false);
      }
    } catch (error) {
      console.error('Error saving attendance:', error);
      alert('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setLoadingAttendance(false);
    }
  };

  const handleDateChange = (daysOffset: number) => {
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + daysOffset);
    setSelectedDate(formatDateForInput(newDate));
  };

  // Reload attendance data when date changes
  useEffect(() => {
    if (isAttendanceMode && selectedSubject) {
      handleOpenAttendance();
    }
    // Only a date change should reload the open session, not every state change it reads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const handleBackToMain = () => {
    setSelectedSubject(null);
    setGroupSubjects([]);
    setIsAttendanceMode(false);
    router.replace('/teacher/dashboard/schedules');
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className={`rounded-2xl p-6 bg-surface shadow-neu-lg animate-pulse`}>
            <div className={`h-8 w-48 rounded-lg mb-4 ${isDark ? 'bg-white/10' : 'bg-gray-300/60'}`} />
            <div className={`h-20 rounded-xl ${isDark ? 'bg-white/10' : 'bg-gray-300/60'}`} />
          </div>
          <div className={`rounded-2xl p-6 bg-surface shadow-neu-lg animate-pulse`}>
            <div className={`h-8 w-40 rounded-lg mb-4 ${isDark ? 'bg-white/10' : 'bg-gray-300/60'}`} />
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className={`h-16 rounded-xl ${isDark ? 'bg-white/10' : 'bg-gray-300/60'}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {!selectedSubject ? (
            <motion.div
              key="main"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className={`text-3xl font-black ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight`}>
                    จัดการเวลาเรียน
                  </h1>
                  <p className={`text-sm mt-1 font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    เลือกวิชาที่ต้องการจัดการเวลาเรียน
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => {
                      setSelectedSubjectsForDownload(allUniqueSubjects.map(s => `${s.subjectName}|||${s.classroom}`));
                      setShowDownloadModal(true);
                    }}
                    disabled={allUniqueSubjects.length === 0}
                    title="ดาวน์โหลด Excel (Google Sheets)"
                    className={`p-3 rounded-2xl bg-surface shadow-neu-sm transition-shadow flex items-center justify-center active:shadow-neu-in-sm ${
                      isDark ? 'text-white' : 'text-gray-800'
                    } disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none`}
                  >
                    <GoogleSheetsIcon size={24} />
                  </motion.button>
                </div>
              </div>
              
              {allUniqueSubjects.length > 0 ? (
                <SubjectPicker
                  subjects={subjects}
                  teacher={teacherConfig ? { teacherId: teacherConfig.teacherId, name: teacherConfig.name, defaultRoom: teacherConfig.defaultRoom } : null}
                  countStudents={s => matchStudents(s).length}
                  onSelect={s => handleSelectSubject(s, 'all')}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-20 rounded-[3rem] shadow-neu-in">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-surface shadow-neu`}>
                    <ClipboardList className="opacity-20" size={32} />
                  </div>
                  <p className={`text-lg font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    ไม่พบวิชาที่สอน
                  </p>
                </div>
              )}
              {/* Download Modal */}
              <Modal open={showDownloadModal} onClose={() => setShowDownloadModal(false)} size="lg" dismissible={!isDownloading} labelledBy="attendance-download-title">
                      <ModalHeader id="attendance-download-title" title="ดาวน์โหลดรายงานเช็คชื่อ" icon={<GoogleSheetsIcon size={24} />} onClose={() => setShowDownloadModal(false)} />

                      <div className="space-y-6">
                        {/* Subject Selection */}
                        <div>
                          <label className="block text-sm font-bold mb-3 opacity-70">เลือกวิชาที่ต้องการ</label>
                          <div className="max-h-48 overflow-y-auto rounded-2xl p-2 shadow-neu-in-sm">
                            {allUniqueSubjects.map((subject) => {
                              const key = `${subject.subjectName}|||${subject.classroom}`;
                              const isSelected = selectedSubjectsForDownload.includes(key);
                              return (
                                <label 
                                  key={key}
                                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                                    isSelected 
                                      ? (isDark ? 'bg-red-950/30 text-red-400' : 'bg-red-50 text-red-600') 
                                      : 'hover:bg-black/5 dark:hover:bg-white/5'
                                  }`}
                                >
                                  <input 
                                    type="checkbox" 
                                    checked={isSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedSubjectsForDownload(prev => [...prev, key]);
                                      } else {
                                        setSelectedSubjectsForDownload(prev => prev.filter(k => k !== key));
                                      }
                                    }}
                                    className="w-5 h-5 rounded-lg border-2 border-gray-400 text-red-600 focus:ring-red-500"
                                  />
                                  <div className="flex-1">
                                    <div className="font-bold">{subject.subjectName}</div>
                                    <div className="text-xs opacity-70">ห้อง {subject.classroom}</div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        {/* Range Selection */}
                        <div className="space-y-3">
                          <label className="block text-sm font-bold opacity-70">ช่วงเวลา</label>
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              onClick={() => setDownloadRange('term')}
                              className={`p-3 rounded-2xl border-2 font-bold transition-all ${
                                downloadRange === 'term'
                                  ? 'border-red-500 bg-red-500/10 text-red-700 shadow-neu-in-sm dark:text-red-400'
                                  : 'border-transparent bg-surface shadow-neu-sm'
                              }`}
                            >
                              ตลอดเทอม
                            </button>
                            <button
                              onClick={() => setDownloadRange('month')}
                              className={`p-3 rounded-2xl border-2 font-bold transition-all ${
                                downloadRange === 'month'
                                  ? 'border-red-500 bg-red-500/10 text-red-700 shadow-neu-in-sm dark:text-red-400'
                                  : 'border-transparent bg-surface shadow-neu-sm'
                              }`}
                            >
                              รายเดือน
                            </button>
                          </div>

                          {downloadRange === 'month' && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              className="flex gap-2"
                            >
                              <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                                className="flex-1 p-3 rounded-2xl border border-transparent bg-surface shadow-neu-in-sm"
                              >
                                {Array.from({ length: 12 }).map((_, i) => (
                                  <option key={i + 1} value={i + 1}>
                                    {new Date(0, i).toLocaleString('th-TH', { month: 'long' })}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                className="w-32 p-3 rounded-2xl border border-transparent bg-surface shadow-neu-in-sm"
                              >
                                {Array.from({ length: 3 }).map((_, i) => (
                                  <option key={i} value={new Date().getFullYear() - i}>
                                    {new Date().getFullYear() - i + 543}
                                  </option>
                                ))}
                              </select>
                            </motion.div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="pt-4 space-y-3">
                          <button
                            onClick={handleDownloadExcel}
                            disabled={isDownloading || selectedSubjectsForDownload.length === 0}
                            className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-neu-sm ${
                              isDownloading || selectedSubjectsForDownload.length === 0
                                ? 'bg-gray-500 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/20'
                            }`}
                          >
                            {isDownloading ? (
                              <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <GoogleSheetsIcon size={22} />
                            )}
                            {isDownloading ? 'กำลังสร้างไฟล์...' : 'ดาวน์โหลด Excel'}
                          </button>
                          <button
                            onClick={() => setShowDownloadModal(false)}
                            className="w-full py-4 rounded-2xl font-bold opacity-60 hover:opacity-100 transition-all"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      </div>
              </Modal>
            </motion.div>
          ) : isAttendanceMode ? (
            <motion.div
              key="attendance"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={`rounded-2xl p-6 bg-surface shadow-neu-lg`}
            >
              {/* Fixed Dock */}
              <div className={`sticky top-0 z-10 -mx-6 px-6 py-4 mb-6 border-b bg-surface ${isDark ? 'border-white/5' : 'border-gray-300/50'}`}>
                <div className="flex items-center gap-3 mb-4">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => {
                      if (fromSection === 'current') {
                        handleBackToMain();
                      } else {
                        setIsAttendanceMode(false);
                      }
                    }}
                    className={`p-2 rounded-xl ${isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'}`}
                  >
                    <ChevronLeft size={24} />
                  </motion.button>
                  <div className="flex-1">
                    <h1 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      เช็คชื่อ: {selectedSubject.subjectName}
                    </h1>
                    <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      {groupSubjects.length > 1
                        ? `ห้อง ${groupSubjects.map(g => g.classroom).join(', ')} · เรียนรวม บันทึกแยกห้อง`
                        : `ห้อง ${selectedSubject.classroom}`}
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  {/* Date picker */}
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      if (e.target.value) {
                        setSelectedDate(e.target.value);
                      }
                    }}
                    className={`px-3 py-2 rounded-lg border ${isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-900'}`}
                  />
                  
                  {/* Hours dropdown */}
                  <select
                    value={selectedHours}
                    onChange={(e) => setSelectedHours(parseInt(e.target.value))}
                    className={`px-3 py-2 rounded-lg border ${isDark ? 'border-transparent bg-surface shadow-neu-in-sm text-white' : 'border-transparent bg-surface shadow-neu-in-sm text-gray-900'}`}
                  >
                    <option value={1}>1 hr.</option>
                    <option value={2}>2 hrs.</option>
                    <option value={3}>3 hrs.</option>
                  </select>
                  
                  {/* Save button */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleSaveAttendance}
                    disabled={loadingAttendance}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium shadow-neu-sm ${loadingAttendance ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${isDark ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-900/20' : 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20'}`}
                  >
                    <Save size={18} />
                    บันทึก
                  </motion.button>
                </div>
              </div>

              {/* Mark all present button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleMarkAllPresent}
                className={`w-full mb-4 p-3 rounded-xl flex items-center justify-center gap-2 font-medium ${isDark ? 'bg-green-600/20 text-green-400 border border-green-600/50' : 'bg-green-50 text-green-600 border border-green-300'}`}
              >
                <CheckCircle2 size={20} />
                มาทั้งหมด
              </motion.button>

              {/* Student list with status dropdown */}
              {loadingAttendance ? (
                <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  กำลังโหลด...
                </div>
              ) : attendanceRecords.length > 0 ? (
                <div className="space-y-2">
                  {attendanceRecords.map((record, index) => {
                    const statusClass = getStatusStyles(record.status, isDark);
                    const room = groupSubjects.length > 1 ? groupSubjects.find(g => g.subjectId === recordOwner[record.studentId]) : undefined;
                    const firstOfRoom = !!room && (index === 0 || recordOwner[attendanceRecords[index - 1].studentId] !== room.subjectId);
                    return (
                      <div key={record.studentId}>
                        {firstOfRoom && (
                          <div className={`flex items-baseline justify-between px-1 pb-1 ${index > 0 ? 'pt-4' : ''}`}>
                            <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{room.classroom}</h2>
                            <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                              {attendanceRecords.filter(r => recordOwner[r.studentId] === room.subjectId).length} คน
                            </span>
                          </div>
                        )}
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(index, 30) * 0.02 }}
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-colors duration-300 ${statusClass}`}
                        >
                          <span className="w-7 text-center font-medium tabular-nums opacity-80">
                            {record.number}
                          </span>
                          <Avatar src={photoById.get(record.studentId)} name={record.name} />
                          <span className="flex-1 min-w-0 font-semibold">
                            {record.name}
                          </span>
                          <AttendanceStatusSelect
                            value={record.status}
                            label={record.name}
                            onChange={status => handleStatusChange(record.studentId, status)}
                          />
                        </motion.div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  ไม่พบนักเรียนในห้องนี้
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="students"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={`rounded-2xl p-6 bg-surface shadow-neu-lg`}
            >
              <div className="flex items-center gap-3 mb-6">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleBackToMain}
                  className={`p-2 rounded-xl ${isDark ? 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-300' : 'bg-surface shadow-neu-sm active:shadow-neu-in-sm text-gray-700'}`}
                >
                  <ChevronLeft size={24} />
                </motion.button>
                <div className="flex-1">
                  <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {selectedSubject.subjectName}
                  </h1>
                  <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    ห้อง {selectedSubject.classroom} | {filteredStudents.length} คน
                  </p>
                </div>
                {fromSection === 'all' && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleOpenAttendance()}
                    className={`p-2 rounded-xl shadow-neu-sm ${isDark ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-900/20' : 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20'}`}
                  >
                    <ClipboardList size={24} />
                  </motion.button>
                )}
              </div>

              {filteredStudents.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className={isDark ? 'border-b border-white/10' : 'border-b border-gray-300/70'}>
                        <th className={`py-3 px-4 text-left text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>เลขที่</th>
                        <th className={`py-3 px-4 text-left text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>เลขประจำตัว</th>
                        <th className={`py-3 px-4 text-left text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>ชื่อ</th>
                        {fromSection === 'all' && (
                          <>
                            <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>ทั้งหมด</th>
                            <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>%</th>
                            <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>มา</th>
                            <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>ขาด</th>
                            <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>สาย</th>
                            <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>ลาป่วย</th>
                            <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>ลากิจ</th>
                            <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>กิจกรรม</th>
                            <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>หนี</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((student, index) => (
                        <motion.tr
                          key={student.studentId}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                          className={isDark ? 'border-b border-white/5' : 'border-b border-gray-300/40'}
                        >
                          <td className={`py-3 px-4 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{student.number || '-'}</td>
                          <td className={`py-3 px-4 text-sm font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{student.studentId}</td>
                          <td className={`py-3 px-4 text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{student.name}</td>
                          {fromSection === 'all' && (
                            <>
                              <td className={`py-3 px-4 text-sm text-center font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {attendanceSummaries[student.studentId]?.total || 0}
                              </td>
                              <td className={`py-3 px-4 text-sm text-center font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {attendanceSummaries[student.studentId]?.percentage || 0}%
                              </td>
                              <td className={`py-3 px-4 text-sm text-center font-semibold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                                {attendanceSummaries[student.studentId]?.present || 0}
                              </td>
                              <td className={`py-3 px-4 text-sm text-center font-semibold ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                                {attendanceSummaries[student.studentId]?.absent || 0}
                              </td>
                              <td className={`py-3 px-4 text-sm text-center font-semibold ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
                                {attendanceSummaries[student.studentId]?.late || 0}
                              </td>
                              <td className={`py-3 px-4 text-sm text-center font-semibold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                                {attendanceSummaries[student.studentId]?.sickLeave || 0}
                              </td>
                              <td className={`py-3 px-4 text-sm text-center font-semibold ${isDark ? 'text-fuchsia-400' : 'text-fuchsia-600'}`}>
                                {attendanceSummaries[student.studentId]?.personalLeave || 0}
                              </td>
                              <td className={`py-3 px-4 text-sm text-center font-semibold ${isDark ? 'text-sky-400' : 'text-sky-600'}`}>
                                {attendanceSummaries[student.studentId]?.activity || 0}
                              </td>
                              <td className={`py-3 px-4 text-sm text-center font-semibold ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                                {attendanceSummaries[student.studentId]?.skipped || 0}
                              </td>
                            </>
                          )}
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {fromSection === 'all' && (
                  <div className={`mt-4 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} italic flex items-center gap-1`}>
                    <Clock size={12} />
                    หมายเหตุ: การมาเรียนถูกเก็บบันทึกข้อมูลนับตามชั่วโมงเรียน
                  </div>
                )}
              </>
            ) : (
                <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  ไม่พบนักเรียนในห้องนี้
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function SchedulesPage() {
  return (
    <Suspense fallback={<div className="p-6">กำลังโหลด...</div>}>
      <SchedulesContent />
    </Suspense>
  );
}
