'use client';

import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
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
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userAccount: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  setUserAccount: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState<Auth | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }

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
          try {
            const accountData = await firestoreService.getUserAccount(currentUser.email);
            console.log('User account data from Master Registry:', accountData);
            
            if (accountData) {
              // Get hub to get school firebase config
              const hub = await firestoreService.getHub(accountData.schoolId);
              console.log('Hub data:', hub);
              
              if (hub && hub.schoolFirebaseConfig) {
                const fullUserAccount: UserAccount = {
                  id: currentUser.email,
                  email: currentUser.email,
                  schoolId: accountData.schoolId,
                  schoolFirebaseConfig: hub.schoolFirebaseConfig,
                  role: accountData.role || 'student', // Default to student if role not set
                  userId: accountData.uid || currentUser.uid,
                  name: currentUser.displayName || '',
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
                console.log('Setting user account:', fullUserAccount);
                setUserAccount(fullUserAccount);
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

      return () => unsubscribe();
    } catch (error) {
      console.error('Error initializing auth:', error);
      setLoading(false);
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
      // Clear localStorage
      if (typeof window !== 'undefined') {
        localStorage.clear();
      }
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, userAccount, loading, signInWithGoogle, signOut, setUserAccount }}>
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
