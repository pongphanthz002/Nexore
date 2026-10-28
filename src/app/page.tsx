'use client';

import { useEffect, useState } from 'react';
import LoadingScreen from '@/components/LoadingScreen';
import LoginSignup from '@/components/LoginSignup';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';

export default function Home() {
  const { loading, redirecting } = useIdentityCheck();
  const [showLoading, setShowLoading] = useState(true);

  useEffect(() => {
    // Show loading screen for at least 2 seconds for effect
    const timer = setTimeout(() => {
      setShowLoading(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (loading || showLoading) {
    return <LoadingScreen />;
  }

  if (redirecting) {
    // Will be redirected by useIdentityCheck hook
    return <LoadingScreen />;
  }

  return <LoginSignup />;
}
