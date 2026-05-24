import { firebaseManager } from '@/lib/firebase';
import { collection, doc, getDocs, query, where, deleteDoc, Firestore } from 'firebase/firestore';

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
}

export const teacherDatabaseService = new TeacherDatabaseService();
