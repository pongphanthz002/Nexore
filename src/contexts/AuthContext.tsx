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
            // Parallel loading: fetch user account and hub simultaneously
            const [accountData, hub] = await Promise.all([
              firestoreService.getUserAccount(currentUser.email),
              firestoreService.getHub(currentUser.email).catch(() => null) // getHub might fail if user not in hub yet
            ]);
            
            console.log('User account data from Master Registry:', accountData);
            console.log('Hub data:', hub);
            
            if (accountData) {
              // If hub wasn't loaded in parallel, try loading it with schoolId
              let finalHub = hub;
              if (!finalHub && accountData.schoolId) {
                finalHub = await firestoreService.getHub(accountData.schoolId);
                console.log('Hub data (fallback):', finalHub);
              }
              
              if (finalHub && finalHub.schoolFirebaseConfig) {
                const fullUserAccount: UserAccount = {
                  id: currentUser.email,
                  email: currentUser.email,
                  schoolId: accountData.schoolId,
                  schoolFirebaseConfig: finalHub.schoolFirebaseConfig,
                  role: accountData.role || 'student', // Default to student if role not set
                  userId: accountData.uid || currentUser.uid,
                  name: currentUser.displayName || '',
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
                console.log('Setting user account:', fullUserAccount);
                setUserAccount(fullUserAccount);
                
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
