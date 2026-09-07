'use client';

import { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { firebaseManager } from '@/lib/firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  Auth 
} from 'firebase/auth';
import { firestoreService } from '@/services/firestore.service';
import { schoolDatabaseService } from '@/services/school-database.service';
import { collection, doc, getDoc, getDocs, query, where, setDoc } from 'firebase/firestore';

export interface UserAccount {
  id: string;
  email: string;
  schoolId: string;
  schoolFirebaseConfig: any;
  role: 'admin' | 'teacher' | 'student';
  userId: string; // teacherId or studentId
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

interface AuthContextType {
  user: User | null;
  userAccount: UserAccount | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  setUserAccount: (account: UserAccount | null) => void;
  setSignupValidation: (value: boolean) => void;
  invalidateCache: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userAccount: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  setUserAccount: () => {},
  setSignupValidation: () => {},
  invalidateCache: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState<Auth | null>(null);
  const signupValidationRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    // Prevent iOS Safari edge swipe-to-go-back gesture globally
    const preventEdgeSwipe = (e: TouchEvent) => {
      const touchX = e.touches[0].clientX;
      // Only prevent from left edge (50px) - right edge swipe is for forward navigation
      if (touchX < 50) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchstart', preventEdgeSwipe, { passive: false });

    try {
      const instance = firebaseManager.getMasterRegistryInstance();
      setAuth(instance.auth);
      console.log('Auth instance obtained:', instance.auth?.app?.name);

      const unsubscribe = onAuthStateChanged(instance.auth, async (currentUser) => {
        console.log('Auth state changed:', currentUser?.email);
        setUser(currentUser);
        
        // Load user account from Master Registry if user is authenticated
        if (currentUser?.email) {
          console.log('Loading user account from Master Registry for:', currentUser.email);
          // Check if this is a signup validation sign out
          if (signupValidationRef.current) {
            console.log('Signup validation sign out detected, skipping user account loading');
            signupValidationRef.current = false;
            setUserAccount(null);
            setLoading(false);
            return;
          }
          
          // Try to load from cache first
          const cachedAccount = localStorage.getItem('NEXORE_USER_ACCOUNT');
          const cacheTimestamp = localStorage.getItem('NEXORE_USER_ACCOUNT_TIMESTAMP');
          const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds
          
          if (cachedAccount && cacheTimestamp) {
            const age = Date.now() - parseInt(cacheTimestamp);
            const parsed = JSON.parse(cachedAccount);
            if (age < CACHE_DURATION && parsed.email === currentUser.email) {
              console.log('Loading user account from cache for:', currentUser.email);
              console.log('Cached user account role:', parsed.role);
              console.log('Cached user account userId:', parsed.userId);
              console.log('Cache age:', age, 'ms');
              setUserAccount(parsed);
              setLoading(false);
              return;
            } else {
              console.log('Cache expired or email mismatch, fetching from Firestore');
              localStorage.removeItem('NEXORE_USER_ACCOUNT');
              localStorage.removeItem('NEXORE_USER_ACCOUNT_TIMESTAMP');
            }
          }
          
          try {
            // Fetch user account from Master Registry
            const accountData = await firestoreService.getUserAccount(currentUser.email);
            
            console.log('User account data from Master Registry:', accountData);
            
            if (accountData) {
              // Load hub using schoolId from user account
              let finalHub = null;
              if (accountData.schoolId) {
                finalHub = await firestoreService.getHub(accountData.schoolId);
                console.log('Hub data:', finalHub);
              }
              
              if (finalHub && finalHub.schoolFirebaseConfig) {
                // Check if user is a teacher and has role in School Database
                let finalRole = accountData.role || 'student';
                let finalUserId = accountData.uid || currentUser.uid; // Default to Firebase Auth UID
                
                let teacherDisplayName = currentUser.displayName || '';
                
                if (accountData.role === 'teacher' || accountData.role === 'admin') {
                  try {
                    const schoolInstance = firebaseManager.getInstance(
                      finalHub.schoolFirebaseConfig,
                      `school-${finalHub.schoolFirebaseConfig.projectId}`
                    );
                    const teachersRef = collection(schoolInstance.db, 'teachers');
                    const targetUid = accountData.uid || currentUser.uid;
                    let q = query(teachersRef, where('uid', '==', targetUid));
                    let querySnapshot = await getDocs(q);

                    // Fallback lookup by email if query by UID returns empty
                    if (querySnapshot.empty && currentUser.email) {
                      const qEmail = query(teachersRef, where('email', '==', currentUser.email));
                      querySnapshot = await getDocs(qEmail);
                    }
                    
                    if (!querySnapshot.empty) {
                      const teacherDoc = querySnapshot.docs[0];
                      const teacherData = teacherDoc.data();
                      if (teacherData?.role) {
                        finalRole = teacherData.role;
                        console.log('Role from School Database:', finalRole);
                      }
                      if (teacherData?.name) {
                        teacherDisplayName = teacherData.name;
                      }
                      // Use teacherId as userId (document ID)
                      finalUserId = teacherDoc.id;
                      console.log('TeacherId from School Database:', finalUserId);

                      // Update UID on teacher document if missing or different
                      if (!teacherData.uid && targetUid) {
                        setDoc(teacherDoc.ref, { uid: targetUid }, { merge: true }).catch(err => 
                          console.error('Error updating teacher uid:', err)
                        );
                      }
                    }
                  } catch (err) {
                    console.error('Error fetching teacher role from School Database:', err);
                  }
                } else if (accountData.role === 'student') {
                  try {
                    const schoolInstance = firebaseManager.getInstance(
                      finalHub.schoolFirebaseConfig,
                      `school-${finalHub.schoolFirebaseConfig.projectId}`
                    );
                    const studentsRef = collection(schoolInstance.db, 'students');
                    const targetUid = accountData.uid || currentUser.uid;
                    let q = query(studentsRef, where('uid', '==', targetUid));
                    let querySnapshot = await getDocs(q);

                    // Fallback lookup by email if query by UID returns empty
                    if (querySnapshot.empty && currentUser.email) {
                      const qEmail = query(studentsRef, where('email', '==', currentUser.email));
                      querySnapshot = await getDocs(qEmail);
                    }
                    
                    if (!querySnapshot.empty) {
                      const studentDoc = querySnapshot.docs[0];
                      const studentData = studentDoc.data();
                      if (studentData?.name) {
                        teacherDisplayName = studentData.name;
                      }
                      finalUserId = studentDoc.id; // studentId is the document ID
                      console.log('StudentId from School Database:', finalUserId);

                      // Update UID on student document if missing or different
                      if (!studentData.uid && targetUid) {
                        setDoc(studentDoc.ref, { uid: targetUid }, { merge: true }).catch(err => 
                          console.error('Error updating student uid:', err)
                        );
                      }
                    }
                  } catch (err) {
                    console.error('Error fetching studentId from School Database:', err);
                  }
                }
                
                const fullUserAccount: UserAccount = {
                  id: currentUser.email,
                  email: currentUser.email,
                  schoolId: accountData.schoolId,
                  schoolFirebaseConfig: finalHub.schoolFirebaseConfig,
                  role: finalRole,
                  userId: finalUserId,
                  name: teacherDisplayName || currentUser.displayName || currentUser.email || '',
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
                console.log('Setting user account:', fullUserAccount);
                console.log('Setting user account role:', fullUserAccount.role);
                console.log('Setting user account userId:', fullUserAccount.userId);
                setUserAccount(fullUserAccount);
                
                // Log after setting to verify
                console.log('AuthContext - After setUserAccount, userAccount role:', fullUserAccount.role);
                console.log('AuthContext - After setUserAccount, userAccount userId:', fullUserAccount.userId);
                
                // Cache the user account
                localStorage.setItem('NEXORE_USER_ACCOUNT', JSON.stringify(fullUserAccount));
                localStorage.setItem('NEXORE_USER_ACCOUNT_TIMESTAMP', Date.now().toString());
              } else {
                console.log('No hub or firebase config found for user');
                setUserAccount(null);
              }
            } else {
              console.log('No user account found in Master Registry');
              setUserAccount(null);
            }
          } catch (error) {
            console.error('Error loading user account:', error);
            setUserAccount(null);
          }
        } else {
          setUserAccount(null);
        }
        
        setLoading(false);
      });

      return () => {
        unsubscribe();
        document.removeEventListener('touchstart', preventEdgeSwipe);
      };
    } catch (error) {
      console.error('Error initializing auth:', error);
      setLoading(false);
      return () => {
        document.removeEventListener('touchstart', preventEdgeSwipe);
      };
    }
  }, []);

  const signInWithGoogle = async () => {
    if (!auth) {
      throw new Error('Firebase Auth not initialized');
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      console.log('Starting Google sign in with auth:', auth.app?.name);
      const result = await signInWithPopup(auth, provider);
      console.log('Google sign in successful:', result.user?.email);
      console.log('User UID:', result.user?.uid);
      console.log('User object:', result.user);
      setUser(result.user);
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const signOut = async () => {
    if (!auth) {
      throw new Error('Firebase Auth not initialized');
    }

    try {
      await firebaseSignOut(auth);
      setUser(null);
      setUserAccount(null);
      // Clear Nexore-specific caches only (preserve Firebase IndexedDB)
      if (typeof window !== 'undefined') {
        // Clear only Nexore keys from localStorage
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('NEXORE_') || key.startsWith('nexore-') || key.startsWith('nexore_'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        sessionStorage.clear();
        // Clear cookies
        document.cookie.split(";").forEach(function(c) { 
          document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
        });
        // Reset Firebase instances (but do NOT delete IndexedDB)
        firebaseManager.clearAllInstances();
        // Re-initialize master registry instance
        firebaseManager.getMasterRegistryInstance();
      }
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const setSignupValidation = (value: boolean) => {
    signupValidationRef.current = value;
  };

  const invalidateCache = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('NEXORE_USER_ACCOUNT');
      localStorage.removeItem('NEXORE_USER_ACCOUNT_TIMESTAMP');
      console.log('Cache invalidated');
    }
  };

  return (
    <AuthContext.Provider value={{ user, userAccount, loading, signInWithGoogle, signOut, setUserAccount, setSignupValidation, invalidateCache }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
