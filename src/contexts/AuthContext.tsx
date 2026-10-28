'use client';

import { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
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
import { schoolDatabaseService, StudentData, TeacherFirebaseConfig } from '@/services/school-database.service';
import { studentDatabaseService } from '@/services/student-database.service';
import { isNetworkError } from '@/lib/firestore-helpers';
import { STORAGE_KEYS } from '@/config/storage.keys';
import type { FirebaseConfig, UserRole } from '@/types/firebase.types';

/** Width of the left-edge strip where touches are blocked to stop iOS swipe-back. */
const EDGE_SWIPE_ZONE = 24;
const INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, label, summary, [role="button"], [role="tab"], [contenteditable="true"]';

export interface UserAccount {
  id: string;
  email: string;
  /** Firebase Auth UID (absent in caches written by older versions) */
  uid?: string;
  schoolId: string;
  schoolFirebaseConfig: FirebaseConfig;
  role: UserRole;
  userId: string; // teacherId or studentId
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * - loading: resolving the signed-in user's account
 * - ready: signed out, or signed in with a resolved account
 * - not-registered: signed in, but no Master Registry mapping / school (needs setup)
 * - not-in-whitelist: mapping exists but the teacher/student record is missing from the School DB
 * - offline-error: couldn't reach Firestore and there is no cached account
 * - error: unexpected failure resolving the account
 */
export type AuthStatus = 'loading' | 'ready' | 'not-registered' | 'not-in-whitelist' | 'offline-error' | 'error';

interface AuthContextType {
  user: User | null;
  userAccount: UserAccount | null;
  loading: boolean;
  authStatus: AuthStatus;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  setUserAccount: (account: UserAccount | null) => void;
  setSignupValidation: (value: boolean) => void;
  invalidateCache: () => void;
  /** Re-resolve the account from Firestore (e.g. after offline-error) */
  refreshAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userAccount: null,
  loading: true,
  authStatus: 'loading',
  signInWithGoogle: async () => {},
  signOut: async () => {},
  setUserAccount: () => {},
  setSignupValidation: () => {},
  invalidateCache: () => {},
  refreshAccount: async () => {},
});

/** Cached account is shown immediately for up to 7 days... */
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
/** ...and re-checked in the background once it is older than 30 minutes. */
const CACHE_REVALIDATE_AFTER = 30 * 60 * 1000;

function readCachedAccount(currentUser: User): { account: UserAccount; age: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER_ACCOUNT);
    const ts = localStorage.getItem(STORAGE_KEYS.USER_ACCOUNT_TIMESTAMP);
    if (!raw || !ts) return null;
    const account = JSON.parse(raw) as UserAccount;
    const age = Date.now() - parseInt(ts, 10);
    const sameUser = account.uid ? account.uid === currentUser.uid : account.email === currentUser.email;
    if (!sameUser || !(age >= 0 && age < CACHE_MAX_AGE) || !account.schoolFirebaseConfig?.projectId) return null;
    return { account, age };
  } catch {
    return null;
  }
}

function writeCachedAccount(account: UserAccount): void {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_ACCOUNT, JSON.stringify(account));
    localStorage.setItem(STORAGE_KEYS.USER_ACCOUNT_TIMESTAMP, Date.now().toString());
  } catch {
    // Storage unavailable — caching is best-effort
  }
}

function clearCachedAccount(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.USER_ACCOUNT);
    localStorage.removeItem(STORAGE_KEYS.USER_ACCOUNT_TIMESTAMP);
  } catch {
    // ignore
  }
}

type ResolveResult =
  | { status: 'ready'; account: UserAccount }
  | { status: 'not-registered' | 'not-in-whitelist' };

/**
 * Resolve uid → Master Registry mapping → school hub → School DB record.
 * Typically 2–3 reads (hub config is cached locally for a day).
 */
async function resolveAccount(currentUser: User): Promise<ResolveResult> {
  const email = currentUser.email || '';
  const mapping = await firestoreService.getUserMapping(currentUser.uid, email);
  if (!mapping?.schoolId) return { status: 'not-registered' };

  const hub = await firestoreService.getHubCached(mapping.schoolId);
  const schoolConfig = hub?.schoolFirebaseConfig;
  if (!schoolConfig) return { status: 'not-registered' };

  const mappedRole: UserRole = mapping.role || 'student';
  let role: UserRole = mappedRole;
  let userId = '';
  let name = currentUser.displayName || '';

  if (mappedRole === 'student') {
    const member = await schoolDatabaseService.findMember<StudentData>(schoolConfig, 'student', {
      userId: mapping.userId, uid: currentUser.uid, email,
    });
    if (!member) return { status: 'not-in-whitelist' };
    userId = member.id;
    if (member.data.name) name = member.data.name;
  } else {
    const member = await schoolDatabaseService.findMember<TeacherFirebaseConfig>(schoolConfig, 'teacher', {
      userId: mapping.userId, uid: currentUser.uid, email,
    });
    if (member) {
      userId = member.id;
      if (member.data.role) role = member.data.role;
      if (member.data.name) name = member.data.name;
    } else if (mappedRole === 'admin') {
      // School owner without a teacher record
      userId = mapping.userId || currentUser.uid;
    } else {
      return { status: 'not-in-whitelist' };
    }
  }

  // Remember the School DB id so the next lookup is a single document read
  if (mapping.userId !== userId || !mapping.uid) {
    firestoreService.saveUserAccount(email, mapping.schoolId, currentUser.uid, mappedRole, userId)
      .catch(err => console.error('Error updating user mapping:', err));
  }

  return {
    status: 'ready',
    account: {
      id: email,
      email,
      uid: currentUser.uid,
      schoolId: mapping.schoolId,
      schoolFirebaseConfig: schoolConfig,
      role,
      userId,
      name: name || email,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userAccount, setUserAccountState] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [auth, setAuth] = useState<Auth | null>(null);
  const signupValidationRef = useRef(false);
  /** Bumped whenever the account is set explicitly, so stale background resolves are dropped. */
  const generationRef = useRef(0);
  const hasAccountRef = useRef(false);

  const applyAccount = useCallback((account: UserAccount | null) => {
    hasAccountRef.current = !!account;
    setUserAccountState(account);
  }, []);

  /**
   * Resolve from Firestore and apply the result. When `background` is true and the
   * user already has a cached account, network failures keep the cached account.
   */
  const revalidate = useCallback(async (currentUser: User, background: boolean) => {
    const generation = generationRef.current;
    try {
      const result = await resolveAccount(currentUser);
      if (generation !== generationRef.current) return; // superseded by setUserAccount/signOut
      if (result.status === 'ready') {
        applyAccount(result.account);
        writeCachedAccount(result.account);
        setAuthStatus('ready');
      } else {
        clearCachedAccount();
        applyAccount(null);
        setAuthStatus(result.status);
      }
    } catch (error) {
      if (generation !== generationRef.current) return;
      console.error('Error loading user account:', error);
      if (background && hasAccountRef.current) {
        // Keep working from the cached account; we'll retry on the next launch
        return;
      }
      applyAccount(null);
      setAuthStatus(isNetworkError(error) ? 'offline-error' : 'error');
    }
  }, [applyAccount]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    // Prevent iOS Safari edge swipe-to-go-back gesture globally. preventDefault on touchstart
    // also cancels the tap's click, so touches on controls are left alone and the zone is
    // kept to the screen edge (where the back gesture starts).
    const preventEdgeSwipe = (e: TouchEvent) => {
      if (e.touches[0].clientX >= EDGE_SWIPE_ZONE) return;
      const target = e.target as Element | null;
      if (target?.closest?.(INTERACTIVE_SELECTOR)) return;
      e.preventDefault();
    };

    document.addEventListener('touchstart', preventEdgeSwipe, { passive: false });

    // In development the PWA is disabled, but a service worker registered by an earlier
    // production run keeps serving old cached bundles. Remove it and its caches.
    if (process.env.NODE_ENV === 'development' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        if (registrations.length === 0) return;
        await Promise.all(registrations.map(r => r.unregister()));
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(key => caches.delete(key)));
        }
        console.warn('[dev] Removed stale service worker; reloading to load current code');
        window.location.reload();
      }).catch(err => console.error('Error removing service worker:', err));
    }

    try {
      const instance = firebaseManager.getMasterRegistryInstance();
      setAuth(instance.auth);

      const unsubscribe = onAuthStateChanged(instance.auth, async (currentUser) => {
        setUser(currentUser);

        if (!currentUser?.email) {
          applyAccount(null);
          setAuthStatus('ready');
          setLoading(false);
          return;
        }

        // Signup validation sign-out in progress: don't load the account
        if (signupValidationRef.current) {
          signupValidationRef.current = false;
          applyAccount(null);
          setAuthStatus('ready');
          setLoading(false);
          return;
        }

        const cached = readCachedAccount(currentUser);
        if (cached) {
          // Stale-while-revalidate: show the cached account immediately
          applyAccount(cached.account);
          setAuthStatus('ready');
          setLoading(false);
          if (cached.age > CACHE_REVALIDATE_AFTER) {
            revalidate(currentUser, true);
          }
          return;
        }

        setAuthStatus('loading');
        await revalidate(currentUser, false);
        setLoading(false);
      });

      return () => {
        unsubscribe();
        document.removeEventListener('touchstart', preventEdgeSwipe);
      };
    } catch (error) {
      console.error('Error initializing auth:', error);
      setAuthStatus('error');
      setLoading(false);
      return () => {
        document.removeEventListener('touchstart', preventEdgeSwipe);
      };
    }
  }, [applyAccount, revalidate]);

  const signInWithGoogle = async () => {
    if (!auth) {
      throw new Error('Firebase Auth not initialized');
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    setUser(result.user);
  };

  const signOut = async () => {
    if (!auth) {
      throw new Error('Firebase Auth not initialized');
    }

    generationRef.current++;
    await firebaseSignOut(auth);
    setUser(null);
    applyAccount(null);
    setAuthStatus('ready');
    // Clear Nexore-specific caches only (preserve Firebase IndexedDB)
    if (typeof window !== 'undefined') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('NEXORE_') || key.startsWith('nexore-') || key.startsWith('nexore_')) && key !== STORAGE_KEYS.THEME) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      sessionStorage.clear();
      // Clear cookies
      document.cookie.split(";").forEach(function(c) {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
      // Drop in-memory data caches and release school/teacher Firebase apps
      schoolDatabaseService.clearCache();
      studentDatabaseService.clearCache();
      firebaseManager.clearAllInstances();
    }
  };

  /**
   * Set the account explicitly (setup flows, role switch). Also caches it so the
   * next launch doesn't need to re-resolve.
   */
  const setUserAccount = useCallback((account: UserAccount | null) => {
    generationRef.current++;
    applyAccount(account);
    if (account) {
      writeCachedAccount({ ...account, uid: account.uid || user?.uid });
      setAuthStatus('ready');
    } else {
      clearCachedAccount();
    }
  }, [applyAccount, user]);

  const setSignupValidation = (value: boolean) => {
    signupValidationRef.current = value;
  };

  const invalidateCache = () => {
    if (typeof window !== 'undefined') {
      clearCachedAccount();
    }
  };

  const refreshAccount = async () => {
    if (!user?.email) return;
    setAuthStatus('loading');
    setLoading(true);
    await revalidate(user, false);
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, userAccount, loading, authStatus, signInWithGoogle, signOut, setUserAccount, setSignupValidation, invalidateCache, refreshAccount }}>
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
