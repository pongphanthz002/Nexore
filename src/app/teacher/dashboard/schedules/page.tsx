'use client';

import { motion, AnimatePresence } from 'framer-motion';
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

// Map attendance status to beautiful background/border/text colors
function getStatusStyles(status: string, isDark: boolean): string {
  switch (status) {
    case 'มา':
      return isDark 
        ? 'bg-gray-800 border-gray-700 text-white' 
        : 'bg-white border-gray-200 text-gray-900';
    case 'ขาด':
      return isDark 
        ? 'bg-red-950/40 border-red-900/60 text-red-200' 
        : 'bg-red-50 border-red-200 text-red-900';
    case 'สาย':
      return isDark 
        ? 'bg-yellow-950/40 border-yellow-900/60 text-yellow-200' 
        : 'bg-yellow-50 border-yellow-200 text-yellow-900';
    case 'ลาป่วย':
      return isDark 
        ? 'bg-emerald-950/40 border-emerald-900/60 text-emerald-200' 
        : 'bg-emerald-50 border-emerald-200 text-emerald-900';
    case 'ลากิจ':
      return isDark 
        ? 'bg-fuchsia-950/40 border-fuchsia-900/60 text-fuchsia-200' 
        : 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-900';
    case 'กิจกรรม':
      return isDark 
        ? 'bg-sky-950/40 border-sky-900/60 text-sky-200' 
        : 'bg-sky-50 border-sky-200 text-sky-900';
    case 'หนี':
      return isDark 
        ? 'bg-orange-950/40 border-orange-900/60 text-orange-200' 
        : 'bg-orange-50 border-orange-200 text-orange-900';
    default:
      return isDark 
        ? 'bg-gray-700/50 border-gray-600 text-gray-300' 
        : 'bg-gray-50 border-gray-100 text-gray-500';
  }
}

function SchedulesContent() {
  const { userAccount } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isDark, setIsDark] = useState(false);
  const [subjects, setSubjects] = useState<SubjectData[]>([]);
  const [students, setStudents] = useState<StudentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<SubjectData | null>(null);
  const [filteredStudents, setFilteredStudents] = useState<StudentData[]>([]);
  const [nowMinutes, setNowMinutes] = useState(getNowMinutes());
  const [teacherConfig, setTeacherConfig] = useState<any>(null);
  
  // Attendance state
  const [isAttendanceMode, setIsAttendanceMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState(formatDateForInput(new Date()));
  const [selectedHours, setSelectedHours] = useState(1);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [fromSection, setFromSection] = useState<'current' | 'all'>('current');
  const [paramsProcessed, setParamsProcessed] = useState(false);
  const [attendanceSummaries, setAttendanceSummaries] = useState<Record<string, any>>({});
  const [todayAttendance, setTodayAttendance] = useState<AttendanceData[]>([]);
  
  // Load todayAttendance from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('NEXORE_TODAY_ATTENDANCE');
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
      localStorage.setItem('NEXORE_TODAY_ATTENDANCE', JSON.stringify({
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

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Update current time every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setNowMinutes(getNowMinutes()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function loadData() {
      if (userAccount?.schoolFirebaseConfig && userAccount?.userId) {
        try {
          const [allSubjects, allStudents, teacherData] = await Promise.all([
            schoolDatabaseService.getAllSubjects(userAccount.schoolFirebaseConfig),
            schoolDatabaseService.getAllStudents(userAccount.schoolFirebaseConfig),
            schoolDatabaseService.getTeacherConfig(userAccount.schoolFirebaseConfig, userAccount.userId),
          ]);
          const teacherSubjects = allSubjects.filter(s => s.teacherId === userAccount.userId);
          setSubjects(teacherSubjects);
          setStudents(allStudents);
          setTeacherConfig(teacherData);

          // Fetch today's attendance to filter currently teaching subjects
          if (teacherData?.firebaseConfig) {
            const todayFormatted = formatDate(new Date());
            const attendance = await teacherDatabaseService.getAttendanceByDate(
              teacherData.firebaseConfig,
              todayFormatted
            );
            setTodayAttendance(attendance);
          }
        } catch (error) {
          console.error('Error loading data:', error);
        } finally {
          setLoading(false);
        }
      }
    }
    loadData();
  }, [userAccount]);

  // Current subjects: show 15 min before start, hide 180 min after start
  // Also filter out subjects that have already been checked today
  const todayThai = getCurrentDayThai();
  const currentSubjects = subjects.filter(s => {
    if (s.day !== todayThai) return false;
    const range = parseTimeRange(s.time);
    if (!range) return false;
    
    // 1. Check time range (show from 15 mins before start up to 180 mins after start)
    const isInTime = nowMinutes >= range.startMinutes - 15 && nowMinutes <= range.startMinutes + 180;
    if (!isInTime) return false;

    // 2. Check if already checked today
    const alreadyChecked = todayAttendance.some(att => 
      att.subjectId === s.subjectId && 
      att.classroom === s.classroom
    );

    return !alreadyChecked;
  }).sort((a, b) => a.time.localeCompare(b.time));

  // Handle mode=attendance and subjectId query parameters
  useEffect(() => {
    const mode = searchParams.get('mode');
    const subjectId = searchParams.get('subjectId');
    
    if (!loading && !paramsProcessed) {
      if (subjectId) {
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
  const loadSummaries = async (subject?: SubjectData, studentsList?: StudentData[]) => {
    const targetSubject = subject || selectedSubject;
    const targetStudents = studentsList || filteredStudents;
    
    if (targetSubject && targetStudents.length > 0) {
      try {
        const firebaseConfig = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
        if (!firebaseConfig) return;

        let allAttendance: AttendanceData[] = [];
        if (teacherConfig?.firebaseConfig) {
          allAttendance = await teacherDatabaseService.getAttendanceBySubject(
            teacherConfig.firebaseConfig,
            targetSubject.subjectId,
            targetSubject.classroom
          );
        } else {
          allAttendance = await schoolDatabaseService.getAttendanceBySubject(
            userAccount!.schoolFirebaseConfig,
            targetSubject.subjectId,
            targetSubject.classroom
          );
        }

        const summaries: Record<string, any> = {};
        for (const student of targetStudents) {
          let present = 0;
          let absent = 0;
          let late = 0;
          let sickLeave = 0;
          let personalLeave = 0;
          let activity = 0;
          let skipped = 0;
          let total = 0;

          allAttendance.forEach((att: any) => {
            const record = att.records?.find((r: any) => r.studentId === student.studentId);
            if (record && record.status) {
              const hours = Number(att.hours) || 1;
              total += hours;
              
              if (record.status === 'มา') {
                present += hours;
              } else if (record.status === 'ขาด') {
                absent += hours;
              } else if (record.status === 'สาย') {
                late += hours;
              } else if (record.status === 'ลาป่วย') {
                sickLeave += hours;
              } else if (record.status === 'ลากิจ') {
                personalLeave += hours;
              } else if (record.status === 'กิจกรรม') {
                activity += hours;
              } else if (record.status === 'หนี') {
                skipped += hours;
              }
            }
          });

          // percentage = (มา + สาย + กิจกรรม) / ทั้งหมด
          const totalPresentHours = present + late + activity;
          const percentage = total > 0 ? Math.round((totalPresentHours / total) * 100) : 0;
          summaries[student.studentId] = { present, absent, late, sickLeave, personalLeave, activity, skipped, total, percentage };
        }
        setAttendanceSummaries(summaries);
      } catch (error) {
        console.error('Error loading attendance summaries:', error);
      }
    }
  };

  // Load attendance summaries when subject is selected or teacher configuration changes
  useEffect(() => {
    loadSummaries();
  }, [selectedSubject, filteredStudents, teacherConfig]);

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

  const handleSelectSubject = async (subject: SubjectData, section: 'current' | 'all' = 'current') => {
    setSelectedSubject(subject);
    setFromSection(section);
    const matched = students
      .filter(s => s.class === subject.classroom)
      .sort((a, b) => {
        const numA = parseInt(a.number) || 0;
        const numB = parseInt(b.number) || 0;
        return numA - numB;
      });
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
    // Handle both direct subject parameter and click event
    const targetSubject = (subject && 'subjectId' in subject) ? subject : selectedSubject;
    const targetStudents = studentList || filteredStudents;
    if (!targetSubject) return;
    
    // Use teacher's Firebase config if available, otherwise use school config (for admin teachers)
    const firebaseConfig = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
    
    if (!firebaseConfig) {
      alert('ไม่พบ Firebase Config กรุณาติดต่อผู้ดูแลระบบ');
      return;
    }
    
    setIsAttendanceMode(true);
    setLoadingAttendance(true);
    
    try {
      // Convert selectedDate from YYYY-MM-DD to "Mon 23/5" format
      const formattedDate = parseInputDateToFormat(selectedDate);
      const existingAttendance = await teacherDatabaseService.getAttendance(
        firebaseConfig,
        targetSubject.subjectId,
        targetSubject.classroom,
        formattedDate
      );
      
      if (existingAttendance) {
        setAttendanceRecords(existingAttendance.records);
        setSelectedHours(existingAttendance.hours);
      } else {
        // Initialize empty records
        const initialRecords: AttendanceRecord[] = targetStudents.map(s => ({
          studentId: s.studentId,
          name: s.name,
          number: s.number,
          status: ''
        }));
        setAttendanceRecords(initialRecords);
      }
    } catch (error) {
      console.error('Error loading attendance:', error);
      const initialRecords: AttendanceRecord[] = targetStudents.map(s => ({
        studentId: s.studentId,
        name: s.name,
        number: s.number,
        status: ''
      }));
      setAttendanceRecords(initialRecords);
    } finally {
      setLoadingAttendance(false);
    }
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
    if (!selectedSubject) return;
    
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
      const attendanceData: AttendanceData = {
        subjectId: selectedSubject.subjectId,
        subjectName: selectedSubject.subjectName || '',
        classroom: selectedSubject.classroom,
        date: formattedDate,
        hours: Number(selectedHours) || 1,
        records: attendanceRecords,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      await teacherDatabaseService.saveAttendance(firebaseConfig, attendanceData);
      alert('บันทึกเช็คชื่อสำเร็จ');
      
      // Update todayAttendance state after successful save
      const todayFormatted = formatDate(new Date());
      if (formattedDate === todayFormatted) {
        setTodayAttendance(prev => {
          const filtered = prev.filter(att => 
            !(att.subjectId === attendanceData.subjectId && att.classroom === attendanceData.classroom)
          );
          return [...filtered, attendanceData];
        });
      }
      
      if (fromSection === 'current') {
        handleBackToMain();
      } else {
        // Reload summaries before returning to student list
        await loadSummaries(selectedSubject, filteredStudents);
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
  }, [selectedDate]);

  const handleBackToMain = () => {
    setSelectedSubject(null);
    setIsAttendanceMode(false);
    router.replace('/teacher/dashboard/schedules');
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg animate-pulse`}>
            <div className={`h-8 w-48 rounded-lg mb-4 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className={`h-20 rounded-xl ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
          </div>
          <div className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg animate-pulse`}>
            <div className={`h-8 w-40 rounded-lg mb-4 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className={`h-16 rounded-xl ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
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
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setSelectedSubjectsForDownload(allUniqueSubjects.map(s => `${s.subjectName}|||${s.classroom}`));
                      setShowDownloadModal(true);
                    }}
                    disabled={allUniqueSubjects.length === 0}
                    className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold shadow-xl transition-all ${
                      isDark 
                        ? 'bg-emerald-600 text-white shadow-emerald-900/20 hover:bg-emerald-500' 
                        : 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-600'
                    } disabled:opacity-50`}
                  >
                    <FileDown size={18} />
                    ดาวน์โหลด
                  </motion.button>
                </div>
              </div>
              
              {allUniqueSubjects.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {allUniqueSubjects.map((subject) => (
                      <motion.div
                        key={`${subject.subjectName}-${subject.classroom}`}
                        whileHover={{ scale: 1.01, y: -2 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => handleSelectSubject(subject, 'all')}
                        className={`p-4 rounded-xl cursor-pointer ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} transition-colors`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {subject.subjectName}
                            </div>
                            <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                              ห้อง {subject.classroom}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectSubject(subject, 'all');
                                handleOpenAttendance(subject);
                              }}
                              className={`p-2 rounded-xl ${isDark ? 'bg-green-600/20 text-green-400' : 'bg-green-100 text-green-700'}`}
                            >
                              <ClipboardList size={20} />
                            </motion.button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={`flex flex-col items-center justify-center py-20 rounded-[3rem] border-2 border-dashed ${
                  isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDark ? 'bg-gray-700' : 'bg-white shadow-md'}`}>
                    <ClipboardList className="opacity-20" size={32} />
                  </div>
                  <p className={`text-lg font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    ไม่พบวิชาที่สอน
                  </p>
                </div>
              )}
              {/* Download Modal */}
              <AnimatePresence>
                {showDownloadModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 20 }}
                      className={`w-full max-w-lg rounded-3xl p-6 shadow-2xl ${isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}`}
                    >
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                          <div className={`p-2 rounded-xl ${isDark ? 'bg-blue-900/30' : 'bg-blue-50'}`}>
                            <Download className="text-blue-500" size={24} />
                          </div>
                          <h3 className="text-xl font-bold">ดาวน์โหลดรายงานเช็คชื่อ</h3>
                        </div>
                        <button 
                          onClick={() => setShowDownloadModal(false)}
                          className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                        >
                          <X size={20} />
                        </button>
                      </div>

                      <div className="space-y-6">
                        {/* Subject Selection */}
                        <div>
                          <label className="block text-sm font-bold mb-3 opacity-70">เลือกวิชาที่ต้องการ</label>
                          <div className={`max-h-48 overflow-y-auto rounded-2xl p-2 border ${isDark ? 'bg-gray-900/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                            {allUniqueSubjects.map((subject) => {
                              const key = `${subject.subjectName}|||${subject.classroom}`;
                              const isSelected = selectedSubjectsForDownload.includes(key);
                              return (
                                <label 
                                  key={key}
                                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                                    isSelected 
                                      ? (isDark ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600') 
                                      : (isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100')
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
                                    className="w-5 h-5 rounded-lg border-2 border-gray-400 text-blue-600 focus:ring-blue-500"
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
                                  ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                                  : (isDark ? 'border-gray-700 bg-gray-900/30' : 'border-gray-200 bg-gray-50')
                              }`}
                            >
                              ตลอดเทอม
                            </button>
                            <button
                              onClick={() => setDownloadRange('month')}
                              className={`p-3 rounded-2xl border-2 font-bold transition-all ${
                                downloadRange === 'month'
                                  ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                                  : (isDark ? 'border-gray-700 bg-gray-900/30' : 'border-gray-200 bg-gray-50')
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
                                className={`flex-1 p-3 rounded-2xl border ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}
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
                                className={`w-32 p-3 rounded-2xl border ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}
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
                            className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${
                              isDownloading || selectedSubjectsForDownload.length === 0
                                ? 'bg-gray-500 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'
                            }`}
                          >
                            {isDownloading ? (
                              <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <FileDown size={22} />
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
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : isAttendanceMode ? (
            <motion.div
              key="attendance"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
            >
              {/* Fixed Dock */}
              <div className={`sticky top-0 z-10 -mx-6 px-6 py-4 mb-6 border-b ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
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
                    className={`p-2 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                  >
                    <ChevronLeft size={24} />
                  </motion.button>
                  <div className="flex-1">
                    <h1 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      เช็คชื่อ: {selectedSubject.subjectName}
                    </h1>
                    <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      ห้อง {selectedSubject.classroom}
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
                    className={`px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                  />
                  
                  {/* Hours dropdown */}
                  <select
                    value={selectedHours}
                    onChange={(e) => setSelectedHours(parseInt(e.target.value))}
                    className={`px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
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
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${loadingAttendance ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${isDark ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}
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
                    return (
                      <motion.div
                        key={record.studentId}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${statusClass}`}
                      >
                        <span className="w-12 text-center font-medium opacity-80">
                          {record.number}
                        </span>
                        <span className="flex-1 font-bold">
                          {record.name}
                        </span>
                        <select
                          value={record.status}
                          onChange={(e) => handleStatusChange(record.studentId, e.target.value)}
                          className={`px-3 py-2 rounded-lg border text-sm font-semibold transition-all ${
                            isDark 
                              ? 'bg-gray-800 border-gray-600 text-white focus:ring-2 focus:ring-blue-500' 
                              : 'bg-white border-gray-300 text-gray-900 focus:ring-2 focus:ring-blue-500'
                          }`}
                        >
                          <option value="">เลือก</option>
                          <option value="มา">มา</option>
                          <option value="ขาด">ขาด</option>
                          <option value="สาย">สาย</option>
                          <option value="ลาป่วย">ลาป่วย</option>
                          <option value="ลากิจ">ลากิจ</option>
                          <option value="กิจกรรม">กิจกรรม</option>
                          <option value="หนี">หนี</option>
                        </select>
                      </motion.div>
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
              className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
            >
              <div className="flex items-center gap-3 mb-6">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleBackToMain}
                  className={`p-2 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
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
                    className={`p-2 rounded-xl ${isDark ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'}`}
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
                      <tr className={isDark ? 'border-b border-gray-600' : 'border-b border-gray-200'}>
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
                          className={isDark ? 'border-b border-gray-700' : 'border-b border-gray-100'}
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
