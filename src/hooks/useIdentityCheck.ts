'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { storageService } from '@/services/storage.service';
import { firestoreService } from '@/services/firestore.service';
import { UserIdentity } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

export function useIdentityCheck() {
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<UserIdentity | null>(null);
  const router = useRouter();
  const { user, userAccount, setUserAccount } = useAuth();

  useEffect(() => {
    async function checkIdentity() {
      try {
        // Check if user is authenticated with Google
        if (user?.email) {
          // Get schoolId from Master Registry
          const userMapping = await firestoreService.getUserAccount(user.email);
          
          if (userMapping) {
            // Get school Firebase config from hubs
            const schoolHub = await firestoreService.getHub(userMapping.schoolId);
            
            if (schoolHub && schoolHub.schoolFirebaseConfig) {
              // Try to find user in School Database
              const { schoolDatabaseService } = await import('@/services/school-database.service');
              
              let userData = null;
              let role: 'admin' | 'teacher' | 'student' = 'admin';
              let userId = '';
              let userName = '';
              
              // Try teachers collection first
              const teachers = await schoolDatabaseService.getAllTeachers(schoolHub.schoolFirebaseConfig);
              const teacher = teachers.find(t => t.email === user.email);
              if (teacher) {
                role = 'teacher';
                userId = teacher.teacherId;
                userName = teacher.name;
                // Use teacher's own Firebase config if available
                const teacherFirebaseConfig = teacher.firebaseConfig || schoolHub.schoolFirebaseConfig;
                userData = { role, userId, name: userName, firebaseConfig: teacherFirebaseConfig };
              } else {
                // Try students collection
                const students = await schoolDatabaseService.getAllStudents(schoolHub.schoolFirebaseConfig);
                const student = students.find(s => s.email === user.email);
                if (student) {
                  role = 'student';
                  userId = student.studentId;
                  userName = student.name;
                  userData = { role, userId, name: userName };
                } else {
                  // If not found in teachers or students, assume admin (school owner)
                  role = 'admin';
                  userId = schoolHub.id;
                  userName = schoolHub.name;
                  userData = { role, userId, name: userName };
                }
              }
              
              if (userData) {
                // Set user account
                const userAccount = {
                  id: user.email,
                  email: user.email,
                  schoolId: userMapping.schoolId,
                  schoolFirebaseConfig: userData.firebaseConfig || schoolHub.schoolFirebaseConfig,
                  role: userData.role,
                  userId: userData.userId,
                  name: userData.name,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
                setUserAccount(userAccount);

                // Redirect to dashboard
                // Admin users default to Teacher Dashboard (can switch back via button)
                if (role === 'admin') {
                  router.push('/teacher/dashboard');
                } else if (role === 'teacher') {
                  router.push('/teacher/dashboard');
                } else if (role === 'student') {
                  router.push('/student/dashboard');
                }
              }
            }
          }
        }
        
        // Fallback to localStorage for backward compatibility
        const userIdentity = await storageService.getUserIdentity();
        
        if (userIdentity && userIdentity.isSetup) {
          setIdentity(userIdentity);
          
          // Redirect to appropriate dashboard based on role
          switch (userIdentity.role) {
            case 'student':
              router.push('/student/dashboard');
              break;
            case 'teacher':
              router.push('/teacher/dashboard');
              break;
            case 'admin':
              router.push('/admin/dashboard');
              break;
          }
        }
      } catch (error) {
        console.error('Error checking identity:', error);
      } finally {
        setLoading(false);
      }
    }

    checkIdentity();
  }, [router, user, userAccount, setUserAccount]);

  return { loading, identity };
}
