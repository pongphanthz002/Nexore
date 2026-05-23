export type UserRole = 'student' | 'teacher' | 'admin';

export interface UserIdentity {
  role: UserRole;
  userId: string;
  email?: string;
  teacherId?: string;
  studentId?: string;
  schoolId?: string;
  isSetup: boolean;
  lastLogin: number;
}

export interface MasterRegistryConfig {
  schoolName: string;
  // Firebase config for School's own database (students/teachers)
  schoolApiKey: string;
  schoolAuthDomain: string;
  schoolProjectId: string;
  schoolStorageBucket: string;
  schoolMessagingSenderId: string;
  schoolAppId: string;
}

export interface TeacherNode {
  teacherId: string;
  name: string;
  email: string;
  firebaseConfig: MasterRegistryConfig;
  qrCode: string;
  schoolId: string;
}

export interface StudentData {
  studentId: string;
  name: string;
  class: string;
  number: string;
  schoolId: string;
  teacherNodes: string[]; // Array of teacher IDs
}

export interface WhitelistEntry {
  id: string;
  name: string;
  type: 'student' | 'teacher';
  class?: string;
  number?: string;
}
