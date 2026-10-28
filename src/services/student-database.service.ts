import { firebaseManager } from '@/lib/firebase';
import { collection, doc, getDocs, getDoc, query, where, Firestore } from 'firebase/firestore';
import { schoolDatabaseService, StudentData, SubjectData, TeacherFirebaseConfig } from './school-database.service';
import { teacherDatabaseService, AttendanceData, AttendanceRecord, StudentScore, Assignment, AssignmentGroup, GradeConfig } from './teacher-database.service';
import { TtlCache } from '@/lib/firestore-helpers';
import { summarizeAttendance, type AttendanceStats } from '@/lib/attendance';
import { buildStudentGradeInfo } from '@/lib/student-grade-info';
import { buildHueMap, type SubjectHue } from '@/lib/timetable';
import { firestoreService } from './firestore.service';
import type { FirebaseConfig } from '@/types/firebase.types';

export interface StudentSubjectInfo {
  subjectId: string;
  subjectName: string;
  classroom: string;
  teacherId: string;
  teacherName: string;
  day: string;
  time: string;
  duration?: string;
  schedules?: Array<{ day: string; time: string }>;
  /** Official code shown to users; may be empty */
  subjectCode: string;
  /** Teaching room (falls back to the teacher's default room); may be empty */
  room: string;
  /** Same hue as the subject has in the timetable */
  hue: SubjectHue;
}

export interface StudentGradeDetail {
  label: string;
  /** null = not entered yet (pending); 0 is a real score */
  score: number | null;
  max: number;
  description: string;
  /** "YYYY-MM-DD" or empty */
  deadline: string;
}

/**
 * One row of the student's score list, in the teacher's column order: a plain assignment,
 * or a group whose scaled points are what counts, with its assignments under it.
 */
export type StudentGradeRow =
  | { kind: 'assignment'; item: StudentGradeDetail }
  | { kind: 'group'; id: string; name: string; points: number; max: number; items: StudentGradeDetail[] };

export interface StudentGradeInfo {
  subjectId: string;
  subjectName: string;
  classroom: string;
  collectedScore: number;
  midtermScore: number;
  finalScore: number;
  totalScore: number;
  grade: string;
  unsent: number;
  /** Full points of each part (the subject's grade proportions) */
  maxima: { collected: number; midterm: number; final: number };
  /** Whether the teacher has entered the exam score (a missing exam counts as 0) */
  midtermEntered: boolean;
  finalEntered: boolean;
  /** The subject's grade scale, lowest first */
  scale: { grade: string; minScore: number }[];
  details: StudentGradeDetail[];
  rows: StudentGradeRow[];
}

export interface StudentAttendanceInfo {
  subjectId: string;
  subjectName: string;
  classroom: string;
  stats: AttendanceStats;
}

export interface FanOutResult<T> {
  items: T[];
  /** Teachers whose database could not be read (network/permission errors) */
  failedTeacherIds: string[];
}

/**
 * Shared context for student data fetching — avoids duplicate network calls
 */
interface StudentTeacherContext {
  subjects: StudentSubjectInfo[];
  teacherIds: string[];
  studentTeachers: TeacherFirebaseConfig[];
}

/** A teacher "uses the system" once they have registered (linked a Google account). */
export function isActiveTeacher(teacher: Pick<TeacherFirebaseConfig, 'uid'> | undefined | null): boolean {
  return !!teacher?.uid;
}

const CONTEXT_TTL = 5 * 60 * 1000;
/** Grades/attendance change more often than rosters; keep them only briefly. */
const OVERVIEW_TTL = 2 * 60 * 1000;

interface StudentSubjectOverview {
  subjects: StudentSubjectInfo[];
  grades: StudentGradeInfo[];
  attendance: StudentAttendanceInfo[];
  failedTeacherIds: string[];
}

class StudentDatabaseService {
  private contextCache = new TtlCache<StudentTeacherContext>(CONTEXT_TTL);
  private overviewCache = new TtlCache<StudentSubjectOverview>(OVERVIEW_TTL);

  /** Drop cached per-student data (sign out). */
  clearCache(): void {
    this.contextCache.invalidate();
    this.overviewCache.invalidate();
  }

  /**
   * Get student's timetable from School Database (Admin Data).
   * Includes every teacher's subjects, whether or not the teacher uses the system.
   */
  async getStudentSchedule(schoolFirebaseConfig: FirebaseConfig, studentData: StudentData): Promise<SubjectData[]> {
    const classSubjects = await schoolDatabaseService.getSubjectsForStudent(schoolFirebaseConfig, studentData);

    // Expand multi-day schedules into one entry per period
    const expandedSubjects: SubjectData[] = [];
    for (const subject of classSubjects) {
      if (subject.schedules && subject.schedules.length > 0) {
        for (const sch of subject.schedules) {
          expandedSubjects.push({
            ...subject,
            day: sch.day,
            time: sch.time,
            duration: sch.duration || subject.duration
          });
        }
      } else {
        expandedSubjects.push(subject);
      }
    }
    return expandedSubjects;
  }

  /**
   * Get student's subjects (one card per subject, not per period).
   * Only subjects of teachers who use the system are returned, since only they
   * have grades/attendance to show. The timetable (getStudentSchedule) is unfiltered.
   */
  async getStudentSubjects(
    schoolFirebaseConfig: FirebaseConfig,
    studentData: StudentData
  ): Promise<StudentSubjectInfo[]> {
    const ctx = await this._getStudentTeacherContext(schoolFirebaseConfig, studentData);
    return ctx.subjects;
  }

  /**
   * Build the student-teacher context once and cache it for 5 minutes, so the subjects,
   * grades, attendance and pending-assignment screens share a single set of reads.
   */
  private async _getStudentTeacherContext(
    schoolFirebaseConfig: FirebaseConfig,
    studentData: StudentData,
    forceRefresh = false
  ): Promise<StudentTeacherContext> {
    const key = `${schoolFirebaseConfig.projectId}:${studentData.studentId}:${studentData.class}`;
    return this.contextCache.getOrLoad(key, async () => {
      const classSubjects = await schoolDatabaseService.getSubjectsForStudent(schoolFirebaseConfig, studentData, forceRefresh);
      const allTeacherIds = Array.from(new Set(classSubjects.map(s => s.teacherId)));
      const teachers = await schoolDatabaseService.getTeachersByIds(schoolFirebaseConfig, allTeacherIds);
      const activeTeachers = teachers.filter(isActiveTeacher);
      const activeIds = new Set(activeTeachers.map(t => t.teacherId));

      // Group by subjectName + teacherId to get unique subjects with all their periods
      const uniqueSubjectsMap = new Map<string, { subject: SubjectData; schedules: Array<{ day: string; time: string }> }>();
      for (const subject of classSubjects) {
        if (!activeIds.has(subject.teacherId)) continue;
        const key = `${subject.subjectName}-${subject.teacherId}`;
        const subjectSchedules = (subject.schedules && subject.schedules.length > 0)
          ? subject.schedules.map(s => ({ day: s.day, time: s.time }))
          : [{ day: subject.day, time: subject.time }];

        const existing = uniqueSubjectsMap.get(key);
        if (existing) {
          existing.schedules.push(...subjectSchedules);
        } else {
          uniqueSubjectsMap.set(key, { subject, schedules: [...subjectSchedules] });
        }
      }

      const hues = buildHueMap(classSubjects);
      const subjects: StudentSubjectInfo[] = Array.from(uniqueSubjectsMap.values()).map(({ subject, schedules }) => ({
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        classroom: subject.classroom,
        teacherId: subject.teacherId,
        teacherName: activeTeachers.find(t => t.teacherId === subject.teacherId)?.name || '-',
        day: subject.day,
        time: subject.time,
        duration: subject.duration,
        schedules,
        subjectCode: subject.subjectCode || '',
        room: subject.room || activeTeachers.find(t => t.teacherId === subject.teacherId)?.defaultRoom || '',
        hue: hues.get(subject.subjectName) || 'blue',
      }));

      return {
        subjects,
        teacherIds: Array.from(activeIds),
        studentTeachers: activeTeachers,
      };
    }, forceRefresh);
  }

  /**
   * Run a per-teacher fetch against every active teacher in parallel and merge results.
   */
  private async _fanOut<T>(
    ctx: StudentTeacherContext,
    fetchOne: (teacher: TeacherFirebaseConfig) => Promise<T[]>
  ): Promise<FanOutResult<T>> {
    const results = await Promise.allSettled(ctx.studentTeachers.map(fetchOne));
    const items: T[] = [];
    const failedTeacherIds: string[] = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        items.push(...result.value);
      } else {
        failedTeacherIds.push(ctx.studentTeachers[i].teacherId);
        console.error(`Error fetching from teacher ${ctx.studentTeachers[i].teacherId}:`, result.reason);
      }
    });
    return { items, failedTeacherIds };
  }

  /**
   * Everything the student subjects screen needs, with one shared context and
   * a list of teachers whose data failed to load.
   */
  async getStudentSubjectOverview(
    schoolFirebaseConfig: FirebaseConfig,
    studentData: StudentData,
    forceRefresh = false
  ): Promise<StudentSubjectOverview> {
    const key = `${schoolFirebaseConfig.projectId}:${studentData.studentId}:${studentData.class}`;
    const cached = forceRefresh ? undefined : this.overviewCache.get(key);
    if (cached) return cached;

    const ctx = await this._getStudentTeacherContext(schoolFirebaseConfig, studentData, forceRefresh);
    const [grades, attendance] = await Promise.all([
      this._fanOut(ctx, t => this._fetchGradesFromTeacher(t, schoolFirebaseConfig, studentData, ctx.subjects)),
      this._fanOut(ctx, t => this._fetchAttendanceFromTeacher(t, schoolFirebaseConfig, studentData, ctx.subjects)),
    ]);
    const overview: StudentSubjectOverview = {
      subjects: ctx.subjects,
      grades: grades.items,
      attendance: attendance.items,
      failedTeacherIds: Array.from(new Set([...grades.failedTeacherIds, ...attendance.failedTeacherIds])),
    };
    // Don't cache a partial result, so a retry actually re-reads the failed teachers
    if (overview.failedTeacherIds.length === 0) this.overviewCache.set(key, overview);
    return overview;
  }

  /**
   * Remove a student everywhere: their scores, attendance-summary entries and attendance-session
   * rows in every Teacher DB they have data in,
   * their School DB record and their Master Registry mapping. Teachers are found from the
   * student's subjects (plus any teacherNodes), so cleanup works even when teacherNodes is empty.
   * Returns teacher IDs whose database could not be cleaned.
   */
  async deleteStudentCompletely(schoolFirebaseConfig: FirebaseConfig, student: StudentData): Promise<{ failedTeacherIds: string[] }> {
    const subjects = await schoolDatabaseService.getSubjectsForStudent(schoolFirebaseConfig, student, true);
    const teacherIds = Array.from(new Set([
      ...subjects.map(s => s.teacherId),
      ...(Array.isArray(student.teacherNodes) ? student.teacherNodes : []),
    ].filter(Boolean)));
    const teachers = await schoolDatabaseService.getTeachersByIds(schoolFirebaseConfig, teacherIds);

    // One cleanup per database (teachers without their own DB share the school DB)
    const databases = new Map<string, { config: FirebaseConfig; teacherIds: string[]; subjectIds: string[] }>();
    for (const teacher of teachers.filter(isActiveTeacher)) {
      const config = teacher.firebaseConfig || schoolFirebaseConfig;
      const entry = databases.get(config.projectId) || { config, teacherIds: [], subjectIds: [] };
      entry.teacherIds.push(teacher.teacherId);
      entry.subjectIds.push(...subjects.filter(s => s.teacherId === teacher.teacherId).map(s => s.subjectId));
      databases.set(config.projectId, entry);
    }

    const failedTeacherIds: string[] = [];
    await Promise.all(Array.from(databases.values()).map(async ({ config, teacherIds: ids, subjectIds }) => {
      try {
        await teacherDatabaseService.deleteAllStudentData(config, student.studentId, subjectIds);
      } catch (error) {
        console.error('Error deleting student data from teacher database:', ids, error);
        failedTeacherIds.push(...ids);
      }
    }));

    await schoolDatabaseService.deleteStudent(schoolFirebaseConfig, student.studentId);
    if (student.email) {
      await firestoreService.deleteUserAccount(student.email);
    }
    this.clearCache();
    return { failedTeacherIds };
  }

  /**
   * Get student's grades from the databases of teachers who use the system.
   */
  async getStudentGrades(schoolFirebaseConfig: FirebaseConfig, studentData: StudentData): Promise<StudentGradeInfo[]> {
    const ctx = await this._getStudentTeacherContext(schoolFirebaseConfig, studentData);
    const { items } = await this._fanOut(ctx, t => this._fetchGradesFromTeacher(t, schoolFirebaseConfig, studentData, ctx.subjects));
    return items;
  }

  /**
   * Get student's attendance from the databases of teachers who use the system.
   */
  async getStudentAttendance(schoolFirebaseConfig: FirebaseConfig, studentData: StudentData): Promise<StudentAttendanceInfo[]> {
    const ctx = await this._getStudentTeacherContext(schoolFirebaseConfig, studentData);
    const { items } = await this._fanOut(ctx, t => this._fetchAttendanceFromTeacher(t, schoolFirebaseConfig, studentData, ctx.subjects));
    return items;
  }

  /**
   * Fetch grades from a single teacher's database (extracted for parallel execution)
   */
  private async _fetchGradesFromTeacher(
    teacher: TeacherFirebaseConfig,
    schoolFirebaseConfig: FirebaseConfig,
    studentData: StudentData,
    subjects: StudentSubjectInfo[]
  ): Promise<StudentGradeInfo[]> {
    const grades: StudentGradeInfo[] = [];

    const firebaseConfig = teacher.firebaseConfig || schoolFirebaseConfig;
    if (!firebaseConfig) return grades;

    const teacherDB = this.getTeacherDB(firebaseConfig);

    // Query all scores for this student from this teacher's DB
    const scoresQuery = query(
      collection(teacherDB, 'studentScores'),
      where('studentId', '==', studentData.studentId)
    );
    const scoresSnap = await getDocs(scoresQuery);

    // Process each score document — fetch assignments + gradeConfig in parallel per subject
    const scoreProcessPromises = scoresSnap.docs.map(async (scoreDoc) => {
      const scoreData = scoreDoc.data() as StudentScore;

      // Fetch assignments, groups and gradeConfig in parallel
      const [assignmentsSnap, groupsSnap, gradeConfigSnap] = await Promise.all([
        getDocs(query(
          collection(teacherDB, 'assignments'),
          where('isVisible', '==', true),
          where('subjectId', '==', scoreData.subjectId)
        )),
        getDocs(query(collection(teacherDB, 'assignmentGroups'), where('subjectId', '==', scoreData.subjectId))),
        getDoc(doc(teacherDB, 'gradeConfigs', scoreData.subjectId)),
      ]);

      const inClassroom = <T extends { classroom?: string }>(item: T) => !item.classroom || item.classroom === scoreData.classroom;
      const assignments = assignmentsSnap.docs.map(d => d.data() as Assignment).filter(inClassroom);
      const groups = groupsSnap.docs.map(d => d.data() as AssignmentGroup).filter(inClassroom);
      const gradeConfig = gradeConfigSnap.exists() ? gradeConfigSnap.data() as GradeConfig : null;

      // Same calculation as the teacher's grade sheet and the teacher's per-student popup
      const subjectInfo = subjects.find(s => s.subjectId === scoreData.subjectId);
      return buildStudentGradeInfo(scoreData, assignments, groups, gradeConfig, {
        subjectId: scoreData.subjectId,
        subjectName: subjectInfo?.subjectName || '',
        classroom: scoreData.classroom,
      });
    });

    const processedGrades = await Promise.all(scoreProcessPromises);
    grades.push(...processedGrades);

    return grades;
  }

  /**
   * Fetch attendance from a single teacher's database (extracted for parallel execution)
   */
  private async _fetchAttendanceFromTeacher(
    teacher: TeacherFirebaseConfig,
    schoolFirebaseConfig: FirebaseConfig,
    studentData: StudentData,
    subjects: StudentSubjectInfo[]
  ): Promise<StudentAttendanceInfo[]> {
    const attendance: StudentAttendanceInfo[] = [];

    const firebaseConfig = teacher.firebaseConfig || schoolFirebaseConfig;
    if (!firebaseConfig) return attendance;

    const teacherDB = this.getTeacherDB(firebaseConfig);

    // Get all subjects this teacher teaches to the student's class
    const teacherSubjects = subjects.filter(s => s.teacherId === teacher.teacherId);

    // Fetch attendance for all subjects in parallel
    const subjectPromises = teacherSubjects.map(async (subject) => {
      const studentAttendanceDocs = await this._getStudentSessions(teacherDB, firebaseConfig, subject, studentData.studentId);

      if (studentAttendanceDocs.length > 0) {
        const stats = summarizeAttendance(studentAttendanceDocs.flatMap(session => session.records
          .filter(r => String(r.studentId) === studentData.studentId)
          .map(r => ({ date: session.date, hours: session.hours, status: r.status }))));
        return {
          subjectId: subject.subjectId,
          subjectName: subject.subjectName,
          classroom: subject.classroom,
          stats,
        };
      }
      return null;
    });

    const results = await Promise.all(subjectPromises);
    for (const result of results) {
      if (result) attendance.push(result);
    }

    return attendance;
  }

  /**
   * This student's attendance sessions for one subject.
   * Reads the subject's summary document (1 read); falls back to scanning every session
   * document when the teacher hasn't opened the subject since summaries were introduced.
   */
  private async _getStudentSessions(
    teacherDB: Firestore,
    firebaseConfig: FirebaseConfig,
    subject: StudentSubjectInfo,
    studentId: string
  ): Promise<AttendanceData[]> {
    const summary = await teacherDatabaseService.getAttendanceSummary(firebaseConfig, subject.subjectId);
    if (summary) {
      const statuses = summary.students?.[studentId] || {};
      return Object.entries(statuses)
        .filter(([sessionId]) => summary.sessions?.[sessionId])
        .map(([sessionId, status]) => {
          const session = summary.sessions[sessionId];
          return {
            subjectId: subject.subjectId,
            subjectName: subject.subjectName,
            classroom: session.classroom,
            date: session.date,
            hours: session.hours,
            records: [{ studentId, name: '', number: '', status: status as AttendanceRecord['status'] }],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        });
    }

    const attendanceSnap = await getDocs(query(
      collection(teacherDB, 'attendance'),
      where('subjectId', '==', subject.subjectId)
    ));
    const sessions: AttendanceData[] = [];
    for (const attendanceDoc of attendanceSnap.docs) {
      const attendanceData = attendanceDoc.data() as AttendanceData;
      const studentRecord = attendanceData.records?.find(r => r.studentId === studentId);
      if (studentRecord) {
        sessions.push({ ...attendanceData, records: [studentRecord] });
      }
    }
    return sessions;
  }

  /**
   * Helper: Get teacher database instance
   */
  private getTeacherDB(teacherFirebaseConfig: FirebaseConfig): Firestore {
    return firebaseManager.getTeacherDb(teacherFirebaseConfig);
  }

  /**
   * Helper: Group attendance records by subject
   */
  private groupAttendanceBySubject(records: AttendanceData[]): Record<string, AttendanceData[]> {
    return records.reduce((acc, record) => {
      if (!acc[record.subjectId]) {
        acc[record.subjectId] = [];
      }
      acc[record.subjectId].push(record);
      return acc;
    }, {} as Record<string, AttendanceData[]>);
  }

  /**
   * Get student's pending (unsent) assignments from all teacher databases
   * Returns assignments that the student hasn't submitted yet, sorted by deadline
   * ★ OPTIMIZED: fetches from all teachers in PARALLEL, reuses shared context
   */
  async getStudentPendingAssignments(
    schoolFirebaseConfig: FirebaseConfig,
    studentData: StudentData
  ): Promise<{
    subjectId: string;
    subjectName: string;
    assignmentTitle: string;
    deadline: string;
    maxScore: number;
    teacherName: string;
  }[]> {
    const pending: {
      subjectId: string;
      subjectName: string;
      assignmentTitle: string;
      deadline: string;
      maxScore: number;
      teacherName: string;
    }[] = [];

    try {
      const ctx = await this._getStudentTeacherContext(schoolFirebaseConfig, studentData);

      // Fetch from all active teachers in parallel
      const { items } = await this._fanOut(ctx, async (teacher) => {
          const teacherPending: typeof pending = [];

          const firebaseConfig = teacher.firebaseConfig || schoolFirebaseConfig;
          if (!firebaseConfig) return teacherPending;

          const teacherDB = this.getTeacherDB(firebaseConfig);
          const teacherSubjects = ctx.subjects.filter(s => s.teacherId === teacher.teacherId);

          // Fetch assignments + scores for all subjects in parallel
          const subjectResults = await Promise.all(
            teacherSubjects.map(async (subject) => {
              // Get assignments and scores in parallel
              const [assignmentsSnap, scoresSnap] = await Promise.all([
                getDocs(query(
                  collection(teacherDB, 'assignments'),
                  where('isVisible', '==', true),
                  where('subjectId', '==', subject.subjectId)
                )),
                getDocs(query(
                  collection(teacherDB, 'studentScores'),
                  where('studentId', '==', studentData.studentId),
                  where('subjectId', '==', subject.subjectId)
                )),
              ]);

              const assignments = assignmentsSnap.docs.map(d => d.data() as Assignment);
              const scoreData = scoresSnap.docs.length > 0 ? scoresSnap.docs[0].data() as StudentScore : null;

              const subjectPending: typeof pending = [];
              for (const assignment of assignments) {
                const hasScore = scoreData?.assignmentScores?.[assignment.id];
                if (!hasScore && hasScore !== 0) {
                  subjectPending.push({
                    subjectId: subject.subjectId,
                    subjectName: subject.subjectName,
                    assignmentTitle: assignment.title,
                    deadline: assignment.deadline || '',
                    maxScore: assignment.maxScore,
                    teacherName: subject.teacherName,
                  });
                }
              }
              return subjectPending;
            })
          );

          for (const subjectPending of subjectResults) {
            teacherPending.push(...subjectPending);
          }

          return teacherPending;
      });
      pending.push(...items);
    } catch (error) {
      console.error('Error fetching pending assignments:', error);
    }

    // Sort by deadline (closest first), items without deadline go to the end
    pending.sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });

    return pending;
  }
}

export const studentDatabaseService = new StudentDatabaseService();
