import { firebaseManager } from '@/lib/firebase';
import { collection, doc, setDoc, getDoc, getDocs, query, where, updateDoc, deleteDoc, Firestore } from 'firebase/firestore';
import { teacherDatabaseService, GradeConfig, Assignment, AssignmentGroup, StudentScore } from '@/services/teacher-database.service';
import { firestoreService } from '@/services/firestore.service';

export interface TeacherFirebaseConfig {
  teacherId: string;
  name: string;
  email: string;
  uid?: string;
  role?: 'teacher' | 'admin';
  firebaseConfig?: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
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

export interface SubjectData {
  subjectId: string;
  teacherId: string;
  subjectName: string;
  classroom: string;
  day: string;
  time: string;
  duration?: string; // e.g. "1", "2", "3"
  createdAt: Date;
  updatedAt: Date;
}

class SchoolDatabaseService {
  private teachersCollection = 'teachers';
  private studentsCollection = 'students';
  private adminsCollection = 'admins';
  private subjectsCollection = 'subjects';

  /**
   * Get school database instance using school's Firebase config
   */
  private getSchoolDB(schoolFirebaseConfig: any): Firestore {
    const instance = firebaseManager.getInstance(schoolFirebaseConfig, `school-${schoolFirebaseConfig.projectId}`);
    return instance.db;
  }

  /**
   * Save teacher Firebase config to school database
   */
  async saveTeacherConfig(schoolFirebaseConfig: any, teacherConfig: TeacherFirebaseConfig): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const teacherRef = doc(database, this.teachersCollection, teacherConfig.teacherId);
    await setDoc(teacherRef, {
      ...teacherConfig,
      updatedAt: new Date(),
    });
  }

  /**
   * Get teacher config from school database
   */
  async getTeacherConfig(schoolFirebaseConfig: any, teacherId: string): Promise<TeacherFirebaseConfig | null> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const teacherRef = doc(database, this.teachersCollection, teacherId);
    const teacherSnap = await getDoc(teacherRef);
    
    if (teacherSnap.exists()) {
      return teacherSnap.data() as TeacherFirebaseConfig;
    }
    return null;
  }

  /**
   * Get all teachers from school database
   */
  async getAllTeachers(schoolFirebaseConfig: any): Promise<TeacherFirebaseConfig[]> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const querySnapshot = await getDocs(collection(database, this.teachersCollection));
    return querySnapshot.docs.map(doc => doc.data() as TeacherFirebaseConfig);
  }

  /**
   * Get all teachers from school database (optimized - select only essential fields)
   * Use this for dashboard stats where full data is not needed
   */
  async getAllTeachersOptimized(schoolFirebaseConfig: any): Promise<TeacherFirebaseConfig[]> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const querySnapshot = await getDocs(collection(database, this.teachersCollection));
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        teacherId: data.teacherId,
        name: data.name,
        email: data.email,
        firebaseConfig: data.firebaseConfig,
      } as TeacherFirebaseConfig;
    });
  }

  /**
   * Get teacher data from school database
   */
  async getTeacherData(schoolFirebaseConfig: any, teacherId: string): Promise<TeacherFirebaseConfig | null> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const teacherRef = doc(database, this.teachersCollection, teacherId);
    const teacherSnap = await getDoc(teacherRef);

    if (teacherSnap.exists()) {
      return teacherSnap.data() as TeacherFirebaseConfig;
    }
    return null;
  }

  /**
   * Save teacher whitelist (without Firebase config) to school database
   * Preserves email, uid, role for existing teachers (checked by teacherId)
   */
  async saveTeacherWhitelist(schoolFirebaseConfig: any, teachers: any[]): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);

    for (const teacher of teachers) {
      const teacherRef = doc(database, this.teachersCollection, teacher.teacherId);
      const existingDoc = await getDoc(teacherRef);

      let teacherData: any = {
        teacherId: teacher.teacherId,
        name: teacher.name,
        updatedAt: new Date(),
      };

      // Preserve email, uid, role from existing data (checked by teacherId)
      if (existingDoc.exists()) {
        const existingData = existingDoc.data();
        if (existingData.email) teacherData.email = existingData.email;
        if (existingData.uid) teacherData.uid = existingData.uid;
        if (existingData.role) teacherData.role = existingData.role;
        if (existingData.createdAt) teacherData.createdAt = existingData.createdAt;
      } else {
        // New teacher
        teacherData.email = teacher.email || '';
        teacherData.createdAt = new Date();
      }

      await setDoc(teacherRef, teacherData);
    }
  }

  /**
   * Save student data to school database
   * Preserves email, uid, role for existing students (checked by studentId)
   */
  async saveStudentWhitelist(schoolFirebaseConfig: any, students: any[]): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);

    for (const student of students) {
      const studentRef = doc(database, this.studentsCollection, student.studentId);
      const existingDoc = await getDoc(studentRef);

      let studentData: any = {
        studentId: student.studentId,
        name: student.name,
        class: student.class || '',
        number: student.number || '',
        schoolId: student.schoolId || 'default',
        teacherNodes: student.teacherNodes || [],
        updatedAt: new Date(),
      };

      // Preserve email, uid, role from existing data (checked by studentId)
      if (existingDoc.exists()) {
        const existingData = existingDoc.data();
        if (existingData.email) studentData.email = existingData.email;
        if (existingData.uid) studentData.uid = existingData.uid;
        if (existingData.role) studentData.role = existingData.role;
        if (existingData.createdAt) studentData.createdAt = existingData.createdAt;
      } else {
        // New student
        studentData.email = student.email || '';
        studentData.uid = student.uid || '';
        studentData.role = student.role || 'student';
        studentData.createdAt = new Date();
      }

      await setDoc(studentRef, studentData);
    }
  }

  /**
   * Save single student data to school database (direct update, no preserve logic)
   * Used during student setup to update email and uid
   */
  async saveStudentData(schoolFirebaseConfig: any, studentData: any): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const studentRef = doc(database, this.studentsCollection, studentData.studentId);
    await setDoc(studentRef, studentData, { merge: true });
  }

  /**
   * Get student data from school database
   */
  async getStudentData(schoolFirebaseConfig: any, studentId: string): Promise<StudentData | null> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const studentRef = doc(database, this.studentsCollection, studentId);
    const studentSnap = await getDoc(studentRef);
    
    if (studentSnap.exists()) {
      return studentSnap.data() as StudentData;
    }
    return null;
  }

  /**
   * Get all students from school database
   */
  async getAllStudents(schoolFirebaseConfig: any): Promise<StudentData[]> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const querySnapshot = await getDocs(collection(database, this.studentsCollection));
    return querySnapshot.docs.map(doc => doc.data() as StudentData);
  }

  /**
   * Get all students from school database (optimized - select only essential fields)
   * Use this for dashboard stats where full data is not needed
   */
  async getAllStudentsOptimized(schoolFirebaseConfig: any): Promise<StudentData[]> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const querySnapshot = await getDocs(collection(database, this.studentsCollection));
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        studentId: data.studentId,
        name: data.name,
        uid: data.uid,
      } as StudentData;
    });
  }

  /**
   * Save admin data to school database
   */
  async saveAdminWhitelist(schoolFirebaseConfig: any, admins: any[]): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    
    for (const admin of admins) {
      const adminRef = doc(database, this.adminsCollection, admin.email);
      await setDoc(adminRef, {
        email: admin.email,
        uid: admin.uid,
        role: admin.role || 'admin',
        name: admin.name || 'Admin',
        schoolId: admin.schoolId || 'default',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  /**
   * Delete teacher from school database
   */
  async deleteTeacher(schoolFirebaseConfig: any, teacherId: string): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const teacherRef = doc(database, this.teachersCollection, teacherId);
    await deleteDoc(teacherRef);
  }

  /**
   * Delete student from school database
   */
  async deleteStudent(schoolFirebaseConfig: any, studentId: string): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const studentRef = doc(database, this.studentsCollection, studentId);
    await deleteDoc(studentRef);
  }

  /**
   * Delete admin from school database
   */
  async deleteAdmin(schoolFirebaseConfig: any, email: string): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const adminRef = doc(database, this.adminsCollection, email);
    await deleteDoc(adminRef);
  }

  /**
   * Delete multiple teachers from school database
   */
  async deleteTeacherWhitelist(schoolFirebaseConfig: any, teacherIds: string[]): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    
    for (const teacherId of teacherIds) {
      const teacherRef = doc(database, this.teachersCollection, teacherId);
      await deleteDoc(teacherRef);
    }
  }

  /**
   * Delete multiple students from school database
   */
  async deleteStudentWhitelist(schoolFirebaseConfig: any, studentIds: string[]): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);

    for (const studentId of studentIds) {
      const studentRef = doc(database, this.studentsCollection, studentId);
      await deleteDoc(studentRef);
    }
  }

  /**
   * Get all subjects from school database
   */
  async getAllSubjects(schoolFirebaseConfig: any): Promise<SubjectData[]> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const querySnapshot = await getDocs(collection(database, this.subjectsCollection));
    return querySnapshot.docs.map(doc => doc.data() as SubjectData);
  }

  /**
   * Save subject whitelist to school database
   */
  async saveSubjectWhitelist(schoolFirebaseConfig: any, subjects: any[]): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);

    for (const subject of subjects) {
      const subjectRef = doc(database, this.subjectsCollection, subject.subjectId);
      const existingDoc = await getDoc(subjectRef);

      let subjectData: any = {
        subjectId: subject.subjectId,
        teacherId: subject.teacherId,
        subjectName: subject.subjectName,
        classroom: subject.classroom,
        day: subject.day,
        time: subject.time,
        duration: subject.duration || '1',
        updatedAt: new Date(),
      };

      if (existingDoc.exists()) {
        const existingData = existingDoc.data();
        if (existingData.createdAt) subjectData.createdAt = existingData.createdAt;
      } else {
        subjectData.createdAt = new Date();
      }

      await setDoc(subjectRef, subjectData);
    }
  }

  /**
   * Add single subject to school database
   */
  async addSubject(schoolFirebaseConfig: any, subject: any): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const subjectRef = doc(database, this.subjectsCollection, subject.subjectId);
    await setDoc(subjectRef, {
      ...subject,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * Delete subject from school database
   */
  async deleteSubject(schoolFirebaseConfig: any, subjectId: string): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const subjectRef = doc(database, this.subjectsCollection, subjectId);
    await deleteDoc(subjectRef);
  }

  /**
   * Get all attendance records for a specific subject + classroom from school database (for admin teachers)
   */
  async getAttendanceBySubject(schoolFirebaseConfig: any, subjectId: string, classroom: string): Promise<any[]> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const q = query(
      collection(database, 'attendance'),
      where('subjectId', '==', subjectId)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(d => d.data());
  }

  /**
   * Delete all data related to a subject from school database (grades, assignments, attendance, schedules, materials)
   */
  async deleteSubjectAllData(schoolFirebaseConfig: any, subjectId: string, classroom: string): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
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
        console.error(`Error deleting subject data from school database collection ${collectionName}:`, error);
      }
    }
  }

  /**
   * Delete all attendance records for a specific subject + classroom from school database (for admin teachers)
   */
  async deleteAttendanceBySubject(schoolFirebaseConfig: any, subjectId: string, classroom: string): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
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
   * GRADE & ASSIGNMENT METHODS (for admin teachers)
   */

  async getGradeConfig(schoolFirebaseConfig: any, subjectId: string): Promise<GradeConfig | null> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
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

  async saveGradeConfig(schoolFirebaseConfig: any, config: GradeConfig): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const configRef = doc(database, 'gradeConfigs', config.subjectId);
    await setDoc(configRef, {
      ...config,
      updatedAt: new Date()
    });
  }

  async getAssignments(schoolFirebaseConfig: any, subjectId: string, classroom: string): Promise<Assignment[]> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
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

  async saveAssignment(schoolFirebaseConfig: any, assignment: Assignment): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const assignmentRef = doc(database, 'assignments', assignment.id);
    await setDoc(assignmentRef, {
      ...assignment,
      createdAt: assignment.createdAt || new Date(),
      updatedAt: new Date()
    });
  }

  async deleteAssignment(schoolFirebaseConfig: any, assignmentId: string): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    await deleteDoc(doc(database, 'assignments', assignmentId));
  }

  async getAssignmentGroups(schoolFirebaseConfig: any, subjectId: string, classroom: string): Promise<AssignmentGroup[]> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
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

  async saveAssignmentGroup(schoolFirebaseConfig: any, group: AssignmentGroup): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const groupRef = doc(database, 'assignmentGroups', group.id);
    await setDoc(groupRef, {
      ...group,
      createdAt: group.createdAt || new Date(),
      updatedAt: new Date()
    });
  }

  async deleteAssignmentGroup(schoolFirebaseConfig: any, groupId: string): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    await deleteDoc(doc(database, 'assignmentGroups', groupId));
  }

  async getStudentScores(schoolFirebaseConfig: any, subjectId: string, classroom: string): Promise<StudentScore[]> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
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

  async saveStudentScore(schoolFirebaseConfig: any, score: StudentScore): Promise<void> {
    const database = this.getSchoolDB(schoolFirebaseConfig);
    const scoreId = `${score.subjectId}_${score.classroom.replace(/\//g, '-')}_${score.studentId}`;
    const scoreRef = doc(database, 'studentScores', scoreId);
    await setDoc(scoreRef, {
      ...score,
      updatedAt: new Date()
    });
  }

  /**
   * Delete all school data (teachers, students, subjects)
   */
  async deleteAllSchoolData(schoolFirebaseConfig: any): Promise<void> {
    // Delete all teachers
    const teachers = await this.getAllTeachers(schoolFirebaseConfig);
    const teacherIds = teachers.map(t => t.teacherId);
    if (teacherIds.length > 0) {
      await this.deleteTeacherWhitelist(schoolFirebaseConfig, teacherIds);
    }

    // Delete all students
    const students = await this.getAllStudents(schoolFirebaseConfig);
    const studentIds = students.map(s => s.studentId);
    if (studentIds.length > 0) {
      await this.deleteStudentWhitelist(schoolFirebaseConfig, studentIds);
    }

    // Delete all subjects
    const subjects = await this.getAllSubjects(schoolFirebaseConfig);
    for (const subject of subjects) {
      await this.deleteSubject(schoolFirebaseConfig, subject.subjectId);
    }
  }

  /**
   * Delete all teacher databases for all teachers in the school
   */
  async deleteAllTeacherDatabases(schoolFirebaseConfig: any): Promise<void> {
    const teachers = await this.getAllTeachers(schoolFirebaseConfig);

    for (const teacher of teachers) {
      if (teacher.firebaseConfig) {
        try {
          await teacherDatabaseService.deleteTeacherDatabase(teacher.firebaseConfig);
          console.log(`Deleted teacher database for: ${teacher.teacherId}`);
        } catch (error) {
          console.error(`Error deleting teacher database for ${teacher.teacherId}:`, error);
        }
      }
    }
  }

  /**
   * Delete all user accounts from Master Registry (teachers and students)
   */
  async deleteAllUserAccountsFromMasterRegistry(
    teacherEmails: string[],
    studentEmails: string[]
  ): Promise<void> {
    // Delete teacher accounts
    for (const email of teacherEmails) {
      try {
        await firestoreService.deleteUserAccount(email);
        console.log(`Deleted teacher account: ${email}`);
      } catch (error) {
        console.error(`Error deleting teacher account ${email}:`, error);
      }
    }

    // Delete student accounts
    for (const email of studentEmails) {
      try {
        await firestoreService.deleteUserAccount(email);
        console.log(`Deleted student account: ${email}`);
      } catch (error) {
        console.error(`Error deleting student account ${email}:`, error);
      }
    }
  }
}

export const schoolDatabaseService = new SchoolDatabaseService();
