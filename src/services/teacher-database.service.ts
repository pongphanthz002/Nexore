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
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const docId = `${data.subjectId}_${data.classroom}_${data.date}`;
    const attendanceRef = doc(database, 'attendance', docId);
    
    const existingDoc = await getDoc(attendanceRef);
    const saveData: any = {
      ...data,
      updatedAt: new Date(),
    };
    
    if (existingDoc.exists()) {
      saveData.createdAt = existingDoc.data().createdAt;
    } else {
      saveData.createdAt = new Date();
    }
    
    await setDoc(attendanceRef, saveData);
  }

  /**
   * Get attendance data for a specific date/subject/classroom
   */
  async getAttendance(teacherFirebaseConfig: any, subjectId: string, classroom: string, date: string): Promise<AttendanceData | null> {
    const database = this.getTeacherDB(teacherFirebaseConfig);
    const docId = `${subjectId}_${classroom}_${date}`;
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
      where('subjectId', '==', subjectId),
      where('classroom', '==', classroom)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(d => d.data() as AttendanceData);
  }
}

export const teacherDatabaseService = new TeacherDatabaseService();
