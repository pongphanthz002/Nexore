import { firebaseManager } from '@/lib/firebase';
import { collection, doc, setDoc, getDoc, getDocs, query, where, deleteDoc, writeBatch, WriteBatch, documentId, Firestore, DocumentReference } from 'firebase/firestore';
import { teacherDatabaseService, GradeConfig, Assignment, AssignmentGroup, StudentScore } from '@/services/teacher-database.service';
import { firestoreService } from '@/services/firestore.service';
import { TtlCache, withRetry, chunkArray, runPool, ProgressCallback } from '@/lib/firestore-helpers';
import type { FirebaseConfig } from '@/types/firebase.types';

export interface TeacherFirebaseConfig {
  teacherId: string;
  name: string;
  email: string;
  uid?: string;
  role?: 'teacher' | 'admin';
  firebaseConfig?: FirebaseConfig | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudentData {
  studentId: string;
  name: string;
  email?: string;
  uid?: string;
  role?: 'student';
  class: string;
  number: string;
  schoolId: string;
  teacherNodes: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleSlot {
  day: string;
  time: string;
  duration?: string;
}

export interface SubjectData {
  subjectId: string;
  teacherId: string;
  subjectName: string;
  classroom: string;
  day: string;
  time: string;
  duration?: string; // e.g. "1", "2", "3"
  subjectType?: 'basic' | 'elective'; // 'basic' = วิชาพื้นฐาน, 'elective' = วิชาเพิ่มเติม
  studentIds?: string[]; // IDs of enrolled students for elective subjects
  schedules?: ScheduleSlot[]; // Multiple teaching schedules (up to 3 days)
  createdAt: Date;
  updatedAt: Date;
}

/** Row from the teacher whitelist Excel upload. */
export interface WhitelistTeacherRow {
  teacherId: string;
  name: string;
  email?: string;
}

/** Row from the student whitelist Excel upload. */
export interface WhitelistStudentRow {
  studentId: string;
  name: string;
  class?: string;
  number?: string;
  schoolId?: string;
  email?: string;
  /** Only written when provided; omit to keep the student's existing teacherNodes. */
  teacherNodes?: string[];
}

export interface SubjectWhitelistRow {
  subjectId: string;
  teacherId: string;
  subjectName: string;
  classroom: string;
  day: string;
  time: string;
  duration?: string;
  /** Only written when provided; omit to keep the subject's existing type. */
  subjectType?: 'basic' | 'elective';
  /** Only written when provided; omit to keep the subject's existing schedules. */
  schedules?: ScheduleSlot[];
}

/** Whitelist uploads commit this many writes per batch, several batches at a time. */
const UPLOAD_BATCH_SIZE = 200;
const UPLOAD_CONCURRENCY = 4;

export interface AdminWhitelistRow {
  email: string;
  uid?: string;
  role?: string;
  name?: string;
  schoolId?: string;
}

export interface MemberLookup {
  /** teacherId / studentId (document ID) if known */
  userId?: string;
  uid?: string;
  email?: string | null;
}

export interface MemberResult<T> {
  id: string;
  data: T;
  ref: DocumentReference;
}

/** School data (subjects, rosters) changes rarely; writes through this service invalidate it. */
const CACHE_TTL = 5 * 60 * 1000;

class SchoolDatabaseService {
  private teachersCollection = 'teachers';
  private studentsCollection = 'students';
  private adminsCollection = 'admins';
  private subjectsCollection = 'subjects';

  private subjectsCache = new TtlCache<SubjectData[]>(CACHE_TTL);
  private studentsCache = new TtlCache<StudentData[]>(CACHE_TTL);
  private teachersCache = new TtlCache<TeacherFirebaseConfig[]>(CACHE_TTL);
  private studentCache = new TtlCache<StudentData | null>(CACHE_TTL);
  private studentSubjectsCache = new TtlCache<SubjectData[]>(CACHE_TTL);
  private teachersByIdCache = new TtlCache<TeacherFirebaseConfig | null>(CACHE_TTL);
  private teacherSubjectsCache = new TtlCache<SubjectData[]>(CACHE_TTL);
  private subjectStudentsCache = new TtlCache<StudentData[]>(CACHE_TTL);

  clearCache(): void {
    this.subjectsCache.invalidate();
    this.studentsCache.invalidate();
    this.teachersCache.invalidate();
    this.studentCache.invalidate();
    this.studentSubjectsCache.invalidate();
    this.teachersByIdCache.invalidate();
    this.teacherSubjectsCache.invalidate();
    this.subjectStudentsCache.invalidate();
  }

  private invalidateTeachers(): void {
    this.teachersCache.invalidate();
    this.teachersByIdCache.invalidate();
  }

  private invalidateStudents(): void {
    this.studentsCache.invalidate();
    this.studentCache.invalidate();
    this.studentSubjectsCache.invalidate();
    this.subjectStudentsCache.invalidate();
  }

  private invalidateSubjects(): void {
    this.subjectsCache.invalidate();
    this.studentSubjectsCache.invalidate();
    this.teacherSubjectsCache.invalidate();
  }

  private getSchoolDB(schoolFirebaseConfig: FirebaseConfig): Firestore {
    return firebaseManager.getSchoolDb(schoolFirebaseConfig);
  }

  // ---------------------------------------------------------------------------
  // Identity lookup
  // ---------------------------------------------------------------------------

  /**
   * Find a teacher/admin (teachers collection) or student by identity.
   * Order: direct doc read by userId (verifying uid/email), then query by uid, then by email.
   * Fills in a missing uid on the found document.
   */
  async findMember<T extends { uid?: string; email?: string }>(
    schoolFirebaseConfig: FirebaseConfig,
    kind: 'teacher' | 'student',
    lookup: MemberLookup
  ): Promise<MemberResult<T> | null> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const collectionName = kind === 'teacher' ? this.teachersCollection : this.studentsCollection;
    const colRef = collection(database, collectionName);

    let found: MemberResult<T> | null = null;

    if (lookup.userId) {
      const snap = await withRetry(() => getDoc(doc(colRef, lookup.userId!)));
      if (snap.exists()) {
        const data = snap.data() as T;
        const matches = (!!lookup.uid && data.uid === lookup.uid) || (!!lookup.email && data.email === lookup.email);
        if (matches) found = { id: snap.id, data, ref: snap.ref };
      }
    }

    if (!found && lookup.uid) {
      const snap = await withRetry(() => getDocs(query(colRef, where('uid', '==', lookup.uid))));
      if (!snap.empty) found = { id: snap.docs[0].id, data: snap.docs[0].data() as T, ref: snap.docs[0].ref };
    }

    if (!found && lookup.email) {
      const snap = await withRetry(() => getDocs(query(colRef, where('email', '==', lookup.email))));
      if (!snap.empty) found = { id: snap.docs[0].id, data: snap.docs[0].data() as T, ref: snap.docs[0].ref };
    }

    if (found && !found.data.uid && lookup.uid) {
      setDoc(found.ref, { uid: lookup.uid }, { merge: true })
        .catch(err => console.error(`Error updating ${kind} uid:`, err));
    }

    return found;
  }

  // ---------------------------------------------------------------------------
  // Teachers
  // ---------------------------------------------------------------------------

  /**
   * Save teacher record. Merges so fields not passed (e.g. firebaseConfig) are kept.
   */
  async saveTeacherConfig(schoolFirebaseConfig: FirebaseConfig, teacherConfig: TeacherFirebaseConfig): Promise<void> {
    this.invalidateTeachers();
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const teacherRef = doc(database, this.teachersCollection, teacherConfig.teacherId);
    await setDoc(teacherRef, {
      ...teacherConfig,
      updatedAt: new Date(),
    }, { merge: true });
  }

  /**
   * Point a teacher at a (new) Teacher DB. Only updates firebaseConfig; validate the
   * config with teacherDatabaseService.validateConfigShape/verifyConnection first.
   */
  async updateTeacherFirebaseConfig(schoolFirebaseConfig: FirebaseConfig, teacherId: string, firebaseConfig: FirebaseConfig): Promise<void> {
    this.invalidateTeachers();
    const database = this.getSchoolDB(schoolFirebaseConfig);
    await setDoc(doc(database, this.teachersCollection, teacherId), {
      firebaseConfig,
      updatedAt: new Date(),
    }, { merge: true });
  }

  /**
   * Get teacher config from school database
   */
  async getTeacherConfig(schoolFirebaseConfig: FirebaseConfig, teacherId: string): Promise<TeacherFirebaseConfig | null> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const teacherSnap = await withRetry(() => getDoc(doc(database, this.teachersCollection, teacherId)));
    return teacherSnap.exists() ? (teacherSnap.data() as TeacherFirebaseConfig) : null;
  }

  /**
   * Get teacher data from school database (alias of getTeacherConfig)
   */
  async getTeacherData(schoolFirebaseConfig: FirebaseConfig, teacherId: string): Promise<TeacherFirebaseConfig | null> {
    return this.getTeacherConfig(schoolFirebaseConfig, teacherId);
  }

  /**
   * Get all teachers from school database (cached for 5 minutes)
   */
  async getAllTeachers(schoolFirebaseConfig: FirebaseConfig, forceRefresh = false): Promise<TeacherFirebaseConfig[]> {
    return this.teachersCache.getOrLoad(`${schoolFirebaseConfig.projectId}:all`, async () => {
      const database = this.getSchoolDB(schoolFirebaseConfig);
      const querySnapshot = await withRetry(() => getDocs(collection(database, this.teachersCollection)));
      return querySnapshot.docs.map(d => d.data() as TeacherFirebaseConfig);
    }, forceRefresh);
  }

  /**
   * Same data as getAllTeachers (shares its cache). Kept for existing callers.
   */
  async getAllTeachersOptimized(schoolFirebaseConfig: FirebaseConfig, forceRefresh = false): Promise<TeacherFirebaseConfig[]> {
    return this.getAllTeachers(schoolFirebaseConfig, forceRefresh);
  }

  /**
   * Get specific teachers by ID without loading the whole collection.
   * Uses the full-list cache when it is warm.
   */
  async getTeachersByIds(schoolFirebaseConfig: FirebaseConfig, teacherIds: string[]): Promise<TeacherFirebaseConfig[]> {
    const projectId = schoolFirebaseConfig.projectId;
    const ids = Array.from(new Set(teacherIds.filter(Boolean)));
    if (ids.length === 0) return [];

    const all = this.teachersCache.get(`${projectId}:all`);
    if (all) return all.filter(t => ids.includes(t.teacherId));

    const result: TeacherFirebaseConfig[] = [];
    const missing: string[] = [];
    for (const id of ids) {
      const cached = this.teachersByIdCache.get(`${projectId}:${id}`);
      if (cached !== undefined) {
        if (cached) result.push(cached);
      } else {
        missing.push(id);
      }
    }

    if (missing.length > 0) {
      const database = this.getSchoolDB(schoolFirebaseConfig);
      const colRef = collection(database, this.teachersCollection);
      const snaps = await Promise.all(
        chunkArray(missing, 30).map(chunk => withRetry(() => getDocs(query(colRef, where(documentId(), 'in', chunk)))))
      );
      const foundIds = new Set<string>();
      for (const snap of snaps) {
        for (const d of snap.docs) {
          const data = d.data() as TeacherFirebaseConfig;
          foundIds.add(d.id);
          this.teachersByIdCache.set(`${projectId}:${d.id}`, data);
          result.push(data);
        }
      }
      missing.filter(id => !foundIds.has(id)).forEach(id => this.teachersByIdCache.set(`${projectId}:${id}`, null));
    }

    return result;
  }

  /**
   * Save teacher whitelist to school database.
   * Writes only whitelist-owned fields with merge, so email/uid/role/firebaseConfig
   * set during teacher setup are never overwritten.
   */
  async saveTeacherWhitelist(schoolFirebaseConfig: FirebaseConfig, teachers: WhitelistTeacherRow[], onProgress?: ProgressCallback): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    // Existing roster (usually already cached by the admin page) tells us which docs are new
    const existing = await this.getAllTeachers(schoolFirebaseConfig);
    const existingIds = new Set(existing.map(t => t.teacherId));
    this.invalidateTeachers();

    await this.commitInBatches(teachers.filter(t => t.teacherId), onProgress, (batch, chunk) => {
      for (const teacher of chunk) {
        const teacherRef = doc(database, this.teachersCollection, teacher.teacherId);
        const teacherData: Record<string, unknown> = {
          teacherId: teacher.teacherId,
          name: teacher.name,
          updatedAt: new Date(),
        };
        if (!existingIds.has(teacher.teacherId)) {
          teacherData.createdAt = new Date();
          if (teacher.email) teacherData.email = teacher.email;
        }
        batch.set(teacherRef, teacherData, { merge: true });
      }
    }, database);
  }

  async deleteTeacher(schoolFirebaseConfig: FirebaseConfig, teacherId: string): Promise<void> {
    this.invalidateTeachers();
    const database = this.getSchoolDB(schoolFirebaseConfig);
    await deleteDoc(doc(database, this.teachersCollection, teacherId));
  }

  async deleteTeacherWhitelist(schoolFirebaseConfig: FirebaseConfig, teacherIds: string[]): Promise<void> {
    this.invalidateTeachers();
    const database = this.getSchoolDB(schoolFirebaseConfig);
    for (const chunk of chunkArray(teacherIds, 499)) {
      const batch = writeBatch(database);
      chunk.forEach(id => batch.delete(doc(database, this.teachersCollection, id)));
      await batch.commit();
    }
  }

  // ---------------------------------------------------------------------------
  // Students
  // ---------------------------------------------------------------------------

  /**
   * Save student whitelist to school database.
   * Writes only whitelist-owned fields with merge: email/uid/role set during student setup
   * are never overwritten, and teacherNodes is only written when the row provides it.
   * Returns teacher IDs referenced in teacherNodes that don't exist in the teachers collection.
   */
  async saveStudentWhitelist(
    schoolFirebaseConfig: FirebaseConfig,
    students: WhitelistStudentRow[],
    onProgress?: ProgressCallback
  ): Promise<{ unknownTeacherIds: string[] }> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const [existingStudents, teachers] = await Promise.all([
      this.getAllStudents(schoolFirebaseConfig),
      this.getAllTeachers(schoolFirebaseConfig),
    ]);
    const existingIds = new Set(existingStudents.map(s => s.studentId));
    const teacherIds = new Set(teachers.map(t => t.teacherId));
    const unknownTeacherIds = new Set<string>();
    this.invalidateStudents();

    await this.commitInBatches(students.filter(s => s.studentId), onProgress, (batch, chunk) => {
      for (const student of chunk) {
        const studentRef = doc(database, this.studentsCollection, student.studentId);
        const isNew = !existingIds.has(student.studentId);
        const studentData: Record<string, unknown> = {
          studentId: student.studentId,
          name: student.name,
          class: student.class || '',
          number: student.number || '',
          schoolId: student.schoolId || 'default',
          updatedAt: new Date(),
        };

        if (Array.isArray(student.teacherNodes) && student.teacherNodes.length > 0) {
          studentData.teacherNodes = student.teacherNodes;
          student.teacherNodes.filter(id => !teacherIds.has(id)).forEach(id => unknownTeacherIds.add(id));
        } else if (isNew) {
          studentData.teacherNodes = [];
        }

        if (isNew) {
          studentData.createdAt = new Date();
          studentData.role = 'student';
          if (student.email) studentData.email = student.email;
        }

        batch.set(studentRef, studentData, { merge: true });
      }
    }, database);

    return { unknownTeacherIds: Array.from(unknownTeacherIds) };
  }

  /**
   * Save single student data (merge). Used during student setup to update email and uid.
   */
  async saveStudentData(schoolFirebaseConfig: FirebaseConfig, studentData: Partial<StudentData> & { studentId: string }): Promise<void> {
    this.invalidateStudents();
    const database = this.getSchoolDB(schoolFirebaseConfig);
    await setDoc(doc(database, this.studentsCollection, studentData.studentId), studentData, { merge: true });
  }

  /**
   * Get student data by studentId (cached for 5 minutes; several student pages call this).
   */
  async getStudentData(schoolFirebaseConfig: FirebaseConfig, studentId: string, forceRefresh = false): Promise<StudentData | null> {
    if (!studentId) return null;
    return this.studentCache.getOrLoad(`${schoolFirebaseConfig.projectId}:id:${studentId}`, async () => {
      const database = this.getSchoolDB(schoolFirebaseConfig);
      const snap = await withRetry(() => getDoc(doc(database, this.studentsCollection, studentId)));
      return snap.exists() ? (snap.data() as StudentData) : null;
    }, forceRefresh);
  }

  /**
   * Get student data by email (cached for 5 minutes)
   */
  async getStudentDataByEmail(schoolFirebaseConfig: FirebaseConfig, email: string): Promise<StudentData | null> {
    if (!email) return null;
    return this.studentCache.getOrLoad(`${schoolFirebaseConfig.projectId}:email:${email}`, async () => {
      const database = this.getSchoolDB(schoolFirebaseConfig);
      const snap = await withRetry(() => getDocs(query(collection(database, this.studentsCollection), where('email', '==', email))));
      return snap.empty ? null : (snap.docs[0].data() as StudentData);
    });
  }

  /**
   * The signed-in student's record: by studentId (userId), falling back to email.
   * Both lookups are cached, so every student screen can call this freely.
   */
  async getStudentForAccount(
    schoolFirebaseConfig: FirebaseConfig,
    account: { userId?: string; email?: string | null },
    forceRefresh = false
  ): Promise<StudentData | null> {
    const byId = await this.getStudentData(schoolFirebaseConfig, account.userId || '', forceRefresh);
    if (byId || !account.email) return byId;
    return this.getStudentDataByEmail(schoolFirebaseConfig, account.email);
  }

  /**
   * Get all students from school database (cached for 5 minutes)
   */
  async getAllStudents(schoolFirebaseConfig: FirebaseConfig, forceRefresh = false): Promise<StudentData[]> {
    return this.studentsCache.getOrLoad(`${schoolFirebaseConfig.projectId}:all`, async () => {
      const database = this.getSchoolDB(schoolFirebaseConfig);
      const querySnapshot = await withRetry(() => getDocs(collection(database, this.studentsCollection)));
      return querySnapshot.docs.map(d => d.data() as StudentData);
    }, forceRefresh);
  }

  /**
   * Same data as getAllStudents (shares its cache). Kept for existing callers.
   */
  async getAllStudentsOptimized(schoolFirebaseConfig: FirebaseConfig): Promise<StudentData[]> {
    return this.getAllStudents(schoolFirebaseConfig);
  }

  async deleteStudent(schoolFirebaseConfig: FirebaseConfig, studentId: string): Promise<void> {
    this.invalidateStudents();
    const database = this.getSchoolDB(schoolFirebaseConfig);
    await deleteDoc(doc(database, this.studentsCollection, studentId));
  }

  async deleteStudentWhitelist(schoolFirebaseConfig: FirebaseConfig, studentIds: string[]): Promise<void> {
    this.invalidateStudents();
    const database = this.getSchoolDB(schoolFirebaseConfig);
    for (const chunk of chunkArray(studentIds, 499)) {
      const batch = writeBatch(database);
      chunk.forEach(id => batch.delete(doc(database, this.studentsCollection, id)));
      await batch.commit();
    }
  }

  // ---------------------------------------------------------------------------
  // Admins
  // ---------------------------------------------------------------------------

  async saveAdminWhitelist(schoolFirebaseConfig: FirebaseConfig, admins: AdminWhitelistRow[]): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    for (const chunk of chunkArray(admins, 499)) {
      const batch = writeBatch(database);
      for (const admin of chunk) {
        batch.set(doc(database, this.adminsCollection, admin.email), {
          email: admin.email,
          uid: admin.uid || '',
          role: admin.role || 'admin',
          name: admin.name || 'Admin',
          schoolId: admin.schoolId || 'default',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      await batch.commit();
    }
  }

  async deleteAdmin(schoolFirebaseConfig: FirebaseConfig, email: string): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    await deleteDoc(doc(database, this.adminsCollection, email));
  }

  // ---------------------------------------------------------------------------
  // Subjects
  // ---------------------------------------------------------------------------

  /**
   * Get all subjects from school database (cached for 5 minutes).
   * For student screens use getSubjectsForStudent instead.
   */
  async getAllSubjects(schoolFirebaseConfig: FirebaseConfig, forceRefresh = false): Promise<SubjectData[]> {
    return this.subjectsCache.getOrLoad(`${schoolFirebaseConfig.projectId}:all`, async () => {
      const database = this.getSchoolDB(schoolFirebaseConfig);
      const querySnapshot = await withRetry(() => getDocs(collection(database, this.subjectsCollection)));
      return querySnapshot.docs.map(d => d.data() as SubjectData);
    }, forceRefresh);
  }

  /**
   * Subjects a student takes: basic subjects of their classroom plus electives they're enrolled in.
   * Reads only matching documents (two indexed queries) instead of the whole collection.
   */
  async getSubjectsForStudent(
    schoolFirebaseConfig: FirebaseConfig,
    student: Pick<StudentData, 'studentId' | 'class'>,
    forceRefresh = false
  ): Promise<SubjectData[]> {
    const projectId = schoolFirebaseConfig.projectId;
    const key = `${projectId}:${student.studentId}:${student.class}`;
    return this.studentSubjectsCache.getOrLoad(key, async () => {
      const all = this.subjectsCache.get(`${projectId}:all`);
      let candidates: SubjectData[];
      if (all) {
        candidates = all;
      } else {
        const database = this.getSchoolDB(schoolFirebaseConfig);
        const colRef = collection(database, this.subjectsCollection);
        const [byClass, byEnrollment] = await Promise.all([
          student.class
            ? withRetry(() => getDocs(query(colRef, where('classroom', '==', student.class))))
            : Promise.resolve(null),
          student.studentId
            ? withRetry(() => getDocs(query(colRef, where('studentIds', 'array-contains', student.studentId))))
            : Promise.resolve(null),
        ]);
        const byId = new Map<string, SubjectData>();
        for (const snap of [byClass, byEnrollment]) {
          snap?.docs.forEach(d => byId.set(d.id, d.data() as SubjectData));
        }
        candidates = Array.from(byId.values());
      }

      return candidates.filter(subject => {
        if (subject.subjectType === 'elective') {
          return Array.isArray(subject.studentIds) && subject.studentIds.includes(student.studentId);
        }
        return subject.classroom === student.class;
      });
    }, forceRefresh);
  }

  /**
   * Subjects taught by one teacher (single indexed query, cached 5 minutes).
   */
  async getSubjectsForTeacher(schoolFirebaseConfig: FirebaseConfig, teacherId: string, forceRefresh = false): Promise<SubjectData[]> {
    const projectId = schoolFirebaseConfig.projectId;
    if (!teacherId) return [];
    return this.teacherSubjectsCache.getOrLoad(`${projectId}:${teacherId}`, async () => {
      const all = this.subjectsCache.get(`${projectId}:all`);
      if (all) return all.filter(s => s.teacherId === teacherId);
      const database = this.getSchoolDB(schoolFirebaseConfig);
      const snap = await withRetry(() => getDocs(query(collection(database, this.subjectsCollection), where('teacherId', '==', teacherId))));
      return snap.docs.map(d => d.data() as SubjectData);
    }, forceRefresh);
  }

  /**
   * Students enrolled in the given subjects: whole classrooms for basic subjects,
   * listed studentIds for electives that have them. Reads only those students.
   */
  async getStudentsForSubjects(schoolFirebaseConfig: FirebaseConfig, subjects: SubjectData[]): Promise<StudentData[]> {
    const classrooms = new Set<string>();
    const studentIds = new Set<string>();
    for (const subject of subjects) {
      if (subject.subjectType === 'elective' && Array.isArray(subject.studentIds) && subject.studentIds.length > 0) {
        subject.studentIds.forEach(id => studentIds.add(id));
      } else if (subject.classroom) {
        classrooms.add(subject.classroom);
      }
    }
    if (classrooms.size === 0 && studentIds.size === 0) return [];

    const projectId = schoolFirebaseConfig.projectId;
    const key = `${projectId}:${Array.from(classrooms).sort().join('|')}:${Array.from(studentIds).sort().join('|')}`;
    return this.subjectStudentsCache.getOrLoad(key, async () => {
      const all = this.studentsCache.get(`${projectId}:all`);
      if (all) return all.filter(s => classrooms.has(s.class) || studentIds.has(s.studentId));

      const database = this.getSchoolDB(schoolFirebaseConfig);
      const colRef = collection(database, this.studentsCollection);
      const snaps = await Promise.all([
        ...chunkArray(Array.from(classrooms), 30).map(chunk =>
          withRetry(() => getDocs(query(colRef, where('class', 'in', chunk))))),
        ...chunkArray(Array.from(studentIds), 30).map(chunk =>
          withRetry(() => getDocs(query(colRef, where(documentId(), 'in', chunk))))),
      ]);
      const byId = new Map<string, StudentData>();
      snaps.forEach(snap => snap.docs.forEach(d => byId.set(d.id, d.data() as StudentData)));
      return Array.from(byId.values());
    });
  }

  /**
   * Save subject whitelist to school database (merge keeps createdAt and extra fields)
   */
  async saveSubjectWhitelist(schoolFirebaseConfig: FirebaseConfig, subjects: SubjectWhitelistRow[], onProgress?: ProgressCallback): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const existing = await this.getAllSubjects(schoolFirebaseConfig);
    const existingIds = new Set(existing.map(s => s.subjectId));
    this.invalidateSubjects();

    await this.commitInBatches(subjects.filter(s => s.subjectId), onProgress, (batch, chunk) => {
      for (const subject of chunk) {
        const subjectData: Record<string, unknown> = {
          subjectId: subject.subjectId,
          teacherId: subject.teacherId,
          subjectName: subject.subjectName,
          classroom: subject.classroom,
          day: subject.day,
          time: subject.time,
          duration: subject.duration || '1',
          updatedAt: new Date(),
        };
        if (subject.subjectType) subjectData.subjectType = subject.subjectType;
        if (subject.schedules) subjectData.schedules = subject.schedules;
        if (!existingIds.has(subject.subjectId)) subjectData.createdAt = new Date();
        batch.set(doc(database, this.subjectsCollection, subject.subjectId), subjectData, { merge: true });
      }
    }, database);
  }

  /**
   * Commit rows in write batches, several batches in parallel, reporting rows written.
   * Whitelist writes are idempotent merges, so a retried batch is safe.
   */
  private async commitInBatches<T>(
    rows: T[],
    onProgress: ProgressCallback | undefined,
    fill: (batch: WriteBatch, chunk: T[]) => void,
    database: Firestore
  ): Promise<void> {
    let done = 0;
    onProgress?.(0, rows.length);
    await runPool(chunkArray(rows, UPLOAD_BATCH_SIZE), UPLOAD_CONCURRENCY, async chunk => {
      await withRetry(() => {
        const batch = writeBatch(database);
        fill(batch, chunk);
        return batch.commit();
      });
      done += chunk.length;
      onProgress?.(done, rows.length);
    });
  }

  /**
   * Add single subject to school database
   */
  async addSubject(schoolFirebaseConfig: FirebaseConfig, subject: Partial<SubjectData> & { subjectId: string }): Promise<void> {
    this.invalidateSubjects();
    const database = this.getSchoolDB(schoolFirebaseConfig);
    await setDoc(doc(database, this.subjectsCollection, subject.subjectId), {
      ...subject,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async deleteSubject(schoolFirebaseConfig: FirebaseConfig, subjectId: string): Promise<void> {
    this.invalidateSubjects();
    const database = this.getSchoolDB(schoolFirebaseConfig);
    await deleteDoc(doc(database, this.subjectsCollection, subjectId));
  }

  // ---------------------------------------------------------------------------
  // Teacher data stored in the School DB (teachers without their own Firebase project)
  // These are the same operations as teacherDatabaseService, pointed at the school project.
  // ---------------------------------------------------------------------------

  async getAttendanceBySubject(schoolFirebaseConfig: FirebaseConfig, subjectId: string, classroom: string) {
    return teacherDatabaseService.getAttendanceBySubject(schoolFirebaseConfig, subjectId, classroom);
  }

  async deleteSubjectAllData(schoolFirebaseConfig: FirebaseConfig, subjectId: string, classroom: string): Promise<void> {
    this.invalidateSubjects();
    await teacherDatabaseService.deleteSubjectAllData(schoolFirebaseConfig, subjectId, classroom);
  }

  async deleteAttendanceBySubject(schoolFirebaseConfig: FirebaseConfig, subjectId: string, classroom: string): Promise<void> {
    return teacherDatabaseService.deleteAttendanceBySubject(schoolFirebaseConfig, subjectId, classroom);
  }

  async getGradeConfig(schoolFirebaseConfig: FirebaseConfig, subjectId: string): Promise<GradeConfig | null> {
    return teacherDatabaseService.getGradeConfig(schoolFirebaseConfig, subjectId);
  }

  async saveGradeConfig(schoolFirebaseConfig: FirebaseConfig, config: GradeConfig): Promise<void> {
    return teacherDatabaseService.saveGradeConfig(schoolFirebaseConfig, config);
  }

  async getAssignments(schoolFirebaseConfig: FirebaseConfig, subjectId: string, classroom: string): Promise<Assignment[]> {
    return teacherDatabaseService.getAssignments(schoolFirebaseConfig, subjectId, classroom);
  }

  async saveAssignment(schoolFirebaseConfig: FirebaseConfig, assignment: Assignment): Promise<void> {
    return teacherDatabaseService.saveAssignment(schoolFirebaseConfig, assignment);
  }

  async deleteAssignment(schoolFirebaseConfig: FirebaseConfig, assignmentId: string): Promise<void> {
    return teacherDatabaseService.deleteAssignment(schoolFirebaseConfig, assignmentId);
  }

  async getAssignmentGroups(schoolFirebaseConfig: FirebaseConfig, subjectId: string, classroom: string): Promise<AssignmentGroup[]> {
    return teacherDatabaseService.getAssignmentGroups(schoolFirebaseConfig, subjectId, classroom);
  }

  async saveAssignmentGroup(schoolFirebaseConfig: FirebaseConfig, group: AssignmentGroup): Promise<void> {
    return teacherDatabaseService.saveAssignmentGroup(schoolFirebaseConfig, group);
  }

  async deleteAssignmentGroup(schoolFirebaseConfig: FirebaseConfig, groupId: string): Promise<void> {
    return teacherDatabaseService.deleteAssignmentGroup(schoolFirebaseConfig, groupId);
  }

  async getStudentScores(schoolFirebaseConfig: FirebaseConfig, subjectId: string, classroom: string): Promise<StudentScore[]> {
    return teacherDatabaseService.getStudentScores(schoolFirebaseConfig, subjectId, classroom);
  }

  async saveStudentScore(schoolFirebaseConfig: FirebaseConfig, score: StudentScore): Promise<void> {
    return teacherDatabaseService.saveStudentScore(schoolFirebaseConfig, score);
  }

  // ---------------------------------------------------------------------------
  // Bulk deletion
  // ---------------------------------------------------------------------------

  /**
   * Delete all school data (teachers, students, subjects)
   */
  async deleteAllSchoolData(schoolFirebaseConfig: FirebaseConfig): Promise<void> {
    const [teachers, students, subjects] = await Promise.all([
      this.getAllTeachers(schoolFirebaseConfig, true),
      this.getAllStudents(schoolFirebaseConfig, true),
      this.getAllSubjects(schoolFirebaseConfig, true),
    ]);

    if (teachers.length > 0) {
      await this.deleteTeacherWhitelist(schoolFirebaseConfig, teachers.map(t => t.teacherId));
    }
    if (students.length > 0) {
      await this.deleteStudentWhitelist(schoolFirebaseConfig, students.map(s => s.studentId));
    }

    const database = this.getSchoolDB(schoolFirebaseConfig);
    for (const chunk of chunkArray(subjects.map(s => s.subjectId), 499)) {
      const batch = writeBatch(database);
      chunk.forEach(id => batch.delete(doc(database, this.subjectsCollection, id)));
      await batch.commit();
    }
    this.clearCache();
  }

  /**
   * Delete all teacher databases for all teachers in the school
   */
  async deleteAllTeacherDatabases(schoolFirebaseConfig: FirebaseConfig): Promise<void> {
    const teachers = await this.getAllTeachers(schoolFirebaseConfig, true);
    for (const teacher of teachers) {
      if (teacher.firebaseConfig) {
        try {
          await teacherDatabaseService.deleteTeacherDatabase(teacher.firebaseConfig);
        } catch (error) {
          console.error(`Error deleting teacher database for ${teacher.teacherId}:`, error);
        }
      }
    }
  }

  /**
   * Delete all user accounts from Master Registry (teachers and students)
   */
  async deleteAllUserAccountsFromMasterRegistry(teacherEmails: string[], studentEmails: string[]): Promise<void> {
    for (const email of [...teacherEmails, ...studentEmails]) {
      if (!email) continue;
      try {
        await firestoreService.deleteUserAccount(email);
      } catch (error) {
        console.error(`Error deleting account ${email}:`, error);
      }
    }
  }
}

export const schoolDatabaseService = new SchoolDatabaseService();
