'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** The roster links and the danger zone now live on the admin home. */
export default function AdminUsersRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/dashboard');
  }, [router]);
  return null;
}
