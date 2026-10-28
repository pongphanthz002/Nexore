'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types/firebase.types';

const DASHBOARD_BY_ROLE: Record<UserRole, string> = {
  // Admin users default to Teacher Dashboard (can switch via role switcher)
  admin: '/teacher/dashboard',
  teacher: '/teacher/dashboard',
  student: '/student/dashboard',
};

/**
 * Redirects a signed-in user with a resolved account to their dashboard.
 * Account resolution itself happens once in AuthContext (no extra reads here).
 */
export function useIdentityCheck() {
  const router = useRouter();
  const { user, userAccount, loading, authStatus } = useAuth();

  const redirecting = !loading && !!user && !!userAccount && authStatus === 'ready';

  useEffect(() => {
    if (redirecting && userAccount) {
      router.push(DASHBOARD_BY_ROLE[userAccount.role] || '/student/dashboard');
    }
  }, [redirecting, userAccount, router]);

  return { loading, redirecting };
}
