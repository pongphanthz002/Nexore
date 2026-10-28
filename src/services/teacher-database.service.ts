import { firebaseManager } from '@/lib/firebase';
import { collection, doc, getDocs, getDoc, setDoc, query, where, deleteDoc, deleteField, writeBatch, Firestore } from 'firebase/firestore';
import { chunkArray } from '@/lib/firestore-helpers';
import { MASTER_REGISTRY_CONFIG } from '@/config/master-registry.config';
import type { FirebaseConfig } from '@/types/firebase.types';

export interface AttendanceRecord {
  studentId: string;
  name: string;
  number: string;
  status: 'มา' | 'ขาด' | 'สาย' | 'ลาป่วย' | 'ลากิจ' | 'กิจกรรม' | 'หนี' | '';
}

export interface AttendanceData {
  subjectId: string;
  subjectName: string;
  classroom: string;
  date: string; // e.g. "Mon 23/5"
  hours: number;
  records: AttendanceRecord[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One document per subject (`attendanceSummaries/{subjectId}`) holding every session's
 * date/hours and every student's status per session. Kept in sync by saveAttendance so a
 * student can read one document per subject instead of every attendance session.
 */
export interface AttendanceSummary {
  subjectId: string;
  version: number;
  /** attendance docId → session info */
  sessions: Record<string, { date: string; hours: number; classroom: string }>;
  /** studentId → (attendance docId → status) */
  students: Record<string, Record<string, string>>;
  updatedAt: Date;
}

export const ATTENDANCE_SUMMARY_VERSION = 1;
const ATTENDANCE_SUMMARIES = 'attendanceSummaries';

/** Every collection a Teacher DB may contain (current and legacy). */
const TEACHER_DB_COLLECTIONS = [
  'attendance',
  ATTENDANCE_SUMMARIES,
  'gradeConfigs',
  'assignments',
  'assignmentGroups',
  'studentScores',
  // legacy / unused
  'grades',
  'schedules',
  'materials',
];

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const v = value as { toMillis?: () => number; seconds?: number };
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

function attendanceDocId(subjectId: string, classroom: string, date: string): string {
  const safeClassroom = String(classroom).replace(/\//g, '-').replace(/\s+/g, '');
  const safeDate = String(date).replace(/\//g, '-').replace(/\s+/g, '');
  return `${subjectId}_${safeClassroom}_${safeDate}`;
}

export interface GradeThreshold {
  grade: string; // "4", "3.5", "3", "2.5", "2", "1.5", "1", "0"
  minScore: number;
  color: string;
}

export interface GradeConfig {
  subjectId: string;
  proportions: {
    collected: number; // e.g. 60
    midterm: number;  // e.g. 20
    final: number;    // e.g. 20
  };
  thresholds: GradeThreshold[];
  updatedAt: Date;
}

export interface Assignment {
  id: string;
  subjectId: string;
  classroom: string;
  title: string;
  description: string;
  deadline: string; // ISO date string or formatted date
  maxScore: number;
  groupId?: string;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssignmentGroup {
  id: string;
  subjectId: string;
  classroom: string;
  name: string;
  rawScore: number; // The target score after scaling (e.g., 5 points)
  assignmentIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface StudentScore {
  studentId: string;
  subjectId: string;
  classroom: string;
  assignmentScores: Record<string, number>; // assignmentId -> score
  midtermScore: number;
  finalScore: number;
  updatedAt: Date;
}

const CONFIG_FIELDS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'] as const;
const CONNECTION_CHECK_TIMEOUT_MS = 10_000;
const CONNECTION_CHECK_COLLECTION = '_nexore_connection_check';

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      err => { clearTimeout(timer); reject(err); }
    );
  });
}

/**
 * Trim every field and drop unknown keys.
 */
export function normalizeFirebaseConfig(input: Partial<Record<string, string>>): FirebaseConfig {
  const out: Record<string, string> = {};
  for (const key of CONFIG_FIELDS) out[key] = String(input[key] ?? '').trim();
  return out as unknown as FirebaseConfig;
}

class TeacherDatabaseService {
  /**
   * Check that a Teacher DB config is well-formed and doesn't point at a database
   * that must not hold teacher data. Returns a Thai error message, or null if OK.
   */
  validateConfigShape(config: FirebaseConfig, opts: { schoolProjectId?: string } = {}): string | null {
    const missing = CONFIG_FIELDS.filter(key => !config[key]);
    if (missing.length > 0) return `กรุณากรอกให้ครบทุกช่อง (ยังขาด: ${missing.join(', ')})`;

    if (!/^AIza[0-9A-Za-z_-]{35}$/.test(config.apiKey)) return 'apiKey ไม่ถูกรูปแบบ (ควรขึ้นต้นด้วย AIza และยาว 39 ตัวอักษร)';
    if (!/^[a-z0-9-]{4,30}$/.test(config.projectId)) return 'projectId ไม่ถูกรูปแบบ';
    if (!/^\d+$/.test(config.messagingSenderId)) return 'messagingSenderId ต้องเป็นตัวเลขเท่านั้น';

    const appIdMatch = /^1:(\d+):web:[0-9a-f]+$/.exec(config.appId);
    if (!appIdMatch) return 'appId ไม่ถูกรูปแบบ (ควรเป็น 1:<ตัวเลข>:web:<รหัส>)';
    if (appIdMatch[1] !== config.messagingSenderId) return 'appId กับ messagingSenderId ไม่ตรงกัน อาจคัดลอกมาจากคนละโปรเจกต์';
    if (!config.authDomain.startsWith(`${config.projectId}.`)) return 'authDomain ไม่ตรงกับ projectId อาจคัดลอกมาจากคนละโปรเจกต์';

    if (config.projectId === MASTER_REGISTRY_CONFIG.projectId) return 'ไม่สามารถใช้ฐานข้อมูลกลางของระบบ (nexore-hub) เป็นฐานข้อมูลครูได้';
    if (opts.schoolProjectId && config.projectId === opts.schoolProjectId) return 'นี่คือฐานข้อมูลของโรงเรียน กรุณาใช้ Firebase โปรเจกต์ของครูเอง';
    return null;
  }

  /**
   * Prove the config works end-to-end: write, read back and delete a small check
   * document using a throwaway Firebase app. Throws an Error with a Thai message.
   */
  async verifyConnection(config: FirebaseConfig, checkId: string): Promise<void> {
    const instanceName = `config-check-${Date.now()}`;
    const instance = firebaseManager.getInstance(config, instanceName, { persistent: false });
    const ref = doc(instance.db, CONNECTION_CHECK_COLLECTION, checkId || 'check');
    try {
      await withTimeout(setDoc(ref, { checkedAt: new Date() }), CONNECTION_CHECK_TIMEOUT_MS,
        'เชื่อมต่อไม่สำเร็จภายในเวลาที่กำหนด กรุณาตรวจสอบ Config และอินเทอร์เน็ต');
      const snap = await withTimeout(getDoc(ref), CONNECTION_CHECK_TIMEOUT_MS, 'อ่านข้อมูลทดสอบไม่สำเร็จ');
      if (!snap.exists()) throw new Error('เขียนข้อมูลทดสอบแล้วแต่อ่านกลับไม่ได้');
      await withTimeout(deleteDoc(ref), CONNECTION_CHECK_TIMEOUT_MS, 'ลบข้อมูลทดสอบไม่สำเร็จ');
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code.includes('permission-denied')) {
        throw new Error('ไม่มีสิทธิ์อ่าน/เขียนฐานข้อมูลนี้ กรุณาตรวจสอบ Firestore Rules ของโปรเจกต์');
      }
      if (code.includes('not-found') || code.includes('failed-precondition')) {
        throw new Error('ยังไม่ได้สร้าง Firestore Database ในโปรเจกต์นี้');
      }
      if (code.includes('invalid-api-key') || code.includes('api-key')) {
        throw new Error('apiKey ไม่ถูกต้อง');
      }
      throw err instanceof Error && !code ? err : new Error('ไม่สามารถเชื่อมต่อกับฐานข้อมูลได้ กรุณาตรวจสอบ Config');
    } finally {
      firebaseManager.removeInstance(instanceName);
    }
  }

  /**
   * Get teacher database instance using teacher's Firebase config
   */
  private getTeacherDB(teacherFirebaseConfig: FirebaseConfig): Firestore {
    return firebaseManager.getTeacherDb(teacherFirebaseConfig);
  }

  /**
   * Delete all data for a specific student from a teacher's database:
   * their score documents and their entries in attendance summaries.
   * (Session documents in `attendance` keep the class roster as recorded.)
   */
  async deleteAllStudentData(teacherFirebaseConfig: FirebaseConfig, studentId: string): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);

    const [scoresSnap, summariesSnap] = await Promise.all([
      getDocs(query(collection(database, 'studentScores'), where('studentId', '==', studentId))),
      getDocs(collection(database, ATTENDANCE_SUMMARIES)),
    ]);

    const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
    scoresSnap.docs.forEach(d => writes.push(batch => batch.delete(d.ref)));
    summariesSnap.docs
      .filter(d => (d.data() as AttendanceSummary).students?.[studentId])
      .forEach(d => writes.push(batch => batch.update(d.ref, { [`students.${studentId}`]: deleteField() })));

    for (const chunk of chunkArray(writes, 499)) {
      const batch = writeBatch(database);
      chunk.forEach(write => write(batch));
      await batch.commit();
    }
  }

  /**
   * Delete entire teacher database (when teacher is deleted)
   * This deletes all collections in the teacher's database
   */
  async deleteTeacherDatabase(teacherFirebaseConfig: FirebaseConfig): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    
    const collectionsToDelete = TEACHER_DB_COLLECTIONS;

    try {
      // Query and delete all collections in parallel
      const deletePromises = collectionsToDelete.map(async (collectionName) => {
        const querySnapshot = await getDocs(collection(database, collectionName));
        
        if (querySnapshot.docs.length > 0) {
          const chunks = chunkArray(querySnapshot.docs, 499);
          for (const chunk of chunks) {
            const batch = writeBatch(database);
            for (const docSnap of chunk) {
              batch.delete(docSnap.ref);
            }
            await batch.commit();
          }
        }
      });
      await Promise.all(deletePromises);
    } catch (error) {
      console.error('Error deleting teacher database:', error);
      throw error;
    }
  }

  /**
   * Save attendance data to teacher's database
   */
  async saveAttendance(teacherFirebaseConfig: FirebaseConfig, data: AttendanceData): Promise<void> {
    if (!teacherFirebaseConfig || !teacherFirebaseConfig.projectId) {
      throw new Error('Invalid Firebase configuration');
    }
    
    const database = this.getTeacherDB(teacherFirebaseConfig);
    if (!data.subjectId || !data.classroom || !data.date) {
      throw new Error('Missing subjectId, classroom, or date');
    }
    
    const docId = attendanceDocId(data.subjectId, data.classroom, data.date);
    const attendanceRef = doc(database, 'attendance', docId);

    // Ensure all data is Firestore-friendly and serializable
    const existingDoc = await getDoc(attendanceRef);
    const records = Array.isArray(data.records) ? data.records.map(r => ({
      studentId: String(r.studentId),
      name: String(r.name || ''),
      number: String(r.number || ''),
      status: String(r.status || '') as AttendanceRecord['status'],
    })) : [];
    const saveData = {
      subjectId: String(data.subjectId),
      subjectName: String(data.subjectName || ''),
      classroom: String(data.classroom),
      date: String(data.date),
      hours: Number(data.hours) || 1,
      records,
      updatedAt: new Date(),
      createdAt: (existingDoc.exists() && existingDoc.data()?.createdAt) ? existingDoc.data().createdAt : new Date()
    };

    await setDoc(attendanceRef, saveData);

    // Mirror this session into the subject's summary (one write; uses the doc we already read)
    const previousRecords: AttendanceRecord[] = existingDoc.exists() ? (existingDoc.data().records || []) : [];
    const currentIds = new Set(records.map(r => r.studentId));
    const studentsPatch: Record<string, Record<string, unknown>> = {};
    for (const r of records) {
      studentsPatch[r.studentId] = { [docId]: r.status };
    }
    for (const r of previousRecords) {
      if (!currentIds.has(String(r.studentId))) {
        studentsPatch[String(r.studentId)] = { [docId]: deleteField() };
      }
    }
    try {
      await setDoc(doc(database, ATTENDANCE_SUMMARIES, saveData.subjectId), {
        subjectId: saveData.subjectId,
        version: ATTENDANCE_SUMMARY_VERSION,
        sessions: { [docId]: { date: saveData.date, hours: saveData.hours, classroom: saveData.classroom } },
        students: studentsPatch,
        updatedAt: new Date(),
      }, { merge: true });
    } catch (err) {
      // The session itself is saved; the summary is rebuilt the next time the teacher opens the subject
      console.error('Error updating attendance summary:', err);
    }
  }

  /**
   * Rebuild a subject's attendance summary from its session documents.
   * Called after the teacher loads all sessions, so it costs one read (+ one write if stale).
   */
  async ensureAttendanceSummary(teacherFirebaseConfig: FirebaseConfig, subjectId: string, sessions: AttendanceData[]): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const ref = doc(database, ATTENDANCE_SUMMARIES, subjectId);
    const existing = await getDoc(ref);
    const current = existing.exists() ? (existing.data() as AttendanceSummary) : null;
    const latestSessionUpdate = Math.max(0, ...sessions.map(sess => toMillis(sess.updatedAt)));
    if (current && current.version === ATTENDANCE_SUMMARY_VERSION
        && Object.keys(current.sessions || {}).length === sessions.length
        && toMillis(current.updatedAt) >= latestSessionUpdate) {
      return;
    }

    const summary: AttendanceSummary = {
      subjectId,
      version: ATTENDANCE_SUMMARY_VERSION,
      sessions: {},
      students: {},
      updatedAt: new Date(),
    };
    for (const session of sessions) {
      const docId = attendanceDocId(session.subjectId, session.classroom, session.date);
      summary.sessions[docId] = { date: session.date, hours: Number(session.hours) || 1, classroom: session.classroom };
      for (const r of session.records || []) {
        (summary.students[r.studentId] ||= {})[docId] = r.status || '';
      }
    }
    await setDoc(ref, summary);
  }

  /**
   * Read a subject's attendance summary (null if it hasn't been built yet).
   */
  async getAttendanceSummary(teacherFirebaseConfig: FirebaseConfig, subjectId: string): Promise<AttendanceSummary | null> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const snap = await getDoc(doc(database, ATTENDANCE_SUMMARIES, subjectId));
    if (!snap.exists()) return null;
    const summary = snap.data() as AttendanceSummary;
    return summary.version === ATTENDANCE_SUMMARY_VERSION ? summary : null;
  }

  /**
   * Get attendance data for a specific date/subject/classroom
   */
  async getAttendance(teacherFirebaseConfig: FirebaseConfig, subjectId: string, classroom: string, date: string): Promise<AttendanceData | null> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    if (!subjectId || !classroom || !date) return null;
    
    const attendanceRef = doc(database, 'attendance', attendanceDocId(subjectId, classroom, date));
    const snap = await getDoc(attendanceRef);
    
    if (snap.exists()) {
      return snap.data() as AttendanceData;
    }
    return null;
  }

  /**
   * Get all attendance records for a specific date
   */
  async getAttendanceByDate(teacherFirebaseConfig: FirebaseConfig, date: string): Promise<AttendanceData[]> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    if (!date) return [];
    
    const q = query(
      collection(database, 'attendance'),
      where('date', '==', date)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(d => d.data() as AttendanceData);
  }

  /**
   * Get all attendance records for a specific subject + classroom
   */
  async getAttendanceBySubject(teacherFirebaseConfig: FirebaseConfig, subjectId: string, classroom: string): Promise<AttendanceData[]> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const q = query(
      collection(database, 'attendance'),
      where('subjectId', '==', subjectId)
    );
    const querySnapshot = await getDocs(q);
    const sessions = querySnapshot.docs.map(d => d.data() as AttendanceData);
    // Keep the student-facing summary in sync (backfills subjects recorded before summaries existed)
    this.ensureAttendanceSummary(teacherFirebaseConfig, subjectId, sessions)
      .catch(err => console.error('Error building attendance summary:', err));
    return sessions;
  }

  /**
   * Delete all data related to a subject from teacher database (grades, assignments, attendance, schedules, materials)
   */
  async deleteSubjectAllData(teacherFirebaseConfig: FirebaseConfig, subjectId: string, classroom: string): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const collectionsToDelete = TEACHER_DB_COLLECTIONS;

    // Query all collections in parallel, then batch delete
    const deletePromises = collectionsToDelete.map(async (collectionName) => {
      try {
        const q = query(
          collection(database, collectionName),
          where('subjectId', '==', subjectId)
        );
        const querySnapshot = await getDocs(q);
        if (querySnapshot.docs.length > 0) {
          const chunks = chunkArray(querySnapshot.docs, 499);
          for (const chunk of chunks) {
            const batch = writeBatch(database);
            for (const docSnapshot of chunk) {
              batch.delete(docSnapshot.ref);
            }
            await batch.commit();
          }
        }
      } catch (error) {
        console.error(`Error deleting subject data from teacher database collection ${collectionName}:`, error);
      }
    });
    await Promise.all(deletePromises);
  }

  /**
   * Delete all attendance records for a specific subject + classroom
   */
  async deleteAttendanceBySubject(teacherFirebaseConfig: FirebaseConfig, subjectId: string, classroom: string): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const q = query(
      collection(database, 'attendance'),
      where('subjectId', '==', subjectId)
    );
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.docs.length > 0) {
      const chunks = chunkArray(querySnapshot.docs, 499);
      for (const chunk of chunks) {
        const batch = writeBatch(database);
        for (const docSnap of chunk) {
          batch.delete(docSnap.ref);
        }
        await batch.commit();
      }
    }
    await deleteDoc(doc(database, ATTENDANCE_SUMMARIES, subjectId));
  }

  /**
   * GRADE & ASSIGNMENT METHODS
   */

  async getGradeConfig(teacherFirebaseConfig: FirebaseConfig, subjectId: string): Promise<GradeConfig | null> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const configRef = doc(database, 'gradeConfigs', subjectId);
    const snap = await getDoc(configRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        ...data,
        updatedAt: data.updatedAt?.toDate() || new Date()
      } as GradeConfig;
    }
    return null;
  }

  async saveGradeConfig(teacherFirebaseConfig: FirebaseConfig, config: GradeConfig): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const configRef = doc(database, 'gradeConfigs', config.subjectId);
    await setDoc(configRef, {
      ...config,
      updatedAt: new Date()
    });
  }

  async getAssignments(teacherFirebaseConfig: FirebaseConfig, subjectId: string, classroom: string): Promise<Assignment[]> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const q = query(
      collection(database, 'assignments'),
      where('subjectId', '==', subjectId),
      where('classroom', '==', classroom)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(d => {
      const data = d.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date()
      } as Assignment;
    });
  }

  async saveAssignment(teacherFirebaseConfig: FirebaseConfig, assignment: Assignment): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const assignmentRef = doc(database, 'assignments', assignment.id);
    await setDoc(assignmentRef, {
      ...assignment,
      createdAt: assignment.createdAt || new Date(),
      updatedAt: new Date()
    });
  }

  async deleteAssignment(teacherFirebaseConfig: FirebaseConfig, assignmentId: string): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    await deleteDoc(doc(database, 'assignments', assignmentId));
  }

  async getAssignmentGroups(teacherFirebaseConfig: FirebaseConfig, subjectId: string, classroom: string): Promise<AssignmentGroup[]> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const q = query(
      collection(database, 'assignmentGroups'),
      where('subjectId', '==', subjectId),
      where('classroom', '==', classroom)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(d => {
      const data = d.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date()
      } as AssignmentGroup;
    });
  }

  async saveAssignmentGroup(teacherFirebaseConfig: FirebaseConfig, group: AssignmentGroup): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const groupRef = doc(database, 'assignmentGroups', group.id);
    await setDoc(groupRef, {
      ...group,
      createdAt: group.createdAt || new Date(),
      updatedAt: new Date()
    });
  }

  async deleteAssignmentGroup(teacherFirebaseConfig: FirebaseConfig, groupId: string): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    await deleteDoc(doc(database, 'assignmentGroups', groupId));
  }

  async getStudentScores(teacherFirebaseConfig: FirebaseConfig, subjectId: string, classroom: string): Promise<StudentScore[]> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const q = query(
      collection(database, 'studentScores'),
      where('subjectId', '==', subjectId),
      where('classroom', '==', classroom)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(d => {
      const data = d.data();
      return {
        ...data,
        updatedAt: data.updatedAt?.toDate() || new Date()
      } as StudentScore;
    });
  }

  async saveStudentScore(teacherFirebaseConfig: FirebaseConfig, score: StudentScore): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const scoreId = `${score.subjectId}_${score.classroom.replace(/\//g, '-')}_${score.studentId}`;
    const scoreRef = doc(database, 'studentScores', scoreId);
    await setDoc(scoreRef, {
      ...score,
      updatedAt: new Date()
    });
  }
}
export const teacherDatabaseService = new TeacherDatabaseService();
