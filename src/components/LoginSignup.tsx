'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useEffect, useRef } from 'react';

export default function LoginSignup() {
  const router = useRouter();
  const { signInWithGoogle, user, userAccount, authStatus, signOut, setSignupValidation, invalidateCache, refreshAccount } = useAuth();
  const [loading, setLoading] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const signupErrorRef = useRef(false);

  // React to the account AuthContext resolved for the signed-in user (no extra reads here)
  useEffect(() => {
    if (!user?.email || signupErrorRef.current || authStatus === 'loading') return;

    const alreadyRegistered = authStatus === 'ready' && !!userAccount;
    const hasMapping = alreadyRegistered || authStatus === 'not-in-whitelist';

    if (isSignup && hasMapping) {
      // User tried to sign up but already has an account
      signupErrorRef.current = true;
      setSignupValidation(true);
      signOut().finally(() => {
        alert('บัญชีนี้เคยลงทะเบียนแล้ว');
        setIsSignup(false);
        setLoading(false);
        setTimeout(() => { signupErrorRef.current = false; }, 5000);
      });
      return;
    }

    if (alreadyRegistered && userAccount) {
      if (userAccount.role === 'admin') {
        router.push('/admin/dashboard');
      } else if (userAccount.role === 'teacher') {
        router.push('/teacher/dashboard');
      } else {
        router.push('/student/dashboard');
      }
    } else if (authStatus === 'not-registered') {
      // Keep signed in; user completes setup on the signup page
      router.push('/signup');
    } else {
      // not-in-whitelist / offline-error / error: show the banner below
      setLoading(false);
    }
  }, [user, userAccount, authStatus, isSignup, router, signOut, setSignupValidation]);

  const handleSignIn = async () => {
    setIsSignup(false);
    setLoading(true);
    try {
      // Force a fresh account lookup for an explicit sign-in
      invalidateCache();
      await signInWithGoogle();
      // The effect above redirects once AuthContext has resolved the account
    } catch (error) {
      console.error('Error signing in:', error);
      alert('เข้าสู่ระบบไม่สำเร็จ: ' + (error as Error).message);
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    setIsSignup(true);
    setLoading(true);
    try {
      await signInWithGoogle();
      // The effect above checks for an existing account and redirects
    } catch (error) {
      console.error('Error signing up:', error);
      alert('เข้าสู่ระบบไม่สำเร็จ: ' + (error as Error).message);
      setIsSignup(false);
      setLoading(false);
    }
  };

  const statusMessage =
    authStatus === 'not-in-whitelist'
      ? 'ไม่พบรายชื่อของคุณในโรงเรียน กรุณาติดต่อผู้ดูแลระบบ'
      : authStatus === 'offline-error'
        ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต'
        : authStatus === 'error'
          ? 'เกิดข้อผิดพลาดในการโหลดบัญชี'
          : null;

  return (
    <div className="no-scroll soft-light bg-surface flex items-center justify-center relative">
      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 w-full max-w-md p-6"
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl font-bold text-black mb-4 tracking-wider">
            NEXORE
          </h1>
          <p className="text-gray-500 text-lg tracking-widest">
            WELCOME
          </p>
        </motion.div>

        {/* Account status (e.g. not in whitelist, offline) */}
        {user && statusMessage && (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="mb-3">{statusMessage}</p>
            <div className="flex gap-2">
              {(authStatus === 'offline-error' || authStatus === 'error') && (
                <button onClick={() => refreshAccount()} className="rounded-md bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-700">
                  ลองใหม่
                </button>
              )}
              <button onClick={() => signOut()} className="rounded-md border border-red-300 px-3 py-1.5 font-semibold text-red-700 hover:bg-red-100">
                ออกจากระบบ
              </button>
            </div>
          </div>
        )}

        {/* Button Card */}
        <div className="bg-surface rounded-2xl p-6 shadow-neu-lg">
          {/* Sign In Button */}
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full bg-gray-500 text-white font-bold py-4 rounded-lg mb-2 hover:bg-[#000000] hover:scale-105 transition-all duration-150 disabled:opacity-50 flex items-center justify-center gap-3 shadow-neu-sm"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04-2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading ? 'Signing in...' : 'Sign in with Google'}
          </button>

          {/* Divider */}
          <div className="flex items-center mb-2">
            <div className="flex-1 border-t border-gray-200"></div>
            <span className="px-4 text-gray-400 text-sm">or</span>
            <div className="flex-1 border-t border-gray-200"></div>
          </div>

          {/* Sign Up with Google Button */}
          <button
            onClick={handleSignup}
            disabled={loading}
            className="w-full bg-surface text-black font-bold py-4 rounded-lg hover:border-gray-400 hover:scale-105 transition-all duration-150 disabled:opacity-50 flex items-center justify-center gap-3 shadow-neu-sm"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04-2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading ? 'Signing up...' : 'Sign up with Google'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
