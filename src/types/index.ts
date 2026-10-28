export type { FirebaseConfig, UserMapping } from './firebase.types';

import type { UserRole } from './firebase.types';
export type { UserRole };

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

export interface WhitelistEntry {
  id: string;
  name: string;
  type: 'student' | 'teacher';
  class?: string;
  number?: string;
}
