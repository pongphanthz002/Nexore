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
    const safeClassroom = classroom.replace(/\//g, '-').replace(/\s+/g, '');
    const safeDate = date.replace(/\//g, '-').replace(/\s+/g, '');
    const docId = `${subjectId}_${safeClassroom}_${safeDate}`;
    const attendanceRef = doc(database, 'attendance', docId);
    const snap = await getDoc(attendanceRef);
    
    if (snap.exists()) {
      return snap.data() as AttendanceData;
    }
    return null;
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
    const collectionsToDelete = ['grades', 'assignments', 'attendance', 'schedules', 'materials'];
    
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
}

export const teacherDatabaseService = new TeacherDatabaseService();
