/**
 * Shared Firebase/registry types used across services.
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export type UserRole = 'admin' | 'teacher' | 'student';

/**
 * Master Registry `users` document.
 * Keyed by Firebase Auth UID (`users/{uid}`); legacy docs are keyed by email
 * and are migrated to UID on the owner's next login.
 */
export interface UserMapping {
  email: string;
  schoolId: string;
  uid?: string;
  role?: UserRole;
  /** teacherId or studentId (School Database document ID) */
  userId?: string;
  updatedAt?: Date;
}
