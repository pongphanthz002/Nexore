'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, Fragment } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService, SubjectData, StudentData } from '@/services/school-database.service';
import { 
  teacherDatabaseService, AttendanceRecord, AttendanceData, 
  GradeConfig, Assignment, AssignmentGroup, StudentScore, GradeThreshold 
} from '@/services/teacher-database.service';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { 
  ChevronLeft, Clock, Users, ClipboardList, Save, CheckCircle2, 
  FileDown, Download, X, Calendar, Plus, Edit2, Trash2, Settings, 
  Info, AlertCircle, TrendingUp, BookOpen, Folder, FolderOpen,
  Eye, EyeOff, MoreVertical, GraduationCap, Target, Layers, Sparkles
} from 'lucide-react';
import { animate } from 'framer-motion';

// --- CountUp Component ---
const CountUp = ({ value, duration = 1.0 }: { value: string | number, duration?: number }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const num = parseFloat(value.toString()) || 0;
    const controls = animate(0, num, {
      duration: duration,
      ease: "easeOut",
      onUpdate(value) {
        setCount(value);
      }
    });
    return () => controls.stop();
  }, [value, duration]);

  return <span>{count % 1 === 0 ? count : count.toFixed(1)}</span>;
};

export default function GradesPage() {
  const { userAccount } = useAuth();
  const [isDark, setIsDark] = useState(false);
  const [subjects, setSubjects] = useState<SubjectData[]>([]);
  const [students, setStudents] = useState<StudentData[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<SubjectData | null>(null);
  const [filteredStudents, setFilteredStudents] = useState<StudentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [teacherConfig, setTeacherConfig] = useState<any>(null);

  // Grade Management State
  const [showGradeConfigModal, setShowGradeConfigModal] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentGroups, setAssignmentGroups] = useState<AssignmentGroup[]>([]);
  const [studentScores, setStudentScores] = useState<StudentScore[]>([]);
  const [gradeConfig, setGradeConfig] = useState<GradeConfig | null>(null);
  const [loadingGrades, setLoadingGrades] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AssignmentGroup | null>(null);
  const [isScoreEditing, setIsScoreEditing] = useState(false);
  const [originalScores, setOriginalScores] = useState<StudentScore[]>([]);
  const [selectedGroupAssignments, setSelectedGroupAssignments] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<AssignmentGroup | null>(null);
  const [isGroupScoreEditing, setIsGroupScoreEditing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [selectedClassroomForDownload, setSelectedClassroomForDownload] = useState<string>('all');
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
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
        } catch (error) {
          console.error('Error loading data:', error);
        } finally {
          setLoading(false);
        }
      }
    }
    loadData();
  }, [userAccount]);

  const [nowMinutes, setNowMinutes] = useState(0);

  useEffect(() => {
    const getNowMinutes = () => {
      const now = new Date();
      return now.getHours() * 60 + now.getMinutes();
    };
    setNowMinutes(getNowMinutes());
    const interval = setInterval(() => setNowMinutes(getNowMinutes()), 30000);
    return () => clearInterval(interval);
  }, []);

  const getCurrentDayThai = () => {
    const dayMap: Record<number, string> = {
      0: 'อาทิตย์', 1: 'จันทร์', 2: 'อังคาร', 3: 'พุธ', 4: 'พฤหัสบดี', 5: 'ศุกร์', 6: 'เสาร์',
    };
    return dayMap[new Date().getDay()] || '';
  };

  const parseTimeRange = (time: string) => {
    if (!time) return null;
    const normalized = time.replace(/\./g, ':').replace(/\s+/g, '');
    const parts = normalized.split('-');
    if (parts.length < 1) return null;
    const startPart = parts[0];
    const startSplit = startPart.split(':');
    if (startSplit.length < 2) return null;
    const startH = parseInt(startSplit[0]);
    const startM = parseInt(startSplit[1]);
    if (isNaN(startH) || isNaN(startM)) return null;
    return { startMinutes: startH * 60 + startM };
  };

  const handleDownloadAllGrades = async (classroomFilter?: string) => {
    const subjectsToDownload = classroomFilter && classroomFilter !== 'all'
      ? subjects.filter(s => s.classroom === classroomFilter)
      : subjects;

    if (subjectsToDownload.length === 0) {
      alert('ไม่มีข้อมูลวิชาที่จะดาวน์โหลด');
      return;
    }
    setIsDownloading(true);
    try {
      const firebaseConfig = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
      if (!firebaseConfig) throw new Error('Firebase configuration not found');

      const dbService = teacherConfig?.firebaseConfig ? teacherDatabaseService : schoolDatabaseService;
      const workbook = new ExcelJS.Workbook();

      for (const subject of subjectsToDownload) {
        try {
          // Fetch all data for this subject
          const [assignmentsList, groupsList, scoresList, configResult] = await Promise.all([
            dbService.getAssignments(firebaseConfig, subject.subjectId, subject.classroom),
            dbService.getAssignmentGroups(firebaseConfig, subject.subjectId, subject.classroom),
            dbService.getStudentScores(firebaseConfig, subject.subjectId, subject.classroom),
            dbService.getGradeConfig(firebaseConfig, subject.subjectId)
          ]);

          const studentsInClass = students
            .filter(s => s.class === subject.classroom)
            .sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0));

          if (studentsInClass.length === 0) continue;

          // Ensure we have a config for calculations with proper thresholds
          const currentGradeConfig = configResult || {
            subjectId: subject.subjectId,
            proportions: { collected: 60, midterm: 20, final: 20 },
            thresholds: [
              { grade: '4', minScore: 80, color: 'text-green-500' },
              { grade: '3.5', minScore: 75, color: 'text-green-500' },
              { grade: '3', minScore: 70, color: 'text-green-500' },
              { grade: '2.5', minScore: 65, color: 'text-yellow-500' },
              { grade: '2', minScore: 60, color: 'text-yellow-500' },
              { grade: '1.5', minScore: 55, color: 'text-orange-500' },
              { grade: '1', minScore: 50, color: 'text-orange-500' },
              { grade: '0', minScore: 0, color: 'text-red-500' }
            ],
            updatedAt: new Date()
          };

          const sheetName = `${subject.subjectName} (${subject.classroom})`.substring(0, 31).replace(/[:\\/?*[\]]/g, '_');
          const worksheet = workbook.addWorksheet(sheetName);

          // Define columns and headers
          const headerRow1: any[] = ['เลขที่', 'ชื่อ'];
          const headerRow2: any[] = ['', ''];
          
          // Helper to find scores
          const findScore = (studentId: string) => scoresList.find(s => s.studentId === studentId);

          // Add Grouped Assignments
          groupsList.forEach(group => {
            const groupAsms = assignmentsList.filter(a => a.groupId === group.id && a.isVisible);
            groupAsms.forEach(a => {
              headerRow1.push(group.name);
              headerRow2.push(`${a.title} (เต็ม ${a.maxScore})`);
            });
            headerRow1.push(group.name);
            headerRow2.push(`คะแนนสุทธิ (ทอนเหลือ ${group.rawScore})`);
          });

          // Add Ungrouped VISIBLE assignments
          const ungroupedVisible = assignmentsList.filter(a => !a.groupId && a.isVisible);
          ungroupedVisible.forEach(a => {
            headerRow1.push('งานทั่วไป');
            headerRow2.push(`${a.title} (เต็ม ${a.maxScore})`);
          });

          // Summary headers
          const summaryHeaders = ['คะแนนเก็บรวม', 'กลางภาค', 'ปลายภาค', 'รวมทั้งหมด', 'เกรด'];
          summaryHeaders.forEach(h => {
            headerRow1.push('สรุปคะแนน');
            headerRow2.push(h);
          });

          const row1 = worksheet.addRow(headerRow1);
          const row2 = worksheet.addRow(headerRow2);

          // Styling headers
          [row1, row2].forEach(row => {
            row.eachCell((cell) => {
              cell.font = { bold: true };
              cell.alignment = { vertical: 'middle', horizontal: 'center' };
              cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
              };
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'F3F4F6' }
              };
            });
          });

          // Add Student Data
          studentsInClass.forEach(student => {
            const score = findScore(student.studentId);
            const rowData: any[] = [student.number, student.name];

            // Add Grouped Scores
            groupsList.forEach(group => {
              const groupAsms = assignmentsList.filter(a => a.groupId === group.id && a.isVisible);
              groupAsms.forEach(a => {
                rowData.push(score?.assignmentScores?.[a.id] || 0);
              });
              
              // Calculate Group Net Score
              const totalMax = groupAsms.reduce((sum, a) => sum + a.maxScore, 0);
              const studentRaw = groupAsms.reduce((sum, a) => sum + (score?.assignmentScores?.[a.id] || 0), 0);
              const normalized = totalMax > 0 ? (studentRaw / totalMax) * group.rawScore : 0;
              rowData.push(Math.round(normalized * 100) / 100);
            });

            // Add Ungrouped Scores
            ungroupedVisible.forEach(a => {
              rowData.push(score?.assignmentScores?.[a.id] || 0);
            });

            // Calculate Summary
            const calcLocalScore = () => {
              let groupedPoints = 0;
              groupsList.forEach(group => {
                const gAsms = assignmentsList.filter(a => a.groupId === group.id && a.isVisible);
                if (gAsms.length > 0) {
                  const tMax = gAsms.reduce((sum, a) => sum + a.maxScore, 0);
                  const sRaw = gAsms.reduce((sum, a) => sum + (score?.assignmentScores?.[a.id] || 0), 0);
                  if (tMax > 0) groupedPoints += (sRaw / tMax) * group.rawScore;
                }
              });
              const ugPoints = assignmentsList.filter(a => !a.groupId && a.isVisible).reduce((sum, a) => sum + (score?.assignmentScores?.[a.id] || 0), 0);
              const finalCol = groupedPoints + ugPoints;
              const mt = score?.midtermScore || 0;
              const fn = score?.finalScore || 0;
              const tot = Math.round((finalCol + mt + fn) * 100) / 100;
              return { total: tot, collected: finalCol, midterm: mt, final: fn };
            };

            const breakdown = calcLocalScore();
            
            // Calculate grade using the same logic as getGradeFromScore
            const calculateGrade = (totalScore: number, config: any) => {
              if (!config || !config.thresholds) return '0';
              const threshold = config.thresholds
                .sort((a: any, b: any) => b.minScore - a.minScore)
                .find((t: any) => totalScore >= t.minScore);
              return threshold ? threshold.grade : '0';
            };

            rowData.push(
              Math.round(breakdown.collected * 100) / 100, 
              score?.midtermScore || 0, 
              score?.finalScore || 0, 
              breakdown.total, 
              calculateGrade(breakdown.total, currentGradeConfig)
            );

            const dataRow = worksheet.addRow(rowData);
            dataRow.eachCell((cell) => {
              cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
              };
            });
          });

          // Apply Styling for Groups (Orange colors)
          let currentCol = 3; // Starting after No. and Name
          groupsList.forEach(group => {
            const groupAsms = assignmentsList.filter(a => a.groupId === group.id && a.isVisible);
            
            // Individual assignments in group (Light Orange)
            groupAsms.forEach(() => {
              worksheet.getColumn(currentCol).eachCell((cell, rowNumber) => {
                if (rowNumber > 0) {
                  cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF7ED' } // Orange-50
                  };
                }
              });
              currentCol++;
            });

            // Group Net Score column (Orange)
            worksheet.getColumn(currentCol).eachCell((cell, rowNumber) => {
              if (rowNumber > 0) {
                cell.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: 'FFEDD5' } // Orange-100
                };
                if (rowNumber > 2) cell.font = { bold: true };
              }
            });
            currentCol++;
          });

          // Adjust column widths
          worksheet.columns.forEach(column => {
            column.width = 15;
          });
          worksheet.getColumn(1).width = 8;
          worksheet.getColumn(2).width = 25;

        } catch (subjectError) {
          console.error(`Error processing subject ${subject.subjectName}:`, subjectError);
        }
      }

      if (workbook.worksheets.length === 0) {
        throw new Error('ไม่มีข้อมูลวิชาที่จะดาวน์โหลด');
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Nexore_Grades_Report_${new Date().toLocaleDateString('th-TH').replace(/\//g, '-')}.xlsx`);

    } catch (error) {
      console.error('Error downloading grades:', error);
      alert('เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSelectSubject = async (subject: SubjectData) => {
    setSelectedSubject(subject);
    const matched = students
      .filter(s => s.class === subject.classroom)
      .sort((a, b) => {
        const numA = parseInt(a.number) || 0;
        const numB = parseInt(b.number) || 0;
        return numA - numB;
      });
    setFilteredStudents(matched);
    
    // Load grading data
    await handleOpenGrades(subject, matched);
  };

  const handleOpenGrades = async (targetSubject: SubjectData, targetStudents: StudentData[]) => {
    const firebaseConfig = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
    if (!firebaseConfig) return;

    setLoadingGrades(true);
    try {
      const dbService = teacherConfig?.firebaseConfig ? teacherDatabaseService : schoolDatabaseService;
      
      const [config, assignmentsList, groupsList, scoresList] = await Promise.all([
        dbService.getGradeConfig(firebaseConfig, targetSubject.subjectId),
        dbService.getAssignments(firebaseConfig, targetSubject.subjectId, targetSubject.classroom),
        dbService.getAssignmentGroups(firebaseConfig, targetSubject.subjectId, targetSubject.classroom),
        dbService.getStudentScores(firebaseConfig, targetSubject.subjectId, targetSubject.classroom)
      ]);

      if (config) {
        setGradeConfig(config);
      } else {
        const defaultConfig: GradeConfig = {
          subjectId: targetSubject.subjectId,
          proportions: { collected: 60, midterm: 20, final: 20 },
          thresholds: [
            { grade: '4', minScore: 80, color: 'text-green-500' },
            { grade: '3.5', minScore: 75, color: 'text-green-400' },
            { grade: '3', minScore: 70, color: 'text-emerald-500' },
            { grade: '2.5', minScore: 65, color: 'text-emerald-400' },
            { grade: '2', minScore: 60, color: 'text-yellow-500' },
            { grade: '1.5', minScore: 55, color: 'text-yellow-400' },
            { grade: '1', minScore: 50, color: 'text-orange-500' },
            { grade: '0', minScore: 0, color: 'text-red-500' }
          ],
          updatedAt: new Date()
        };
        setGradeConfig(defaultConfig);
      }

      setAssignments(assignmentsList);
      setAssignmentGroups(groupsList);
      setStudentScores(scoresList);
    } catch (error) {
      console.error('Error loading grade data:', error);
    } finally {
      setLoadingGrades(false);
    }
  };

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId) 
        : [...prev, groupId]
    );
  };

  const getGroupScore = (studentId: string, group: AssignmentGroup) => {
    const score = studentScores.find(s => s.studentId === studentId);
    if (!score) return 0;
    
    const groupAssignments = assignments.filter(a => a.groupId === group.id && a.isVisible);
    if (groupAssignments.length === 0) return 0;
    
    const totalMax = groupAssignments.reduce((sum, a) => sum + a.maxScore, 0);
    const studentRaw = groupAssignments.reduce((sum, a) => sum + (score.assignmentScores[a.id] || 0), 0);
    
    if (totalMax === 0) return 0;
    const normalized = (studentRaw / totalMax) * group.rawScore;
    return Math.round(normalized * 100) / 100;
  };

  const handleSaveGradeConfig = async (newConfig: GradeConfig) => {
    const firebaseConfig = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
    if (!firebaseConfig) return;

    try {
      const dbService = teacherConfig?.firebaseConfig ? teacherDatabaseService : schoolDatabaseService;
      await dbService.saveGradeConfig(firebaseConfig, newConfig);
      setGradeConfig(newConfig);
      setShowGradeConfigModal(false);
      alert('บันทึกการตั้งค่าคะแนนสำเร็จ');
    } catch (error) {
      console.error('Error saving grade config:', error);
      alert('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
    }
  };

  const calculateDetailedStudentScore = (studentId: string) => {
    if (!gradeConfig) return { total: 0, collected: 0, midterm: 0, final: 0, isExceeding: false };
    
    const score = studentScores.find(s => s.studentId === studentId);
    if (!score) return { total: 0, collected: 0, midterm: 0, final: 0, isExceeding: false };

    // 1. Calculate Grouped Scores (Normalized to Group rawScore)
    let groupedPoints = 0;
    assignmentGroups.forEach(group => {
      const groupAssignments = assignments.filter(a => a.groupId === group.id && a.isVisible);
      if (groupAssignments.length > 0) {
        const totalMax = groupAssignments.reduce((sum, a) => sum + a.maxScore, 0);
        const studentRaw = groupAssignments.reduce((sum, a) => sum + (score.assignmentScores[a.id] || 0), 0);
        if (totalMax > 0) {
          groupedPoints += (studentRaw / totalMax) * group.rawScore;
        }
      }
    });

    // 2. Calculate Ungrouped Scores (Raw Points - NO NORMALIZATION)
    // As per requirement: "Direct Sum" for ungrouped assignments
    const ungroupedAssignments = assignments.filter(a => !a.groupId && a.isVisible);
    const ungroupedPoints = ungroupedAssignments.reduce((sum, a) => sum + (score.assignmentScores[a.id] || 0), 0);
    
    // finalCollected is the direct sum of normalized group points and raw ungrouped points
    let finalCollected = groupedPoints + ungroupedPoints;
    
    // Check if exceeding collected proportion
    const isExceeding = finalCollected > gradeConfig.proportions.collected;

    // 3. Midterm and Final (Direct Raw Scores)
    const midterm = score.midtermScore;
    const final = score.finalScore;
    
    const total = Math.round((finalCollected + midterm + final) * 100) / 100;
    
    return {
      total,
      collected: Math.round(finalCollected * 100) / 100,
      midterm,
      final,
      isExceeding
    };
  };

  const getGradeFromScore = (totalScore: number, config?: GradeConfig | null) => {
    const targetConfig = config || gradeConfig;
    if (!targetConfig) return '0';
    const threshold = targetConfig.thresholds
      .sort((a, b) => b.minScore - a.minScore)
      .find(t => totalScore >= t.minScore);
    return threshold ? threshold.grade : '0';
  };

  const getGradeColor = (grade: string) => {
    if (!gradeConfig) return 'text-gray-500';
    const threshold = gradeConfig.thresholds.find(t => t.grade === grade);
    return threshold ? threshold.color : 'text-gray-500';
  };

  const handleScoreChange = (studentId: string, type: 'midterm' | 'final' | 'assignment', value: string, assignmentId?: string) => {
    const numericValue = Math.max(0, parseFloat(value) || 0);
    setStudentScores(prev => {
      const existing = prev.find(s => s.studentId === studentId);
      if (existing) {
        return prev.map(s => {
          if (s.studentId === studentId) {
            if (type === 'midterm') return { ...s, midtermScore: numericValue, updatedAt: new Date() };
            if (type === 'final') return { ...s, finalScore: numericValue, updatedAt: new Date() };
            if (type === 'assignment' && assignmentId) {
              return { 
                ...s, 
                assignmentScores: { ...s.assignmentScores, [assignmentId]: numericValue },
                updatedAt: new Date()
              };
            }
          }
          return s;
        });
      } else {
        const newScore: StudentScore = {
          studentId,
          subjectId: selectedSubject?.subjectId || '',
          classroom: selectedSubject?.classroom || '',
          assignmentScores: type === 'assignment' && assignmentId ? { [assignmentId]: numericValue } : {},
          midtermScore: type === 'midterm' ? numericValue : 0,
          finalScore: type === 'final' ? numericValue : 0,
          updatedAt: new Date()
        };
        return [...prev, newScore];
      }
    });
  };

  const handleToggleEdit = () => {
    if (!isScoreEditing) {
      setOriginalScores([...studentScores]);
    }
    setIsScoreEditing(!isScoreEditing);
  };

  const handleCancelEdit = () => {
    setStudentScores(originalScores);
    setIsScoreEditing(false);
  };

  const handleSaveAllScores = async () => {
    const firebaseConfig = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
    if (!firebaseConfig) return;
    setLoadingGrades(true);
    try {
      const dbService = teacherConfig?.firebaseConfig ? teacherDatabaseService : schoolDatabaseService;
      await Promise.all(studentScores.map(score => dbService.saveStudentScore(firebaseConfig, score)));
      setIsScoreEditing(false);
      alert('บันทึกคะแนนทั้งหมดสำเร็จ');
    } catch (error) {
      console.error('Error saving scores:', error);
      alert('เกิดข้อผิดพลาดในการบันทึกคะแนน');
    } finally {
      setLoadingGrades(false);
    }
  };

  const handleToggleVisibility = async (assignment: Assignment) => {
    const firebaseConfig = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
    if (!firebaseConfig) return;
    try {
      const dbService = teacherConfig?.firebaseConfig ? teacherDatabaseService : schoolDatabaseService;
      const updated = { ...assignment, isVisible: !assignment.isVisible, updatedAt: new Date() };
      await dbService.saveAssignment(firebaseConfig, updated);
      setAssignments(prev => prev.map(a => a.id === assignment.id ? updated : a));
    } catch (error) {
      console.error('Error toggling visibility:', error);
    }
  };

  const handleMoveToGroup = async (assignmentId: string, groupId: string) => {
    const firebaseConfig = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
    if (!firebaseConfig) return;
    try {
      const dbService = teacherConfig?.firebaseConfig ? teacherDatabaseService : schoolDatabaseService;
      const assignment = assignments.find(a => a.id === assignmentId);
      if (!assignment) return;

      const updated = { ...assignment, groupId, updatedAt: new Date() };
      await dbService.saveAssignment(firebaseConfig, updated);
      setAssignments(prev => prev.map(a => a.id === assignmentId ? updated : a));
      
      // Also update groups
      setAssignmentGroups(prev => prev.map(g => {
        if (g.id === groupId) {
          return { ...g, assignmentIds: Array.from(new Set([...g.assignmentIds, assignmentId])) };
        }
        if (g.id === assignment.groupId) {
          return { ...g, assignmentIds: g.assignmentIds.filter(id => id !== assignmentId) };
        }
        return g;
      }));
    } catch (error) {
      console.error('Error moving assignment:', error);
      alert('เกิดข้อผิดพลาดในการย้ายกลุ่ม');
    }
  };

  const handleSaveAssignment = async (data: Partial<Assignment>) => {
    const firebaseConfig = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
    if (!firebaseConfig || !selectedSubject) return;
    try {
      const dbService = teacherConfig?.firebaseConfig ? teacherDatabaseService : schoolDatabaseService;
      const newAssignment: Assignment = {
        id: editingAssignment?.id || `asm_${Date.now()}`,
        subjectId: selectedSubject.subjectId,
        classroom: selectedSubject.classroom,
        title: data.title || '',
        description: data.description || '',
        deadline: data.deadline || '',
        maxScore: data.maxScore || 0,
        groupId: data.groupId || '',
        isVisible: data.isVisible ?? editingAssignment?.isVisible ?? true,
        createdAt: editingAssignment?.createdAt || new Date(),
        updatedAt: new Date()
      };
      await dbService.saveAssignment(firebaseConfig, newAssignment);
      setAssignments(prev => {
        const index = prev.findIndex(a => a.id === newAssignment.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = newAssignment;
          return updated;
        }
        return [...prev, newAssignment];
      });
      setShowAssignmentModal(false);
      setEditingAssignment(null);
    } catch (error) {
      console.error('Error saving assignment:', error);
      alert('เกิดข้อผิดพลาดในการบันทึกชิ้นงาน');
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบชิ้นงานนี้?')) return;
    const firebaseConfig = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
    if (!firebaseConfig) return;
    try {
      const dbService = teacherConfig?.firebaseConfig ? teacherDatabaseService : schoolDatabaseService;
      await dbService.deleteAssignment(firebaseConfig, id);
      setAssignments(prev => prev.filter(a => a.id !== id));
    } catch (error) {
      console.error('Error deleting assignment:', error);
      alert('เกิดข้อผิดพลาดในการลบชิ้นงาน');
    }
  };

  const handleSaveGroup = async (data: Partial<AssignmentGroup>) => {
    const firebaseConfig = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
    if (!firebaseConfig || !selectedSubject) return;
    try {
      const dbService = teacherConfig?.firebaseConfig ? teacherDatabaseService : schoolDatabaseService;
      const newGroup: AssignmentGroup = {
        id: editingGroup?.id || `grp_${Date.now()}`,
        subjectId: selectedSubject.subjectId,
        classroom: selectedSubject.classroom,
        name: data.name || '',
        rawScore: data.rawScore || 0,
        assignmentIds: data.assignmentIds || [],
        createdAt: editingGroup?.createdAt || new Date(),
        updatedAt: new Date()
      };
      await dbService.saveAssignmentGroup(firebaseConfig, newGroup);
      const updatedAssignments = await Promise.all(assignments.map(async (a) => {
        const isInGroup = newGroup.assignmentIds.includes(a.id);
        const wasInGroup = a.groupId === newGroup.id;
        if (isInGroup && a.groupId !== newGroup.id) {
          const updated = { ...a, groupId: newGroup.id };
          await dbService.saveAssignment(firebaseConfig, updated);
          return updated;
        } else if (!isInGroup && wasInGroup) {
          const updated = { ...a, groupId: '' };
          await dbService.saveAssignment(firebaseConfig, updated);
          return updated;
        }
        return a;
      }));
      setAssignments(updatedAssignments);
      setAssignmentGroups(prev => {
        const index = prev.findIndex(g => g.id === newGroup.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = newGroup;
          return updated;
        }
        return [...prev, newGroup];
      });
      setShowGroupModal(false);
      setEditingGroup(null);
    } catch (error) {
      console.error('Error saving group:', error);
      alert('เกิดข้อผิดพลาดในการบันทึกกลุ่ม');
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบกลุ่มนี้? (ชิ้นงานในกลุ่มจะยังคงอยู่แต่จะถูกแยกออกมา)')) return;
    const firebaseConfig = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
    if (!firebaseConfig) return;
    try {
      const dbService = teacherConfig?.firebaseConfig ? teacherDatabaseService : schoolDatabaseService;
      await dbService.deleteAssignmentGroup(firebaseConfig, id);
      const updatedAssignments = await Promise.all(assignments.map(async (a) => {
        if (a.groupId === id) {
          const updated = { ...a, groupId: '' };
          await dbService.saveAssignment(firebaseConfig, updated);
          return updated;
        }
        return a;
      }));
      setAssignments(updatedAssignments);
      setAssignmentGroups(prev => prev.filter(g => g.id !== id));
    } catch (error) {
      console.error('Error deleting group:', error);
      alert('เกิดข้อผิดพลาดในการลบกลุ่ม');
    }
  };

  // Group subjects by unique subjectName + classroom, then sort by classroom
  const uniqueSubjects = subjects
    .reduce((acc, subject) => {
      const key = `${subject.subjectName}-${subject.classroom}`;
      if (!acc.find(s => `${s.subjectName}-${s.classroom}` === key)) {
        acc.push(subject);
      }
      return acc;
    }, [] as SubjectData[])
    .sort((a, b) => a.classroom.localeCompare(b.classroom, 'th'));

  // Group by classroom for section headers
  const groupedByClassroom = uniqueSubjects.reduce((acc, subject) => {
    if (!acc[subject.classroom]) acc[subject.classroom] = [];
    acc[subject.classroom].push(subject);
    return acc;
  }, {} as Record<string, SubjectData[]>);

  const sortedClassrooms = Object.keys(groupedByClassroom).sort((a, b) => a.localeCompare(b, 'th'));

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg animate-pulse`}>
            <div className={`h-8 w-40 rounded-lg mb-4 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className={`h-20 rounded-xl ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
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
              key="subjects"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className={`text-3xl font-black ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight`}>
                    จัดการคะแนน
                  </h1>
                  <p className={`text-sm mt-1 font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    เลือกวิชาที่ต้องการจัดการคะแนนและเกรด
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowDownloadModal(true)}
                    disabled={subjects.length === 0}
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

              {/* Section 1: Currently teaching */}
              {uniqueSubjects.filter(s => {
                const day = getCurrentDayThai();
                if (s.day !== day) return false;
                const range = parseTimeRange(s.time);
                if (!range) return false;
                return nowMinutes >= range.startMinutes - 15 && nowMinutes <= range.startMinutes + 180;
              }).length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock size={22} className={isDark ? 'text-green-400' : 'text-green-600'} />
                    <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      วิชาที่กำลังสอนอยู่
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {uniqueSubjects.filter(s => {
                      const day = getCurrentDayThai();
                      if (s.day !== day) return false;
                      const range = parseTimeRange(s.time);
                      if (!range) return false;
                      return nowMinutes >= range.startMinutes - 15 && nowMinutes <= range.startMinutes + 180;
                    }).map((subject) => (
                      <motion.div
                        key={`current-${subject.subjectName}-${subject.classroom}`}
                        whileHover={{ scale: 1.01, y: -2 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => handleSelectSubject(subject)}
                        className={`p-4 rounded-xl cursor-pointer border-2 ${
                          isDark 
                            ? 'bg-green-900/30 border-green-700 hover:bg-green-900/50' 
                            : 'bg-green-50 border-green-300 hover:bg-green-100'
                        } transition-colors`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`text-center min-w-[80px] p-2 rounded-lg ${isDark ? 'bg-green-800/50' : 'bg-green-200'}`}>
                            <div className={`text-sm font-bold ${isDark ? 'text-green-300' : 'text-green-800'}`}>
                              {subject.time}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className={`font-bold text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {subject.subjectName}
                            </div>
                            <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                              ห้อง {subject.classroom}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {uniqueSubjects.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {uniqueSubjects.map((subject) => (
                      <motion.div
                        key={`${subject.subjectName}-${subject.classroom}`}
                        whileHover={{ scale: 1.01, y: -2 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => handleSelectSubject(subject)}
                        className={`p-4 rounded-xl cursor-pointer transition-all border-2 ${
                          isDark 
                            ? 'bg-gray-800 border-gray-700 hover:border-blue-500/50 hover:bg-gray-750' 
                            : 'bg-gray-50 border-gray-100 hover:border-blue-200 hover:bg-white hover:shadow-lg hover:shadow-blue-500/5'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                              isDark ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'
                            }`}>
                              <ClipboardList size={24} />
                            </div>
                            <div>
                              <div className={`font-bold text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {subject.subjectName}
                              </div>
                              <div className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                ห้อง {subject.classroom}
                              </div>
                            </div>
                          </div>
                          <ChevronLeft className="rotate-180 opacity-30" size={20} />
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
                    <BookOpen className="opacity-20" size={32} />
                  </div>
                  <p className={`text-lg font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    ไม่พบวิชาที่สอน
                  </p>
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
                  onClick={() => {
                    if (isScoreEditing) {
                      handleCancelEdit();
                    } else if (selectedGroup) {
                      setSelectedGroup(null);
                    } else {
                      setSelectedSubject(null);
                    }
                  }}
                  className={`p-2 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                >
                  <ChevronLeft size={24} />
                </motion.button>
                <div>
                  <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {selectedGroup ? `กลุ่ม: ${selectedGroup.name}` : selectedSubject.subjectName}
                  </h1>
                  <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    {selectedGroup ? `ทอนเหลือ ${selectedGroup.rawScore} คะแนน` : `ห้อง ${selectedSubject.classroom} | ${filteredStudents.length} คน`}
                  </p>
                </div>
                {!selectedGroup && isScoreEditing && (
                  <div className="ml-auto flex items-center gap-2">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowGradeConfigModal(true)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        isDark 
                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Settings size={18} />
                      ตั้งค่าเกรด
                    </motion.button>
                  </div>
                )}
              </div>

              {/* Statistics Overview */}
              {!selectedGroup && (
                <div className="mb-6 relative">
                  {loadingGrades && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 dark:bg-gray-800/50 backdrop-blur-[1px] rounded-2xl">
                      <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 rounded-xl shadow-lg">
                        <div className="w-5 h-5 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm font-bold">กำลังโหลดข้อมูล...</span>
                      </div>
                    </div>
                  )}
                  {/* แสดงเฉพาะสัดส่วนคะแนน */}
                  <div className={`p-4 rounded-2xl ${isDark ? 'bg-blue-900/20 border border-blue-900/30' : 'bg-blue-50 border border-blue-100'}`}>
                    <div className="flex items-center gap-2 mb-1 text-sm font-bold text-blue-500 uppercase tracking-wider">
                      <TrendingUp size={16} />
                      สัดส่วนคะแนน
                    </div>
                    <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      เก็บ: {gradeConfig?.proportions.collected}% | กลาง: {gradeConfig?.proportions.midterm}% | ปลาย: {gradeConfig?.proportions.final}%
                    </div>
                  </div>
                </div>
              )}

              {/* Assignment Management Buttons */}
              <div className="flex flex-wrap gap-3 mb-6">
                {!isScoreEditing ? (
                  <>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleToggleEdit}
                      className="flex items-center gap-2 px-6 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-500/20 ml-auto"
                    >
                      <Edit2 size={18} />
                      กรอกคะแนน
                    </motion.button>
                  </>
                ) : (
                  <>
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border ${isDark ? 'border-amber-500/50 text-amber-500 bg-amber-500/10' : 'border-amber-200 text-amber-600 bg-amber-50'}`}>
                      <Info size={18} />
                      กำลังอยู่ในโหมดกรอกคะแนน
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setEditingAssignment(null);
                          setShowAssignmentModal(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20"
                      >
                        <Plus size={18} />
                        เพิ่มชิ้นงาน
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setEditingGroup(null);
                          setShowGroupModal(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-500/20"
                      >
                        <Settings size={18} />
                        จัดการกลุ่มคะแนน
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowGradeConfigModal(true)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                          isDark 
                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <Settings size={18} />
                        ตั้งค่าเกรด
                      </motion.button>
                    </div>

                    <div className="ml-auto flex gap-2">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleCancelEdit}
                        className={`flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold transition-all ${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        ยกเลิก
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleSaveAllScores}
                        disabled={loadingGrades}
                        className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20"
                      >
                        <Save size={18} />
                        บันทึกคะแนนทั้งหมด
                      </motion.button>
                    </div>
                  </>
                )}
              </div>

              {filteredStudents.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className={isDark ? 'border-b border-gray-600' : 'border-b border-gray-200'}>
                        <th className={`sticky left-0 z-20 py-3 px-4 text-left text-sm font-medium ${isDark ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-600'}`}>เลขที่</th>
                        <th className={`sticky left-12 z-20 py-3 px-4 text-left text-sm font-medium border-r ${isDark ? 'bg-gray-800 text-gray-300 border-gray-700' : 'bg-white text-gray-600 border-gray-100'}`}>ชื่อ</th>
                        
                        {!selectedGroup && (
                          <>
                            <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>เกรด</th>
                            <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>คะแนนรวม</th>
                            
                            {isScoreEditing && (
                              <>
                                <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>เก็บ ({gradeConfig?.proportions.collected})</th>
                                <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>กลางภาค ({gradeConfig?.proportions.midterm})</th>
                                <th className={`py-3 px-4 text-center text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>ปลายภาค ({gradeConfig?.proportions.final})</th>
                                
                                {/* Assignment Groups (Folders) */}
                                {assignmentGroups.map(group => (
                                  <th key={group.id} className={`py-3 px-4 text-center text-xs font-bold whitespace-nowrap min-w-[120px] transition-all relative ${
                                    isDark 
                                      ? 'bg-purple-900/10 text-purple-400 border-x border-purple-500/20' 
                                      : 'bg-purple-50 text-purple-600 border-x border-purple-100'
                                  }`}>
                                    <div className={`absolute top-0 left-0 w-full h-1 ${isDark ? 'bg-purple-500/30' : 'bg-purple-200'}`} />
                                    <button 
                                      onClick={() => setSelectedGroup(group)}
                                      className="flex items-center justify-center gap-2 w-full hover:scale-105 transition-transform"
                                    >
                                      <Folder size={16} />
                                      <div className="flex flex-col items-center">
                                        <span className="max-w-[100px] overflow-hidden text-ellipsis">{group.name}</span>
                                        <span className="text-[9px] opacity-70 uppercase tracking-tighter">ทอนเหลือ {group.rawScore}</span>
                                      </div>
                                    </button>
                                  </th>
                                ))}

                                {/* Ungrouped Assignments */}
                                {assignments.filter(a => !a.groupId).map(a => (
                                  <th key={a.id} className={`py-3 px-2 text-center text-xs font-medium whitespace-nowrap min-w-[120px] group relative transition-all ${
                                    isDark ? 'text-gray-300 border-b border-gray-700' : 'text-gray-700 border-b border-gray-100'
                                  } ${!a.isVisible ? 'opacity-40 grayscale' : ''}`}>
                                    <div className="flex flex-col items-center gap-1">
                                      <div className="flex items-center gap-1">
                                        <span className="max-w-[80px] overflow-hidden text-ellipsis font-bold">{a.title}</span>
                                        <button 
                                          onClick={() => handleToggleVisibility(a)}
                                          className={`p-1 rounded-full transition-colors ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                                        >
                                          {a.isVisible ? <Eye size={12} className="text-blue-500" /> : <EyeOff size={12} className="text-gray-400" />}
                                        </button>
                                      </div>
                                      <span className="opacity-50 text-[10px]">เต็ม {a.maxScore}</span>
                                      
                                      <div className="flex items-center gap-1 mt-1">
                                        <button 
                                          onClick={() => {
                                            setEditingAssignment(a);
                                            setShowAssignmentModal(true);
                                          }}
                                          className="p-1.5 bg-blue-500/10 text-blue-500 rounded-lg hover:bg-blue-500 hover:text-white transition-all"
                                        >
                                          <Edit2 size={10} />
                                        </button>
                                        
                                        <div className="relative group/menu">
                                          <button className="p-1.5 bg-gray-500/10 text-gray-500 rounded-lg hover:bg-gray-500 hover:text-white transition-all">
                                            < MoreVertical size={10} />
                                          </button>
                                          <div className={`absolute top-full left-1/2 -translate-x-1/2 mt-1 hidden group-hover/menu:block z-[60] min-w-[140px] rounded-xl shadow-xl border p-1 ${
                                            isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
                                          }`}>
                                            <div className="text-[8px] font-black uppercase opacity-50 px-2 py-1">ย้ายกลุ่ม</div>
                                            {assignmentGroups.map(g => (
                                              <button 
                                                key={g.id}
                                                onClick={() => handleMoveToGroup(a.id, g.id)}
                                                className={`w-full text-left px-2 py-1.5 rounded-lg text-[10px] hover:bg-purple-500/10 hover:text-purple-500 transition-colors ${a.groupId === g.id ? 'bg-purple-500/10 text-purple-500 font-bold' : ''}`}
                                              >
                                                {g.name}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      </div>

                                      {(a.description || a.deadline) && (
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 rounded-lg bg-gray-900 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-xl border border-gray-700 text-left">
                                          {a.description && <div className="mb-1">{a.description}</div>}
                                          {a.deadline && <div className="text-blue-400">กำหนดส่ง: {new Date(a.deadline).toLocaleDateString('th-TH')}</div>}
                                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900"></div>
                                        </div>
                                      )}
                                    </div>
                                  </th>
                                ))}
                              </>
                            )}
                          </>
                        )}

                        {selectedGroup && (
                          <>
                            <th className={`py-3 px-4 text-center text-sm font-bold bg-purple-500/10 text-purple-500 border-x border-purple-500/20`}>
                              คะแนนทอน ({selectedGroup.rawScore})
                            </th>
                            {assignments.filter(a => a.groupId === selectedGroup.id).map(a => (
                              <th key={a.id} className={`py-3 px-2 text-center text-xs font-medium whitespace-nowrap min-w-[120px] group relative transition-all ${
                                isDark ? 'text-gray-300 border-b border-gray-700' : 'text-gray-700 border-b border-gray-100'
                              } ${!a.isVisible ? 'opacity-40 grayscale' : ''}`}>
                                <div className="flex flex-col items-center gap-1">
                                  <div className="flex items-center gap-1">
                                    <span className="max-w-[80px] overflow-hidden text-ellipsis font-bold">{a.title}</span>
                                    <button 
                                      onClick={() => handleToggleVisibility(a)}
                                      className={`p-1 rounded-full transition-colors ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                                    >
                                      {a.isVisible ? <Eye size={12} className="text-blue-500" /> : <EyeOff size={12} className="text-gray-400" />}
                                    </button>
                                  </div>
                                  <span className="opacity-50 text-[10px]">เต็ม {a.maxScore}</span>
                                  
                                  <div className="flex items-center gap-1 mt-1">
                                    <button 
                                      onClick={() => {
                                        setEditingAssignment(a);
                                        setShowAssignmentModal(true);
                                      }}
                                      className="p-1.5 bg-blue-500/10 text-blue-500 rounded-lg hover:bg-blue-500 hover:text-white transition-all"
                                    >
                                      <Edit2 size={10} />
                                    </button>
                                    
                                    <div className="relative group/menu">
                                      <button className="p-1.5 bg-gray-500/10 text-gray-500 rounded-lg hover:bg-gray-500 hover:text-white transition-all">
                                        <MoreVertical size={10} />
                                      </button>
                                      <div className={`absolute top-full left-1/2 -translate-x-1/2 mt-1 hidden group-hover/menu:block z-[60] min-w-[140px] rounded-xl shadow-xl border p-1 ${
                                        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
                                      }`}>
                                        <div className="text-[8px] font-black uppercase opacity-50 px-2 py-1">ย้ายกลุ่ม</div>
                                        <button 
                                          onClick={() => handleMoveToGroup(a.id, '')}
                                          className={`w-full text-left px-2 py-1.5 rounded-lg text-[10px] hover:bg-red-500/10 hover:text-red-500 transition-colors`}
                                        >
                                          ออกจากกลุ่ม
                                        </button>
                                        {assignmentGroups.filter(g => g.id !== selectedGroup.id).map(g => (
                                          <button 
                                            key={g.id}
                                            onClick={() => handleMoveToGroup(a.id, g.id)}
                                            className={`w-full text-left px-2 py-1.5 rounded-lg text-[10px] hover:bg-purple-500/10 hover:text-purple-500 transition-colors`}
                                          >
                                            {g.name}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </th>
                            ))}
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((student, index) => {
                        const scoreBreakdown = calculateDetailedStudentScore(student.studentId);
                        const grade = getGradeFromScore(scoreBreakdown.total);
                        const gradeColor = getGradeColor(grade);
                        const studentScore = studentScores.find(s => s.studentId === student.studentId);

                        return (
                          <motion.tr
                            key={student.studentId}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.03 }}
                            className={isDark ? 'border-b border-gray-700' : 'border-b border-gray-100'}
                          >
                            <td className={`sticky left-0 z-10 py-3 px-4 text-sm ${isDark ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-700'}`}>{student.number || '-'}</td>
                            <td 
                              className={`sticky left-12 z-10 py-3 px-4 text-sm font-bold border-r cursor-pointer hover:text-blue-500 transition-colors ${isDark ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-100'}`}
                              onClick={() => setSelectedStudent(student)}
                            >
                              {student.name}
                            </td>
                            
                            {!selectedGroup && (
                              <>
                                <td className={`py-3 px-4 text-center text-lg font-black ${gradeColor}`}>
                                  {grade}
                                </td>
                                <td className={`py-3 px-4 text-center text-sm font-black ${isDark ? 'text-white' : 'text-gray-900'}`}>{scoreBreakdown.total}</td>
                                
                                {isScoreEditing && (
                                  <>
                                    <td className={`py-3 px-4 text-center text-sm font-bold transition-colors ${
                                      scoreBreakdown.isExceeding 
                                        ? 'text-red-500 animate-pulse' 
                                        : 'text-blue-500'
                                    }`}>
                                      {scoreBreakdown.collected}
                                      {scoreBreakdown.isExceeding && (
                                        <div className="text-[8px] uppercase font-black text-red-500 -mt-1">
                                          เกิน {gradeConfig?.proportions.collected}
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                      <input
                                        type="number"
                                        value={studentScore?.midtermScore ?? ''}
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => handleScoreChange(student.studentId, 'midterm', e.target.value)}
                                        className={`w-20 h-10 text-base text-center rounded-lg border font-bold ${
                                          isDark 
                                            ? 'bg-gray-700 border-gray-600 focus:border-blue-500 text-white' 
                                            : 'bg-white border-gray-200 focus:border-blue-400 text-gray-900'
                                        } focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all`}
                                      />
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                      <input
                                        type="number"
                                        value={studentScore?.finalScore ?? ''}
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => handleScoreChange(student.studentId, 'final', e.target.value)}
                                        className={`w-20 h-10 text-base text-center rounded-lg border font-bold ${
                                          isDark 
                                            ? 'bg-gray-700 border-gray-600 focus:border-blue-500 text-white' 
                                            : 'bg-white border-gray-200 focus:border-blue-400 text-gray-900'
                                        } focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all`}
                                      />
                                    </td>
                                    {assignmentGroups.map(group => (
                                      <td key={group.id} className={`py-3 px-4 text-center text-sm font-bold border-x transition-colors ${
                                        isDark ? 'bg-purple-900/5 text-purple-400 border-purple-500/10' : 'bg-purple-50/30 text-purple-600 border-purple-100'
                                      }`}>
                                        {getGroupScore(student.studentId, group)}
                                      </td>
                                    ))}

                                    {assignments.filter(a => !a.groupId).map(a => (
                                      <td key={a.id} className={`py-3 px-2 text-center transition-opacity ${!a.isVisible ? 'opacity-40' : ''}`}>
                                        <input
                                          type="number"
                                          value={studentScore?.assignmentScores[a.id] ?? ''}
                                          onFocus={(e) => e.target.select()}
                                          onChange={(e) => handleScoreChange(student.studentId, 'assignment', e.target.value, a.id)}
                                          className={`w-16 h-10 text-base text-center rounded-lg border font-bold ${
                                            isDark 
                                              ? 'bg-gray-700 border-gray-600 focus:border-blue-500 text-white' 
                                              : 'bg-white border-gray-200 focus:border-blue-400 text-gray-900'
                                          } focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all`}
                                        />
                                      </td>
                                    ))}
                                  </>
                                )}
                              </>
                            )}

                            {selectedGroup && (
                              <>
                                <td className={`py-3 px-4 text-center text-sm font-bold border-x bg-purple-500/5 text-purple-500 border-purple-500/10`}>
                                  {getGroupScore(student.studentId, selectedGroup)}
                                </td>
                                {assignments.filter(a => a.groupId === selectedGroup.id).map(a => (
                                  <td key={a.id} className={`py-3 px-2 text-center transition-opacity ${!a.isVisible ? 'opacity-40' : ''}`}>
                                    {isScoreEditing ? (
                                      <input
                                        type="number"
                                        value={studentScore?.assignmentScores[a.id] ?? ''}
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => handleScoreChange(student.studentId, 'assignment', e.target.value, a.id)}
                                        className={`w-16 h-10 text-base text-center rounded-lg border font-bold ${
                                          isDark 
                                            ? 'bg-gray-700 border-gray-600 focus:border-purple-500 text-white' 
                                            : 'bg-white border-gray-200 focus:border-purple-400 text-gray-900'
                                        } focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all`}
                                      />
                                    ) : (
                                      <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                        {a.isVisible ? (studentScore?.assignmentScores[a.id] ?? 0) : '-'}
                                      </span>
                                    )}
                                  </td>
                                ))}
                              </>
                            )}
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  ไม่พบนักเรียนในห้องนี้
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modals for Grade Mode */}
        <AnimatePresence>
          {/* Assignment Modal */}
          {showAssignmentModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className={`w-full max-w-md rounded-3xl p-6 shadow-2xl ${isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}`}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold">{editingAssignment ? 'แก้ไขชิ้นงาน' : 'เพิ่มชิ้นงานใหม่'}</h3>
                  <button onClick={() => setShowAssignmentModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  handleSaveAssignment({
                    title: formData.get('title') as string,
                    description: formData.get('description') as string,
                    deadline: formData.get('deadline') as string,
                    maxScore: parseFloat(formData.get('maxScore') as string),
                    groupId: formData.get('groupId') as string,
                    isVisible: formData.get('isVisible') === 'on',
                  });
                }} className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold mb-2 opacity-70">ชื่อชิ้นงาน</label>
                    <input name="title" defaultValue={editingAssignment?.title} required className={`w-full h-12 px-4 text-base rounded-xl border ${isDark ? 'bg-gray-900 border-gray-700 focus:border-blue-500' : 'bg-gray-50 border-gray-200 focus:border-blue-400'} focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all`} placeholder="เช่น การบ้านครั้งที่ 1" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2 opacity-70">คำอธิบาย (ถ้ามี)</label>
                    <textarea name="description" defaultValue={editingAssignment?.description} className={`w-full p-4 text-base rounded-xl border ${isDark ? 'bg-gray-900 border-gray-700 focus:border-blue-500' : 'bg-gray-50 border-gray-200 focus:border-blue-400'} focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all`} rows={2} placeholder="รายละเอียดเพิ่มเติม..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold mb-2 opacity-70">คะแนนเต็ม</label>
                      <input name="maxScore" type="number" step="any" defaultValue={editingAssignment?.maxScore || 10} required className={`w-full h-12 px-4 text-base rounded-xl border ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} focus:outline-none focus:ring-2 focus:ring-blue-500/20`} />
                    </div>
                    <div>
                      <label className="block text-sm font-bold mb-2 opacity-70">กำหนดส่ง</label>
                      <input name="deadline" type="date" defaultValue={editingAssignment?.deadline} className={`w-full h-12 px-4 text-base rounded-xl border ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} focus:outline-none focus:ring-2 focus:ring-blue-500/20`} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2 opacity-70">กลุ่มคะแนน</label>
                    <select name="groupId" defaultValue={editingAssignment?.groupId || ''} className={`w-full h-12 px-4 text-base rounded-xl border ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none`}>
                      <option value="">ไม่ระบุกลุ่ม (นับเป็นคะแนนดิบโดยตรง)</option>
                      {assignmentGroups.map(g => (
                        <option key={g.id} value={g.id}>{g.name} (ทอนเหลือ {g.rawScore} คะแนน)</option>
                      ))}
                    </select>
                  </div>
                  <div className="pt-4 flex items-center gap-3">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all ${
                        isDark ? 'bg-gray-900 border-gray-700 group-hover:border-blue-500' : 'bg-gray-50 border-gray-200 group-hover:border-blue-400'
                      }`}>
                        <input 
                          name="isVisible" 
                          type="checkbox" 
                          defaultChecked={editingAssignment ? editingAssignment.isVisible : true} 
                          className="w-6 h-6 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500" 
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold uppercase tracking-wider">เปิดการมองเห็น</span>
                        <span className="text-[10px] opacity-50 uppercase tracking-widest font-black">ให้นักเรียนเห็นคะแนนนี้</span>
                      </div>
                    </label>
                  </div>
                  <div className="pt-4 flex gap-3">
                    {editingAssignment && (
                      <button type="button" onClick={() => handleDeleteAssignment(editingAssignment.id)} className="h-14 flex-1 rounded-2xl bg-red-500/10 text-red-500 font-bold hover:bg-red-500/20 transition-all">ลบชิ้นงาน</button>
                    )}
                    <button type="submit" className="h-14 flex-[2] rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20">บันทึกข้อมูล</button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}

          {/* Group Modal */}
          {showGroupModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className={`w-full max-w-2xl rounded-3xl p-6 shadow-2xl ${isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}`}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold">จัดการกลุ่มคะแนน</h3>
                  <button onClick={() => setShowGroupModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                    <X size={20} />
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="font-bold text-sm opacity-70">กลุ่มที่มีอยู่</h4>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                      {assignmentGroups.map(group => (
                        <div key={group.id} className={`p-3 rounded-xl border ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} flex items-center justify-between`}>
                          <div>
                            <div className="font-bold">{group.name}</div>
                            <div className="text-xs opacity-60">ทอนเหลือ {group.rawScore} คะแนน | {group.assignmentIds.length} ชิ้นงาน</div>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => {
                              setEditingGroup(group);
                              setSelectedGroupAssignments(group.assignmentIds);
                            }} className="p-2 hover:bg-blue-500/10 text-blue-500 rounded-lg"><Edit2 size={16} /></button>
                            <button onClick={() => handleDeleteGroup(group.id)} className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      ))}
                      {assignmentGroups.length === 0 && <div className="text-center py-8 opacity-50 text-sm italic">ยังไม่มีกลุ่มคะแนน</div>}
                    </div>
                  </div>

                  <div className={`p-4 rounded-2xl ${isDark ? 'bg-gray-900/50' : 'bg-gray-50'} border ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
                    <h4 className="font-bold text-sm mb-4 flex items-center gap-2">
                      <Plus size={16} className="text-purple-500" />
                      {editingGroup ? 'แก้ไขกลุ่ม' : 'สร้างกลุ่มใหม่'}
                    </h4>
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      handleSaveGroup({
                        name: formData.get('name') as string,
                        rawScore: parseFloat(formData.get('rawScore') as string),
                        assignmentIds: selectedGroupAssignments
                      });
                    }} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold mb-2 opacity-70 uppercase tracking-wider">ชื่อกลุ่ม</label>
                        <input name="name" defaultValue={editingGroup?.name} required className={`w-full h-12 px-4 text-base rounded-xl border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} focus:outline-none focus:ring-2 focus:ring-purple-500/20`} placeholder="เช่น งานเก็บก่อนกลางภาค" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-2 opacity-70 uppercase tracking-wider">คะแนนที่จะทอนให้เหลือ (เช่น 5 หรือ 10)</label>
                        <input name="rawScore" type="number" step="any" defaultValue={editingGroup?.rawScore || 5} required className={`w-full h-12 px-4 text-base rounded-xl border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} focus:outline-none focus:ring-2 focus:ring-purple-500/20`} />
                        <p className="text-[10px] mt-1.5 opacity-50 italic">ระบบจะนำคะแนนดิบของงานทั้งหมดในกลุ่มมารวมกันแล้วหารให้เหลือตามที่กำหนด</p>
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-xs font-bold opacity-70 uppercase tracking-wider">เลือกชิ้นงานเข้ากลุ่ม</label>
                          <div className="text-[10px] font-bold text-purple-500">
                            รวมคะแนนดิบ: {
                              assignments
                                .filter(a => selectedGroupAssignments.includes(a.id))
                                .reduce((sum, a) => sum + a.maxScore, 0)
                            } คะแนน
                          </div>
                        </div>
                        <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 bg-white/5 rounded-xl p-2">
                          {assignments.map(a => (
                            <label key={a.id} className={`flex items-center gap-3 p-3 rounded-xl hover:bg-purple-500/10 cursor-pointer transition-colors border ${isDark ? 'border-transparent' : 'border-gray-100'}`}>
                              <input 
                                type="checkbox" 
                                name={`asm_${a.id}`} 
                                checked={selectedGroupAssignments.includes(a.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedGroupAssignments(prev => [...prev, a.id]);
                                  } else {
                                    setSelectedGroupAssignments(prev => prev.filter(id => id !== a.id));
                                  }
                                }}
                                className="w-5 h-5 rounded-lg border-gray-300 text-purple-600 focus:ring-purple-500" 
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate">{a.title}</div>
                                <div className="text-[10px] opacity-50">เต็ม {a.maxScore} คะแนน</div>
                              </div>
                            </label>
                          ))}
                          {assignments.length === 0 && <div className="text-center py-4 text-xs opacity-50 italic">ยังไม่มีชิ้นงานให้เลือก</div>}
                        </div>
                      </div>
                      <div className="pt-2">
                        <button type="submit" className="w-full h-14 rounded-2xl bg-purple-600 text-white font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2">
                          <Save size={20} />
                          {editingGroup ? 'อัปเดตกลุ่มคะแนน' : 'บันทึกกลุ่มใหม่'}
                        </button>
                        <button type="button" onClick={() => {
                          setShowGroupModal(false);
                          setEditingGroup(null);
                          setSelectedGroupAssignments([]);
                        }} className="w-full h-10 mt-2 text-sm font-bold opacity-50 hover:opacity-100 transition-all">
                          ปิดหน้าต่าง
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </motion.div>
            </div>
          )}

          {/* Grade Config Modal */}
          {showGradeConfigModal && gradeConfig && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className={`w-full max-w-2xl rounded-3xl p-6 shadow-2xl ${isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'} overflow-y-auto max-h-[90vh]`}
              >
                <div className="flex items-center justify-between mb-6 sticky top-0 bg-inherit z-10 py-2">
                  <h3 className="text-xl font-bold">ตั้งค่าการตัดเกรดและสัดส่วนคะแนน</h3>
                  <button onClick={() => setShowGradeConfigModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                    <X size={24} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <h4 className="font-bold text-sm flex items-center gap-2 opacity-70 uppercase tracking-wider">
                      <TrendingUp size={16} className="text-blue-500" />
                      สัดส่วนคะแนนรวม (100%)
                    </h4>
                    <div className="space-y-6 p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/50">
                      <div>
                        <div className="flex justify-between text-sm mb-3 font-bold">
                          <span>คะแนนเก็บ</span>
                          <div className="flex items-center gap-2">
                            <input type="number" value={gradeConfig.proportions.collected} 
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setGradeConfig({ ...gradeConfig, proportions: { ...gradeConfig.proportions, collected: val } });
                              }}
                              className={`w-16 h-8 text-center rounded-lg border text-sm ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`} />
                            <span className="opacity-50">%</span>
                          </div>
                        </div>
                        <input type="range" min="0" max="100" value={gradeConfig.proportions.collected} 
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setGradeConfig({ ...gradeConfig, proportions: { ...gradeConfig.proportions, collected: val } });
                          }}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-3 font-bold">
                          <span>สอบกลางภาค</span>
                          <div className="flex items-center gap-2">
                            <input type="number" value={gradeConfig.proportions.midterm} 
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setGradeConfig({ ...gradeConfig, proportions: { ...gradeConfig.proportions, midterm: val } });
                              }}
                              className={`w-16 h-8 text-center rounded-lg border text-sm ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`} />
                            <span className="opacity-50">%</span>
                          </div>
                        </div>
                        <input type="range" min="0" max="100" value={gradeConfig.proportions.midterm} 
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setGradeConfig({ ...gradeConfig, proportions: { ...gradeConfig.proportions, midterm: val } });
                          }}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-3 font-bold">
                          <span>สอบปลายภาค</span>
                          <div className="flex items-center gap-2">
                            <input type="number" value={gradeConfig.proportions.final} 
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setGradeConfig({ ...gradeConfig, proportions: { ...gradeConfig.proportions, final: val } });
                              }}
                              className={`w-16 h-8 text-center rounded-lg border text-sm ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`} />
                            <span className="opacity-50">%</span>
                          </div>
                        </div>
                        <input type="range" min="0" max="100" value={gradeConfig.proportions.final} 
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setGradeConfig({ ...gradeConfig, proportions: { ...gradeConfig.proportions, final: val } });
                          }}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                      </div>
                      <div className={`p-4 rounded-xl text-center text-base font-black ${
                        (gradeConfig.proportions.collected + gradeConfig.proportions.midterm + gradeConfig.proportions.final) === 100
                          ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                          : 'bg-red-500/10 text-red-500 border border-red-500/20'
                      }`}>
                        รวมสัดส่วน: {gradeConfig.proportions.collected + gradeConfig.proportions.midterm + gradeConfig.proportions.final}%
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-bold text-sm flex items-center gap-2 opacity-70 uppercase tracking-wider">
                      <Settings size={16} className="text-purple-500" />
                      เกณฑ์การตัดเกรด
                    </h4>
                    <div className="space-y-3 p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/50">
                      {gradeConfig.thresholds.map((t, idx) => (
                        <div key={t.grade} className="flex items-center gap-4">
                          <div className={`w-12 h-12 flex items-center justify-center rounded-xl font-black text-xl shadow-sm ${isDark ? 'bg-gray-800' : 'bg-white'} ${t.color}`}>
                            {t.grade}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <input type="number" value={t.minScore} 
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  const newThresholds = [...gradeConfig.thresholds];
                                  newThresholds[idx] = { ...t, minScore: val };
                                  setGradeConfig({ ...gradeConfig, thresholds: newThresholds });
                                }}
                                className={`w-24 h-12 px-4 text-center text-base font-bold rounded-xl border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} focus:outline-none focus:ring-2 focus:ring-purple-500/20`} />
                              <span className="text-sm font-bold opacity-50">คะแนนขึ้นไป</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-8 sticky bottom-0 bg-inherit py-4">
                  <button 
                    disabled={(gradeConfig.proportions.collected + gradeConfig.proportions.midterm + gradeConfig.proportions.final) !== 100}
                    onClick={() => handleSaveGradeConfig(gradeConfig)}
                    className={`w-full h-16 rounded-2xl font-black text-lg transition-all shadow-lg flex items-center justify-center gap-2 ${
                      (gradeConfig.proportions.collected + gradeConfig.proportions.midterm + gradeConfig.proportions.final) === 100
                        ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20'
                        : 'bg-gray-500 text-white cursor-not-allowed opacity-50'
                    }`}
                  >
                    <Save size={24} />
                    บันทึกการตั้งค่าเกรด
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Student Detail Modal */}
          {selectedStudent && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 100 }}
                className={`w-full max-w-2xl h-full md:h-auto md:max-h-[90vh] rounded-none md:rounded-[3rem] shadow-2xl overflow-hidden flex flex-col ${isDark ? 'bg-[#0F172A] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'}`}
              >
                {/* Modal Header */}
                <div className={`p-6 flex items-center justify-between sticky top-0 z-10 ${isDark ? 'bg-[#1E293B]/90 border-[#334155]' : 'bg-white/90 border-slate-100'} border-b backdrop-blur-xl`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? 'bg-indigo-500/20' : 'bg-indigo-50'}`}>
                      <Users className="text-indigo-500" size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold leading-tight">{selectedStudent.name}</h3>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">ข้อมูลคะแนนรายบุคคล</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedStudent(null)} className={`p-3 rounded-2xl ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'} active:scale-95 transition-all`}>
                    <X size={24} />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {(() => {
                    const breakdown = calculateDetailedStudentScore(selectedStudent.studentId);
                    const grade = getGradeFromScore(breakdown.total);
                    const gradeColor = getGradeColor(grade);
                    const score = studentScores.find(s => s.studentId === selectedStudent.studentId);
                    const unsentCount = assignments.filter(a => a.isVisible && !((score?.assignmentScores?.[a.id] || 0) > 0)).length;

                    const mainCardGradient = isDark
                      ? 'bg-gradient-to-br from-[#111827] via-[#1F2937] to-[#030712]'
                      : 'bg-gradient-to-br from-[#3730a3] via-[#1e1b4b] to-[#3730a3]';

                    return (
                      <>
                        {/* Performance Summary Card */}
                        <div className={`rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl ${mainCardGradient} border border-white/5`}>
                          <div className="relative z-10 flex flex-col items-center text-center py-2">
                            <p className="font-bold text-xs uppercase mb-4 opacity-70">เกรดเฉลี่ยปัจจุบัน</p>
                            <div className="relative mb-4">
                              <div className={`absolute inset-0 ${isDark ? 'bg-slate-500' : 'bg-indigo-500'} blur-[60px] opacity-20`}></div>
                              <h2 className="text-8xl font-bold leading-none tracking-tighter text-white drop-shadow-2xl">
                                {grade}
                              </h2>
                            </div>
                            <div className="inline-flex items-center gap-2 bg-white/10 px-4 py-1.5 rounded-full backdrop-blur-md">
                              <p className="text-slate-200 font-bold text-[10px] uppercase leading-none tracking-wider">Performance Status</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 mt-6 pt-6 border-t border-white/10 relative z-10">
                            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/5 text-center">
                              <p className="text-[10px] font-bold text-indigo-300 mb-1 opacity-70 uppercase">คะแนนรวมทั้งหมด</p>
                              <p className="text-2xl font-black"><CountUp value={breakdown.total} /></p>
                            </div>
                            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/5 text-center">
                              <p className="text-[10px] font-bold text-rose-300 mb-1 opacity-70 uppercase">งานค้าง</p>
                              <p className="text-2xl font-black text-rose-400"><CountUp value={unsentCount} duration={0.8} /></p>
                            </div>
                          </div>
                          <Sparkles className="absolute top-4 right-4 w-12 h-12 text-white/10" />
                        </div>

                        {/* Score Breakdown Triplets */}
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { label: 'คะแนนเก็บ', val: breakdown.collected, icon: Layers, color: 'text-blue-500', bg: isDark ? 'bg-blue-500/10' : 'bg-blue-50', border: isDark ? 'border-blue-500/20' : 'border-blue-100' },
                            { label: 'กลางภาค', val: breakdown.midterm, icon: Target, color: 'text-indigo-500', bg: isDark ? 'bg-indigo-500/10' : 'bg-indigo-50', border: isDark ? 'border-indigo-500/20' : 'border-indigo-100' },
                            { label: 'ปลายภาค', val: breakdown.final, icon: GraduationCap, color: 'text-violet-500', bg: isDark ? 'bg-violet-500/10' : 'bg-violet-50', border: isDark ? 'border-violet-500/20' : 'border-violet-100' }
                          ].map((item, i) => (
                            <div key={i} className={`p-4 rounded-2xl border ${item.bg} ${item.border} text-center shadow-sm`}>
                              <p className={`text-2xl font-black ${item.color}`}><CountUp value={item.val} duration={1} /></p>
                              <p className={`text-[10px] font-bold ${item.color} uppercase mt-1 opacity-70`}>{item.label}</p>
                            </div>
                          ))}
                        </div>

                        {/* Detailed Assignments List */}
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 px-2">
                            <ClipboardList className="text-slate-400" size={18} />
                            <h4 className="font-bold text-lg leading-tight">รายละเอียดชิ้นงาน</h4>
                          </div>

                          {/* Grouped Assignments */}
                          {assignmentGroups.map(group => {
                            const groupAsms = assignments.filter(a => a.groupId === group.id && a.isVisible);
                            if (groupAsms.length === 0) return null;
                            const groupScore = getGroupScore(selectedStudent.studentId, group);

                            return (
                              <div key={group.id} className={`rounded-3xl border ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-100'} shadow-sm overflow-hidden`}>
                                <div className={`p-5 flex items-center justify-between ${isDark ? 'bg-indigo-500/5' : 'bg-indigo-50/50'}`}>
                                  <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-indigo-500/20' : 'bg-indigo-50'}`}>
                                      <Folder className="text-indigo-500" size={20} />
                                    </div>
                                    <div>
                                      <h5 className="font-bold">{group.name}</h5>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                        คะแนนทอน: <span className="text-indigo-500 font-black">{groupScore} / {group.rawScore}</span>
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                <div className="p-4 space-y-2">
                                  {groupAsms.map(a => (
                                    <div key={a.id} className={`p-4 rounded-xl border flex items-center justify-between ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200/50'}`}>
                                      <div className="flex-1 min-w-0 pr-4">
                                        <p className={`font-bold text-sm truncate ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{a.title}</p>
                                        {!((score?.assignmentScores?.[a.id] || 0) > 0) && <p className="text-[10px] font-bold text-rose-500 uppercase mt-0.5">ยังไม่ส่ง</p>}
                                      </div>
                                      <div className="text-right shrink-0">
                                        <span className={`font-black text-lg ${(score?.assignmentScores?.[a.id] || 0) > 0 ? 'text-indigo-500' : 'text-rose-500'}`}>
                                          {score?.assignmentScores?.[a.id] || 0}
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">/ {a.maxScore}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}

                          {/* Ungrouped Assignments */}
                          {assignments.filter(a => !a.groupId && a.isVisible).length > 0 && (
                            <div className={`rounded-3xl border ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-100'} shadow-sm overflow-hidden`}>
                              <div className={`p-5 flex items-center justify-between ${isDark ? 'bg-emerald-500/5' : 'bg-emerald-50/50'}`}>
                                <div className="flex items-center gap-4">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-emerald-500/20' : 'bg-emerald-50'}`}>
                                    <Plus className="text-emerald-500" size={20} />
                                  </div>
                                  <h5 className="font-bold">งานทั่วไป (รายชิ้น)</h5>
                                </div>
                              </div>
                              <div className="p-4 space-y-2">
                                {assignments.filter(a => !a.groupId && a.isVisible).map(a => (
                                  <div key={a.id} className={`p-4 rounded-xl border flex items-center justify-between ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200/50'}`}>
                                    <div className="flex-1 min-w-0 pr-4">
                                      <p className={`font-bold text-sm truncate ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{a.title}</p>
                                      {!((score?.assignmentScores?.[a.id] || 0) > 0) && <p className="text-[10px] font-bold text-rose-500 uppercase mt-0.5">ยังไม่ส่ง</p>}
                                    </div>
                                    <div className="text-right shrink-0">
                                      <span className={`font-black text-lg ${(score?.assignmentScores?.[a.id] || 0) > 0 ? 'text-indigo-500' : 'text-rose-500'}`}>
                                        {score?.assignmentScores?.[a.id] || 0}
                                      </span>
                                      <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">/ {a.maxScore}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Footer Info */}
                        <div className="text-center pt-8 pb-4 opacity-40">
                          <p className="text-[10px] font-bold uppercase tracking-widest mb-1">Nexore Education System</p>
                          <p className="text-[10px] font-medium tracking-tight italic">ข้อมูลคะแนน ณ วันที่ {new Date().toLocaleDateString('th-TH')}</p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Download Modal */}
        <AnimatePresence>
          {showDownloadModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setShowDownloadModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className={`w-full max-w-md rounded-3xl shadow-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    เลือกระดับชั้นที่ต้องการดาวน์โหลด
                  </h3>
                  <button
                    onClick={() => setShowDownloadModal(false)}
                    className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setSelectedClassroomForDownload('all');
                      setShowDownloadModal(false);
                      handleDownloadAllGrades('all');
                    }}
                    disabled={isDownloading}
                    className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                      selectedClassroomForDownload === 'all'
                        ? isDark
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400'
                          : 'bg-emerald-50 border-emerald-500 text-emerald-700'
                        : isDark
                          ? 'bg-gray-700/50 border-gray-600 hover:bg-gray-700 text-gray-300'
                          : 'bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700'
                    } disabled:opacity-50`}
                  >
                    <div className="font-bold">ทุกห้องเรียน</div>
                    <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>ดาวน์โหลดข้อมูลทุกระดับชั้น</div>
                  </button>

                  {sortedClassrooms.map((classroom) => (
                    <button
                      key={classroom}
                      onClick={() => {
                        setSelectedClassroomForDownload(classroom);
                        setShowDownloadModal(false);
                        handleDownloadAllGrades(classroom);
                      }}
                      disabled={isDownloading}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                        selectedClassroomForDownload === classroom
                          ? isDark
                            ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400'
                            : 'bg-emerald-50 border-emerald-500 text-emerald-700'
                          : isDark
                            ? 'bg-gray-700/50 border-gray-600 hover:bg-gray-700 text-gray-300'
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700'
                      } disabled:opacity-50`}
                    >
                      <div className="font-bold">ระดับชั้น {classroom}</div>
                      <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {groupedByClassroom[classroom]?.length || 0} วิชา
                      </div>
                    </button>
                  ))}
                </div>

                {isDownloading && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500">
                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    กำลังดาวน์โหลด...
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
