'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService, SubjectData, StudentData } from '@/services/school-database.service';
import {
  teacherDatabaseService, GradeConfig, Assignment, AssignmentGroup, StudentScore
} from '@/services/teacher-database.service';
import type { FirebaseConfig } from '@/types/firebase.types';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import {
  ChevronLeft, ClipboardList, Save, X, Plus, Edit2, Settings,
  TrendingUp, BookOpen, Folder, Users, GraduationCap, Target, Layers, Sparkles,
  Undo2, Redo2, Check, AlertCircle
} from 'lucide-react';
import { animate } from 'framer-motion';
import {
  assignmentIdsInOrder, buildColumns, collectedCapacity, computeBreakdown, defaultGradeConfig,
  getFieldValue, isScored, type ScoreField,
} from '@/lib/grade-calculation';
import { addSubjectSheet } from '@/lib/grade-export';
import { useScoreAutosave, type QueuedScoreCell } from '@/hooks/useScoreAutosave';
import ScoreGrid, { formatScore, type CellEdit, type ScoreGridActions } from '@/components/ScoreGrid';
import MobileScoreEntry from '@/components/MobileScoreEntry';
import GoogleSheetsIcon from '@/components/GoogleSheetsIcon';
import { useTheme } from '@/contexts/ThemeContext';

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

type HistoryEntry = { studentId: string; field: ScoreField; before: number | null; after: number | null };
const MAX_UNDO = 50;
const FINISH_TIMEOUT_MS = 10_000;

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return matches;
}

function withField(score: StudentScore, field: ScoreField, value: number | null): StudentScore {
  const next: StudentScore = { ...score, assignmentScores: { ...(score.assignmentScores || {}) }, updatedAt: new Date() };
  if (field === 'midterm') {
    if (value === null) delete next.midtermScore; else next.midtermScore = value;
  } else if (field === 'final') {
    if (value === null) delete next.finalScore; else next.finalScore = value;
  } else if (value === null) {
    delete next.assignmentScores[field.slice(2)];
  } else {
    next.assignmentScores[field.slice(2)] = value;
  }
  return next;
}

/**
 * Rewrite `order` to the display order (optionally from an explicit id order first),
 * drop groups without assignments and keep each group's `assignmentIds` in sync.
 */
function normalizeStructure(nextAssignments: Assignment[], nextGroups: AssignmentGroup[], idOrder?: string[]) {
  let list = nextAssignments;
  if (idOrder) {
    const pos = new Map(idOrder.map((id, i) => [id, i]));
    list = list.map(a => (pos.has(a.id) ? { ...a, order: pos.get(a.id)! } : a));
  }
  const groups = nextGroups.filter(g => list.some(a => a.groupId === g.id));
  const ids = assignmentIdsInOrder(buildColumns(list, groups));
  const orderOf = new Map(ids.map((id, i) => [id, i]));
  list = list.map(a => ({
    ...a,
    order: orderOf.get(a.id) ?? a.order,
    groupId: a.groupId && groups.some(g => g.id === a.groupId) ? a.groupId : '',
  }));
  const normalizedGroups = groups.map(g => {
    const members = ids.filter(id => list.find(a => a.id === id)?.groupId === g.id);
    return {
      ...g,
      assignmentIds: members,
      scaledPosition: g.scaledPosition === undefined ? undefined : Math.min(g.scaledPosition, members.length),
    };
  });
  return { assignments: list, groups: normalizedGroups };
}

export default function GradesPage() {
  const { userAccount } = useAuth();
  const { isDark } = useTheme();
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
  const [isScoreEditing, setIsScoreEditing] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [invalidCells, setInvalidCells] = useState<Map<string, string>>(new Map());
  const [toast, setToast] = useState<string | null>(null);
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });
  const [isOnline, setIsOnline] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [selectedSubjectsForDownload, setSelectedSubjectsForDownload] = useState<string[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  const isMobile = useMediaQuery('(max-width: 767px)');
  const finePointer = useMediaQuery('(pointer: fine)');

  // Latest values for handlers that run between renders (rapid edits, undo, autosave)
  const scoresRef = useRef(studentScores);
  scoresRef.current = studentScores;
  const structureRef = useRef({ assignments, groups: assignmentGroups });
  structureRef.current = { assignments, groups: assignmentGroups };
  const undoStack = useRef<HistoryEntry[][]>([]);
  const redoStack = useRef<HistoryEntry[][]>([]);

  const gradeDbConfig: FirebaseConfig | undefined = teacherConfig?.firebaseConfig || userAccount?.schoolFirebaseConfig;
  const gradeDbConfigRef = useRef(gradeDbConfig);
  gradeDbConfigRef.current = gradeDbConfig;

  const autosave = useScoreAutosave(async (cells: QueuedScoreCell[]) => {
    const config = gradeDbConfigRef.current;
    if (!config) throw new Error('Firebase configuration not found');
    const bySubject = new Map<string, QueuedScoreCell[]>();
    for (const c of cells) {
      const key = `${c.subjectId}\u0000${c.classroom}`;
      bySubject.set(key, [...(bySubject.get(key) ?? []), c]);
    }
    for (const list of Array.from(bySubject.values())) {
      await teacherDatabaseService.saveScoreCells(config, list[0].subjectId, list[0].classroom, list);
    }
  });

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    async function loadData() {
      if (userAccount?.schoolFirebaseConfig && userAccount?.userId) {
        try {
          // Only this teacher's subjects and the students enrolled in them
          const [teacherSubjects, teacherData] = await Promise.all([
            schoolDatabaseService.getSubjectsForTeacher(userAccount.schoolFirebaseConfig, userAccount.userId),
            schoolDatabaseService.getTeacherConfig(userAccount.schoolFirebaseConfig, userAccount.userId),
          ]);
          const subjectStudents = await schoolDatabaseService.getStudentsForSubjects(userAccount.schoolFirebaseConfig, teacherSubjects);
          setSubjects(teacherSubjects);
          setStudents(subjectStudents);
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

  const studentsForSubject = (subject: SubjectData) => students
    .filter(s => {
      if (subject.subjectType === 'elective' && Array.isArray(subject.studentIds) && subject.studentIds.length > 0) {
        return subject.studentIds.includes(s.studentId);
      }
      return s.class === subject.classroom;
    })
    .sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0));

  const handleDownloadExcel = async () => {
    if (selectedSubjectsForDownload.length === 0) {
      alert('กรุณาเลือกวิชาที่ต้องการดาวน์โหลด');
      return;
    }

    const subjectsToDownload = uniqueSubjects.filter(s =>
      selectedSubjectsForDownload.includes(`${s.subjectId}|||${s.classroom}`)
    );

    if (subjectsToDownload.length === 0) {
      alert('ไม่มีข้อมูลวิชาที่จะดาวน์โหลด');
      return;
    }
    setIsDownloading(true);
    try {
      if (!gradeDbConfig) throw new Error('Firebase configuration not found');
      const workbook = new ExcelJS.Workbook();

      for (const subject of subjectsToDownload) {
        try {
          const studentsInClass = studentsForSubject(subject);
          if (studentsInClass.length === 0) continue;
          const [assignmentsList, groupsList, scoresList, configResult] = await Promise.all([
            teacherDatabaseService.getAssignments(gradeDbConfig, subject.subjectId, subject.classroom),
            teacherDatabaseService.getAssignmentGroups(gradeDbConfig, subject.subjectId, subject.classroom),
            teacherDatabaseService.getStudentScores(gradeDbConfig, subject.subjectId, subject.classroom),
            teacherDatabaseService.getGradeConfig(gradeDbConfig, subject.subjectId)
          ]);
          addSubjectSheet(workbook, {
            subjectName: subject.subjectName,
            classroom: subject.classroom,
            students: studentsInClass,
            assignments: assignmentsList,
            groups: groupsList,
            scores: scoresList,
            config: configResult || defaultGradeConfig(subject.subjectId),
          });
        } catch (subjectError) {
          console.error(`Error processing subject ${subject.subjectName}:`, subjectError);
        }
      }

      if (workbook.worksheets.length === 0) {
        throw new Error('ไม่มีข้อมูลวิชาที่จะดาวน์โหลด');
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `รายงานคะแนน_${new Date().toLocaleDateString('th-TH').replace(/\//g, '-')}.xlsx`);
      setShowDownloadModal(false);

    } catch (error) {
      console.error('Error downloading grades:', error);
      alert('เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSelectSubject = async (subject: SubjectData) => {
    setSelectedSubject(subject);
    const matched = studentsForSubject(subject);
    setFilteredStudents(matched);
    await handleOpenGrades(subject);
  };

  const handleOpenGrades = async (targetSubject: SubjectData) => {
    if (!gradeDbConfig) return;

    setLoadingGrades(true);
    setInvalidCells(new Map());
    undoStack.current = [];
    redoStack.current = [];
    setHistorySize({ undo: 0, redo: 0 });
    try {
      const [config, assignmentsList, groupsList, scoresList] = await Promise.all([
        teacherDatabaseService.getGradeConfig(gradeDbConfig, targetSubject.subjectId),
        teacherDatabaseService.getAssignments(gradeDbConfig, targetSubject.subjectId, targetSubject.classroom),
        teacherDatabaseService.getAssignmentGroups(gradeDbConfig, targetSubject.subjectId, targetSubject.classroom),
        teacherDatabaseService.getStudentScores(gradeDbConfig, targetSubject.subjectId, targetSubject.classroom)
      ]);

      setGradeConfig(config || defaultGradeConfig(targetSubject.subjectId));

      // Older assignments have no column order yet: fix it once to the order they show in
      let list = assignmentsList;
      if (list.some(a => typeof a.order !== 'number')) {
        list = normalizeStructure(list, groupsList).assignments;
        teacherDatabaseService.updateAssignments(gradeDbConfig, list.map(a => ({ id: a.id, fields: { order: a.order } })))
          .catch(err => console.error('Error saving assignment order:', err));
      }

      setAssignments(list);
      setAssignmentGroups(groupsList);
      setStudentScores(scoresList);
    } catch (error) {
      console.error('Error loading grade data:', error);
    } finally {
      setLoadingGrades(false);
    }
  };

  // ---------------------------------------------------------------- score edits

  const applyScoreChanges = (changes: CellEdit[], mode: 'edit' | 'history') => {
    if (!selectedSubject) return [];
    const byId = new Map(scoresRef.current.map(s => [s.studentId, s]));
    const applied: HistoryEntry[] = [];
    for (const change of changes) {
      const existing = byId.get(change.studentId);
      const before = getFieldValue(existing, change.field) ?? null;
      if (before === change.value) continue;
      const base: StudentScore = existing ?? {
        studentId: change.studentId,
        subjectId: selectedSubject.subjectId,
        classroom: selectedSubject.classroom,
        assignmentScores: {},
        updatedAt: new Date(),
      };
      byId.set(change.studentId, withField(base, change.field, change.value));
      applied.push({ studentId: change.studentId, field: change.field, before, after: change.value });
    }
    if (applied.length === 0) return applied;

    const next = Array.from(byId.values());
    scoresRef.current = next;
    setStudentScores(next);
    autosave.queue(applied.map(h => ({
      studentId: h.studentId,
      field: h.field,
      value: h.after,
      subjectId: selectedSubject.subjectId,
      classroom: selectedSubject.classroom,
    })));
    if (mode === 'edit') {
      undoStack.current = [...undoStack.current, applied].slice(-MAX_UNDO);
      redoStack.current = [];
      setHistorySize({ undo: undoStack.current.length, redo: 0 });
    }
    return applied;
  };

  const handleScoreEdits = (edits: CellEdit[]) => { applyScoreChanges(edits, 'edit'); };

  const handleInvalid = (entries: Array<{ key: string; text: string | null }>) => {
    setInvalidCells(prev => {
      const next = new Map(prev);
      for (const { key, text } of entries) {
        if (text === null) next.delete(key); else next.set(key, text);
      }
      return next;
    });
  };

  const stepHistory = (direction: 'undo' | 'redo') => {
    const from = direction === 'undo' ? undoStack : redoStack;
    const to = direction === 'undo' ? redoStack : undoStack;
    const entry = from.current[from.current.length - 1];
    if (!entry) return;
    from.current = from.current.slice(0, -1);
    applyScoreChanges(entry.map(h => ({
      studentId: h.studentId,
      field: h.field,
      value: direction === 'undo' ? h.before : h.after,
    })), 'history');
    to.current = [...to.current, entry].slice(-MAX_UNDO);
    handleInvalid(entry.map(h => ({ key: `${h.studentId}|${h.field}`, text: null })));
    setHistorySize({ undo: undoStack.current.length, redo: redoStack.current.length });
  };

  const handleStartEditing = () => {
    setInvalidCells(new Map());
    setIsScoreEditing(true);
  };

  const handleFinishEditing = async () => {
    if (invalidCells.size > 0 && !confirm(`มี ${invalidCells.size} ช่องที่คะแนนไม่ถูกต้องและยังไม่ได้บันทึก ออกจากโหมดกรอกคะแนนเลยไหม?`)) return;
    setIsFinishing(true);
    const saved = await Promise.race([
      autosave.flush(),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), FINISH_TIMEOUT_MS)),
    ]);
    setIsFinishing(false);
    if (!saved) {
      alert('ยังบันทึกคะแนนไม่ครบ ระบบจะลองบันทึกต่อให้อัตโนมัติ กรุณาตรวจสอบอินเทอร์เน็ตแล้วกด "เสร็จสิ้น" อีกครั้ง');
      return;
    }
    setInvalidCells(new Map());
    setIsScoreEditing(false);
  };

  // ---------------------------------------------------------------- columns and groups

  /** Apply a new assignment/group structure locally, then save only what changed. */
  const persistStructure = async (next: { assignments: Assignment[]; groups: AssignmentGroup[] }) => {
    if (!gradeDbConfig) return;
    const prev = structureRef.current;
    structureRef.current = next;
    setAssignments(next.assignments);
    setAssignmentGroups(next.groups);

    const assignmentUpdates = next.assignments.flatMap(a => {
      const p = prev.assignments.find(x => x.id === a.id);
      if (!p || (p.order === a.order && (p.groupId || '') === (a.groupId || ''))) return [];
      return [{ id: a.id, fields: { order: a.order, groupId: a.groupId || '' } }];
    });
    const groupsToSave = next.groups.filter(g => {
      const p = prev.groups.find(x => x.id === g.id);
      return !p || p.name !== g.name || p.rawScore !== g.rawScore || p.scaledPosition !== g.scaledPosition
        || p.assignmentIds.join() !== g.assignmentIds.join();
    });
    const groupsToDelete = prev.groups.filter(p => !next.groups.some(g => g.id === p.id));

    try {
      await Promise.all([
        assignmentUpdates.length ? teacherDatabaseService.updateAssignments(gradeDbConfig, assignmentUpdates) : null,
        ...groupsToSave.map(g => teacherDatabaseService.saveAssignmentGroup(gradeDbConfig, g)),
        ...groupsToDelete.map(g => teacherDatabaseService.deleteAssignmentGroup(gradeDbConfig, g.id)),
      ]);
    } catch (error) {
      console.error('Error saving columns:', error);
      alert('บันทึกการจัดคอลัมน์ไม่สำเร็จ กำลังโหลดข้อมูลล่าสุด');
      if (selectedSubject) handleOpenGrades(selectedSubject);
    }
  };

  const displayOrder = () => {
    const { assignments: list, groups } = structureRef.current;
    return assignmentIdsInOrder(buildColumns(list, groups));
  };

  const gridActions: ScoreGridActions = {
    editAssignment: a => { setEditingAssignment(a); setShowAssignmentModal(true); },
    setVisibility: (ids, visible) => { handleSetVisibility(ids, visible); },
    groupAssignments: (ids, name, rawScore) => {
      if (!selectedSubject || ids.length === 0) return;
      const { assignments: list, groups } = structureRef.current;
      const groupId = `grp_${Date.now()}`;
      const moved = list.filter(a => ids.includes(a.id) && a.groupId && groups.some(g => g.id === a.groupId));

      // Gather the selected assignments where the first of them is
      const order = displayOrder();
      const selected = order.filter(id => ids.includes(id));
      const insertAt = order.slice(0, order.indexOf(selected[0])).filter(id => !ids.includes(id)).length;
      const idOrder = order.filter(id => !ids.includes(id));
      idOrder.splice(insertAt, 0, ...selected);

      const newGroup: AssignmentGroup = {
        id: groupId,
        subjectId: selectedSubject.subjectId,
        classroom: selectedSubject.classroom,
        name,
        rawScore,
        assignmentIds: selected,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      persistStructure(normalizeStructure(
        list.map(a => (ids.includes(a.id) ? { ...a, groupId } : a)),
        [...groups, newGroup],
        idOrder,
      ));
      if (moved.length) {
        setToast(moved.map(a => `ย้าย '${a.title}' ออกจากกลุ่ม ${groups.find(g => g.id === a.groupId)?.name}`).join(' · '));
      }
    },
    editGroup: (group, name, rawScore) => {
      const { assignments: list, groups } = structureRef.current;
      persistStructure({ assignments: list, groups: groups.map(g => (g.id === group.id ? { ...g, name, rawScore } : g)) });
    },
    removeFromGroup: a => {
      const { assignments: list, groups } = structureRef.current;
      const order = displayOrder().filter(id => id !== a.id);
      const lastMember = [...order].reverse().find(id => list.find(x => x.id === id)?.groupId === a.groupId);
      order.splice(lastMember ? order.indexOf(lastMember) + 1 : order.length, 0, a.id);
      persistStructure(normalizeStructure(list.map(x => (x.id === a.id ? { ...x, groupId: '' } : x)), groups, order));
    },
    ungroup: group => {
      if (!confirm(`ยกเลิกกลุ่ม "${group.name}"? งานในกลุ่มยังอยู่ครบ แต่จะไม่ถูกทอนคะแนนอีก`)) return;
      const { assignments: list, groups } = structureRef.current;
      persistStructure(normalizeStructure(
        list.map(a => (a.groupId === group.id ? { ...a, groupId: '' } : a)),
        groups.filter(g => g.id !== group.id),
        displayOrder(),
      ));
    },
    deleteAssignments: async ids => {
      if (!gradeDbConfig || ids.length === 0) return;
      const { assignments: list } = structureRef.current;
      const targets = list.filter(a => ids.includes(a.id));
      const scored = scoresRef.current.filter(s => targets.some(a => isScored(s.assignmentScores?.[a.id]))).length;
      const names = targets.length === 1 ? `"${targets[0].title}"` : `${targets.length} งาน (${targets.map(a => a.title).join(', ')})`;
      const detail = scored > 0 ? `\nมีนักเรียนกรอกคะแนนงานเหล่านี้แล้ว ${scored} คน คะแนนเหล่านี้จะถูกลบด้วย` : '';
      if (!confirm(`ลบ ${names}?${detail}`)) return;
      try {
        // Write queued cells first so none of them re-creates a deleted assignment's score afterwards
        await autosave.flush();
        const bySheet = new Map<string, Assignment[]>();
        targets.forEach(a => {
          const key = `${a.subjectId}|${a.classroom}`;
          bySheet.set(key, [...(bySheet.get(key) || []), a]);
        });
        await Promise.all(Array.from(bySheet.values()).map(list => teacherDatabaseService.deleteAssignmentsWithScores(
          gradeDbConfig, list[0].subjectId, list[0].classroom, list.map(a => a.id))));
        setStudentScores(prev => prev.map(s => {
          const assignmentScores = { ...s.assignmentScores };
          ids.forEach(id => { delete assignmentScores[id]; });
          return { ...s, assignmentScores };
        }));
      } catch (error) {
        console.error('Error deleting assignments:', error);
        alert('ลบชิ้นงานไม่สำเร็จบางรายการ กำลังโหลดข้อมูลล่าสุด');
        if (selectedSubject) handleOpenGrades(selectedSubject);
        return;
      }
      const { assignments: current, groups } = structureRef.current;
      persistStructure(normalizeStructure(current.filter(a => !ids.includes(a.id)), groups));
    },
    renameAssignment: async (a, title) => {
      if (!gradeDbConfig) return;
      const updated = { ...a, title, updatedAt: new Date() };
      setAssignments(prev => prev.map(x => (x.id === a.id ? updated : x)));
      try {
        await teacherDatabaseService.updateAssignments(gradeDbConfig, [{ id: a.id, fields: { title } }]);
      } catch (error) {
        console.error('Error renaming assignment:', error);
        alert('เปลี่ยนชื่องานไม่สำเร็จ');
      }
    },
    addAssignment: () => { setEditingAssignment(null); setShowAssignmentModal(true); },
    setExamMax: async (exam, max) => {
      if (!gradeDbConfig || !gradeConfig) return;
      const next: GradeConfig = { ...gradeConfig, [exam === 'midterm' ? 'midtermMax' : 'finalMax']: max };
      setGradeConfig(next);
      try {
        await teacherDatabaseService.saveGradeConfig(gradeDbConfig, next);
      } catch (error) {
        console.error('Error saving exam max:', error);
        alert('บันทึกคะแนนเต็มข้อสอบไม่สำเร็จ');
      }
    },
    reorder: (idOrder, scaledPositions) => {
      const { assignments: list, groups } = structureRef.current;
      const nextGroups = groups.map(g => {
        const memberCount = idOrder.filter(id => list.find(a => a.id === id)?.groupId === g.id).length;
        const pos = scaledPositions[g.id];
        if (pos === undefined || (g.scaledPosition === undefined && pos === memberCount)) return g;
        return { ...g, scaledPosition: pos };
      });
      persistStructure(normalizeStructure(list, nextGroups, idOrder));
    },
  };

  const handleSaveGradeConfig = async (newConfig: GradeConfig) => {
    if (!gradeDbConfig) return;

    try {
      await teacherDatabaseService.saveGradeConfig(gradeDbConfig, newConfig);
      setGradeConfig(newConfig);
      setShowGradeConfigModal(false);
      alert('บันทึกการตั้งค่าคะแนนสำเร็จ');
    } catch (error) {
      console.error('Error saving grade config:', error);
      alert('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
    }
  };

  const handleSetVisibility = async (ids: string[], isVisible: boolean) => {
    if (!gradeDbConfig) return;
    setAssignments(prev => prev.map(a => (ids.includes(a.id) ? { ...a, isVisible, updatedAt: new Date() } : a)));
    try {
      await teacherDatabaseService.updateAssignments(gradeDbConfig, ids.map(id => ({ id, fields: { isVisible } })));
    } catch (error) {
      console.error('Error changing visibility:', error);
      alert('เปลี่ยนการมองเห็นไม่สำเร็จ');
      if (selectedSubject) handleOpenGrades(selectedSubject);
    }
  };

  const handleSaveAssignment = async (data: Partial<Assignment>, editing: Assignment | null) => {
    if (!gradeDbConfig || !selectedSubject) return;
    try {
      const list = structureRef.current.assignments;
      const nextOrder = list.reduce((max, a) => Math.max(max, a.order ?? -1), -1) + 1;
      const newAssignment: Assignment = {
        id: editing?.id || `asm_${Date.now()}`,
        subjectId: selectedSubject.subjectId,
        classroom: selectedSubject.classroom,
        title: data.title || '',
        description: data.description ?? editing?.description ?? '',
        deadline: data.deadline ?? editing?.deadline ?? '',
        maxScore: data.maxScore || 0,
        groupId: editing?.groupId || '',
        isVisible: data.isVisible ?? editing?.isVisible ?? true,
        order: editing?.order ?? nextOrder,
        createdAt: editing?.createdAt || new Date(),
        updatedAt: new Date()
      };
      await teacherDatabaseService.saveAssignment(gradeDbConfig, newAssignment);
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

  const scoresById = useMemo(() => new Map(studentScores.map(s => [s.studentId, s])), [studentScores]);
  const capacity = useMemo(() => collectedCapacity(assignments, assignmentGroups), [assignments, assignmentGroups]);

  const saveStatusLabel = (() => {
    if (!isOnline && autosave.unsavedCount > 0) return { text: `ออฟไลน์ — ค้าง ${autosave.unsavedCount} ช่อง จะบันทึกเมื่อกลับมาออนไลน์`, tone: 'amber' };
    switch (autosave.status) {
      case 'pending': return { text: `รอบันทึก ${autosave.unsavedCount} ช่อง`, tone: 'gray' };
      case 'saving': return { text: 'กำลังบันทึก…', tone: 'blue' };
      case 'saved': return { text: 'บันทึกแล้ว ✓', tone: 'green' };
      case 'offline': return { text: 'ออฟไลน์ — จะบันทึกเมื่อกลับมาออนไลน์', tone: 'amber' };
      case 'error': return { text: 'บันทึกไม่สำเร็จ — กำลังลองใหม่', tone: 'red' };
      default: return { text: 'บันทึกอัตโนมัติ', tone: 'gray' };
    }
  })();

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
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => {
                      setSelectedSubjectsForDownload(uniqueSubjects.map(s => `${s.subjectId}|||${s.classroom}`));
                      setShowDownloadModal(true);
                    }}
                    disabled={uniqueSubjects.length === 0}
                    title="ดาวน์โหลด Excel (Google Sheets)"
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-center shadow-sm hover:shadow-md ${
                      isDark 
                        ? 'bg-gray-800 border-gray-700 hover:bg-gray-700/80 hover:border-emerald-500/50 text-white' 
                        : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-emerald-400 text-gray-800'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <GoogleSheetsIcon size={24} />
                  </motion.button>
                </div>
              </div>

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
                            ? 'bg-gray-800 border-gray-700 hover:border-red-500/50 hover:bg-gray-750' 
                            : 'bg-gray-50 border-gray-100 hover:border-red-200 hover:bg-white hover:shadow-lg hover:shadow-red-500/5'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                              isDark ? 'bg-red-950/30 text-red-400' : 'bg-red-50 text-red-600'
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
              className={`rounded-2xl p-4 md:p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
            >
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    if (isScoreEditing) handleFinishEditing();
                    else setSelectedSubject(null);
                  }}
                  className={`p-2 rounded-xl ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                >
                  <ChevronLeft size={24} />
                </motion.button>
                <div className="min-w-0">
                  <h1 className={`text-2xl font-bold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {selectedSubject.subjectName}
                  </h1>
                  <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    ห้อง {selectedSubject.classroom} | {filteredStudents.length} คน
                    {gradeConfig && ` | เก็บ ${gradeConfig.proportions.collected} · กลาง ${gradeConfig.proportions.midterm} · ปลาย ${gradeConfig.proportions.final}`}
                  </p>
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {!isScoreEditing ? (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleStartEditing}
                      disabled={loadingGrades}
                      className="flex items-center gap-2 px-6 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-500/20 disabled:opacity-50"
                    >
                      <Edit2 size={18} />
                      กรอกคะแนน
                    </motion.button>
                  ) : (
                    <>
                      <span
                        className={`px-3 py-2 rounded-xl text-xs font-bold ${{
                          gray: isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600',
                          blue: isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-600',
                          green: isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-50 text-emerald-600',
                          amber: isDark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-50 text-amber-700',
                          red: isDark ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-600',
                        }[saveStatusLabel.tone]}`}
                      >
                        {saveStatusLabel.text}
                      </span>
                      <button
                        type="button"
                        onClick={() => stepHistory('undo')}
                        disabled={historySize.undo === 0}
                        title="ย้อนกลับ (Ctrl+Z)"
                        className={`p-2 rounded-xl disabled:opacity-30 ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}
                      >
                        <Undo2 size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => stepHistory('redo')}
                        disabled={historySize.redo === 0}
                        title="ทำซ้ำ (Ctrl+Shift+Z)"
                        className={`p-2 rounded-xl disabled:opacity-30 ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}
                      >
                        <Redo2 size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingAssignment(null); setShowAssignmentModal(true); }}
                        className="flex items-center gap-1 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold"
                      >
                        <Plus size={16} />
                        เพิ่มงาน
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowGradeConfigModal(true)}
                        className={`flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-bold ${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        <Settings size={16} />
                        ตั้งค่าเกรด
                      </button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleFinishEditing}
                        disabled={isFinishing}
                        className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 disabled:opacity-60"
                      >
                        {isFinishing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={18} />}
                        เสร็จสิ้น
                      </motion.button>
                    </>
                  )}
                </div>
              </div>

              {gradeConfig && capacity > gradeConfig.proportions.collected && (
                <div className={`mb-3 flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${isDark ? 'bg-amber-900/30 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
                  <AlertCircle size={16} />
                  งานเก็บที่แสดงให้นักเรียนเห็นเต็มรวม {formatScore(capacity)} คะแนน เกินสัดส่วนคะแนนเก็บ {gradeConfig.proportions.collected} — ลองจัดกลุ่มแล้ว &quot;ปรับคะแนน&quot;
                </div>
              )}

              {isScoreEditing && !isMobile && (
                <p className={`mb-3 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  คลิกช่องแล้วพิมพ์ได้เลย · Enter ลง · Tab ขวา · วางจาก Excel ด้วย Ctrl+V · ลากคลุมหัวงาน (หรือ Shift+คลิก) แล้วคลิกขวา → &quot;ปรับคะแนน&quot;
                  {finePointer ? ' · ลาก ⋮⋮ ที่หัวคอลัมน์เพื่อย้าย' : ' · กดค้างที่หัวคอลัมน์เพื่อเปิดเมนู'}
                </p>
              )}

              {loadingGrades || !gradeConfig ? (
                <div className="flex items-center justify-center gap-2 py-16">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-bold">กำลังโหลดข้อมูล...</span>
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  ไม่พบนักเรียนในห้องนี้
                </div>
              ) : isScoreEditing && isMobile ? (
                <MobileScoreEntry
                  isDark={isDark}
                  students={filteredStudents}
                  assignments={assignments}
                  groups={assignmentGroups}
                  scores={scoresById}
                  config={gradeConfig}
                  invalid={invalidCells}
                  onEdit={handleScoreEdits}
                  onInvalid={handleInvalid}
                />
              ) : (
                <ScoreGrid
                  isDark={isDark}
                  editable={isScoreEditing}
                  allowReorder={finePointer}
                  students={filteredStudents}
                  assignments={assignments}
                  groups={assignmentGroups}
                  scores={scoresById}
                  config={gradeConfig}
                  invalid={invalidCells}
                  onEdit={handleScoreEdits}
                  onInvalid={handleInvalid}
                  onUndo={() => stepHistory('undo')}
                  onRedo={() => stepHistory('redo')}
                  onStudentClick={setSelectedStudent}
                  notify={setToast}
                  actions={gridActions}
                />
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
                    isVisible: formData.get('isVisible') === 'on',
                  }, editingAssignment);
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
                      <button type="button" onClick={() => { setShowAssignmentModal(false); gridActions.deleteAssignments([editingAssignment.id]); }} className="h-14 flex-1 rounded-2xl bg-red-500/10 text-red-500 font-bold hover:bg-red-500/20 transition-all">ลบชิ้นงาน</button>
                    )}
                    <button type="submit" className="h-14 flex-[2] rounded-2xl bg-red-500 text-white font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-500/20">บันทึกข้อมูล</button>
                  </div>
                </form>
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
                        ? 'bg-red-500 text-white hover:bg-red-600 shadow-red-500/20'
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
                    const score = scoresById.get(selectedStudent.studentId);
                    const breakdown = computeBreakdown(score, assignments, assignmentGroups, gradeConfig);
                    const grade = breakdown.grade;
                    const unsentCount = breakdown.pending;
                    const scoreOf = (a: Assignment) => getFieldValue(score, `a:${a.id}`);

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
                            const groupScore = breakdown.groups[group.id] ?? 0;

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
                                        {scoreOf(a) === undefined && <p className="text-[10px] font-bold text-rose-500 uppercase mt-0.5">งานค้าง</p>}
                                      </div>
                                      <div className="text-right shrink-0">
                                        <span className={`font-black text-lg ${scoreOf(a) !== undefined ? 'text-indigo-500' : 'text-rose-500'}`}>
                                          {scoreOf(a) !== undefined ? formatScore(scoreOf(a)) : '–'}
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
                                      {scoreOf(a) === undefined && <p className="text-[10px] font-bold text-rose-500 uppercase mt-0.5">งานค้าง</p>}
                                    </div>
                                    <div className="text-right shrink-0">
                                      <span className={`font-black text-lg ${scoreOf(a) !== undefined ? 'text-indigo-500' : 'text-rose-500'}`}>
                                        {scoreOf(a) !== undefined ? formatScore(scoreOf(a)) : '–'}
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
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className={`w-full max-w-lg rounded-3xl p-6 shadow-2xl ${isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}`}
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-xl ${isDark ? 'bg-emerald-950/40' : 'bg-emerald-50'}`}>
                      <GoogleSheetsIcon size={24} />
                    </div>
                    <h3 className="text-xl font-bold">ดาวน์โหลดรายงานคะแนน</h3>
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
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-bold opacity-70">เลือกวิชาที่ต้องการ</label>
                      <div className="flex gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setSelectedSubjectsForDownload(uniqueSubjects.map(s => `${s.subjectId}|||${s.classroom}`))}
                          className="text-red-500 hover:underline font-semibold"
                        >
                          เลือกทั้งหมด
                        </button>
                        <span className="opacity-40">|</span>
                        <button
                          type="button"
                          onClick={() => setSelectedSubjectsForDownload([])}
                          className="opacity-70 hover:underline"
                        >
                          ล้าง
                        </button>
                      </div>
                    </div>
                    <div className={`max-h-60 overflow-y-auto rounded-2xl p-2 border ${isDark ? 'bg-gray-900/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                      {uniqueSubjects.map((subject) => {
                        const key = `${subject.subjectId}|||${subject.classroom}`;
                        const isSelected = selectedSubjectsForDownload.includes(key);
                        return (
                          <label 
                            key={key}
                            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                              isSelected 
                                ? (isDark ? 'bg-red-950/30 text-red-400' : 'bg-red-50 text-red-600') 
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

                  {/* Action Buttons */}
                  <div className="pt-2 space-y-3">
                    <button
                      onClick={handleDownloadExcel}
                      disabled={isDownloading || selectedSubjectsForDownload.length === 0}
                      className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${
                        isDownloading || selectedSubjectsForDownload.length === 0
                          ? 'bg-gray-500 cursor-not-allowed text-white'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/20'
                      }`}
                    >
                      {isDownloading ? (
                        <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <GoogleSheetsIcon size={22} />
                      )}
                      {isDownloading ? 'กำลังสร้างไฟล์...' : `ดาวน์โหลด Excel (${selectedSubjectsForDownload.length} วิชา)`}
                    </button>
                    <button
                      onClick={() => setShowDownloadModal(false)}
                      className="w-full py-3 rounded-2xl font-bold opacity-60 hover:opacity-100 transition-all text-sm"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
