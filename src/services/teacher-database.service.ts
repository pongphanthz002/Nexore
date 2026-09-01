import { firebaseManager } from '@/lib/firebase';
import { collection, doc, getDocs, getDoc, setDoc, query, where, deleteDoc, Firestore } from 'firebase/firestore';

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

class TeacherDatabaseService {
  /**
   * Get teacher database instance using teacher's Firebase config
   */
  private getTeacherDB(teacherFirebaseConfig: any): Firestore {
    const instance = firebaseManager.getInstance(teacherFirebaseConfig, `teacher-${teacherFirebaseConfig.projectId}`);
    return instance.db;
  }

  /**
   * Delete all data for a specific student from a teacher's database
   * This deletes all collections related to the student (grades, assignments, attendance, etc.)
   */
  async deleteAllStudentData(teacherFirebaseConfig: any, studentId: string): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    
    // Collections to delete student data from
    const collectionsToDelete = [
      'grades',
      'assignments',
      'attendance',
      'schedules',
      'materials'
    ];

    try {
      for (const collectionName of collectionsToDelete) {
        const q = query(
          collection(database, collectionName),
          where('studentId', '==', studentId)
        );
        const querySnapshot = await getDocs(q);
        
        for (const doc of querySnapshot.docs) {
          await deleteDoc(doc.ref);
        }
      }
    } catch (error) {
      console.error(`Error deleting student data from collection:`, error);
      throw error;
    }
  }

  /**
   * Delete entire teacher database (when teacher is deleted)
   * This deletes all collections in the teacher's database
   */
  async deleteTeacherDatabase(teacherFirebaseConfig: any): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    
    // Collections to delete
    const collectionsToDelete = [
      'grades',
      'assignments',
      'attendance',
      'schedules',
      'materials'
    ];

    try {
      for (const collectionName of collectionsToDelete) {
        const querySnapshot = await getDocs(collection(database, collectionName));
        
        for (const doc of querySnapshot.docs) {
          await deleteDoc(doc.ref);
        }
      }
    } catch (error) {
      console.error('Error deleting teacher database:', error);
      throw error;
    }
  }

  /**
   * Save attendance data to teacher's database
   */
  async saveAttendance(teacherFirebaseConfig: any, data: AttendanceData): Promise<void> {
    if (!teacherFirebaseConfig || !teacherFirebaseConfig.projectId) {
      throw new Error('Invalid Firebase configuration');
    }
    
    const database = this.getTeacherDB(teacherFirebaseConfig);
    if (!data.subjectId || !data.classroom || !data.date) {
      throw new Error('Missing subjectId, classroom, or date');
    }
    
    // Normalize docId for Firestore (must be unique per subject-classroom-date)
    const safeClassroom = String(data.classroom).replace(/\//g, '-').replace(/\s+/g, '');
    const safeDate = String(data.date).replace(/\//g, '-').replace(/\s+/g, '');
    const docId = `${data.subjectId}_${safeClassroom}_${safeDate}`;
    const attendanceRef = doc(database, 'attendance', docId);
    
    // Ensure all data is Firestore-friendly and serializable
    const existingDoc = await getDoc(attendanceRef);
    const saveData = {
      subjectId: String(data.subjectId),
      subjectName: String(data.subjectName || ''),
      classroom: String(data.classroom),
      date: String(data.date),
      hours: Number(data.hours) || 1,
      records: Array.isArray(data.records) ? data.records.map(r => ({
        studentId: String(r.studentId),
        name: String(r.name || ''),
        number: String(r.number || ''),
        status: String(r.status || '')
      })) : [],
      updatedAt: new Date(),
      createdAt: (existingDoc.exists() && existingDoc.data()?.createdAt) ? existingDoc.data().createdAt : new Date()
    };
    
    await setDoc(attendanceRef, saveData);
  }

  /**
   * Get attendance data for a specific date/subject/classroom
   */
  async getAttendance(teacherFirebaseConfig: any, subjectId: string, classroom: string, date: string): Promise<AttendanceData | null> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    if (!subjectId || !classroom || !date) return null;
    
    // Use the same safe formatting for docId
    const safeClassroom = String(classroom).replace(/\//g, '-').replace(/\s+/g, '');
    const safeDate = String(date).replace(/\//g, '-').replace(/\s+/g, '');
    const docId = `${subjectId}_${safeClassroom}_${safeDate}`;
    const attendanceRef = doc(database, 'attendance', docId);
    const snap = await getDoc(attendanceRef);
    
    if (snap.exists()) {
      return snap.data() as AttendanceData;
    }
    return null;
  }

  /**
   * Get all attendance records for a specific date
   */
  async getAttendanceByDate(teacherFirebaseConfig: any, date: string): Promise<AttendanceData[]> {
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
  async getAttendanceBySubject(teacherFirebaseConfig: any, subjectId: string, classroom: string): Promise<AttendanceData[]> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const q = query(
      collection(database, 'attendance'),
      where('subjectId', '==', subjectId)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(d => d.data() as AttendanceData);
  }

  /**
   * Delete all data related to a subject from teacher database (grades, assignments, attendance, schedules, materials)
   */
  async deleteSubjectAllData(teacherFirebaseConfig: any, subjectId: string, classroom: string): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const collectionsToDelete = [
      'grades', 
      'assignments', 
      'attendance', 
      'schedules', 
      'materials',
      'gradeConfigs',
      'assignmentGroups',
      'studentScores'
    ];
    
    for (const collectionName of collectionsToDelete) {
      try {
        // Query by subjectId is enough and more robust than including classroom
        const q = query(
          collection(database, collectionName),
          where('subjectId', '==', subjectId)
        );
        const querySnapshot = await getDocs(q);
        for (const docSnapshot of querySnapshot.docs) {
          await deleteDoc(docSnapshot.ref);
        }
      } catch (error) {
        console.error(`Error deleting subject data from teacher database collection ${collectionName}:`, error);
      }
    }
  }

  /**
   * Delete all attendance records for a specific subject + classroom
   */
  async deleteAttendanceBySubject(teacherFirebaseConfig: any, subjectId: string, classroom: string): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const q = query(
      collection(database, 'attendance'),
      where('subjectId', '==', subjectId)
    );
    const querySnapshot = await getDocs(q);
    
    for (const doc of querySnapshot.docs) {
      await deleteDoc(doc.ref);
    }
  }

  /**
   * GRADE & ASSIGNMENT METHODS
   */

  async getGradeConfig(teacherFirebaseConfig: any, subjectId: string): Promise<GradeConfig | null> {
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

  async saveGradeConfig(teacherFirebaseConfig: any, config: GradeConfig): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const configRef = doc(database, 'gradeConfigs', config.subjectId);
    await setDoc(configRef, {
      ...config,
      updatedAt: new Date()
    });
  }

  async getAssignments(teacherFirebaseConfig: any, subjectId: string, classroom: string): Promise<Assignment[]> {
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

  async saveAssignment(teacherFirebaseConfig: any, assignment: Assignment): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const assignmentRef = doc(database, 'assignments', assignment.id);
    await setDoc(assignmentRef, {
      ...assignment,
      createdAt: assignment.createdAt || new Date(),
      updatedAt: new Date()
    });
  }

  async deleteAssignment(teacherFirebaseConfig: any, assignmentId: string): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    await deleteDoc(doc(database, 'assignments', assignmentId));
  }

  async getAssignmentGroups(teacherFirebaseConfig: any, subjectId: string, classroom: string): Promise<AssignmentGroup[]> {
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

  async saveAssignmentGroup(teacherFirebaseConfig: any, group: AssignmentGroup): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const groupRef = doc(database, 'assignmentGroups', group.id);
    await setDoc(groupRef, {
      ...group,
      createdAt: group.createdAt || new Date(),
      updatedAt: new Date()
    });
  }

  async deleteAssignmentGroup(teacherFirebaseConfig: any, groupId: string): Promise<void> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    await deleteDoc(doc(database, 'assignmentGroups', groupId));
  }

  async getStudentScores(teacherFirebaseConfig: any, subjectId: string, classroom: string): Promise<StudentScore[]> {
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

  async saveStudentScore(teacherFirebaseConfig: any, score: StudentScore): Promise<void> {
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
