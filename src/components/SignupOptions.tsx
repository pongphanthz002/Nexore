'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import { toast } from '@/components/Toast';

export default function SignupOptions() {
  const router = useRouter();
  const { signInWithGoogle, user, signOut } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      // Wait for auth state to update
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Error signing in:', error);
      toast.error('เข้าสู่ระบบไม่สำเร็จ');
      setLoading(false);
    }
  };

  const handleSignup = (role: 'admin' | 'teacher' | 'student') => {
    router.push(`/setup/${role}`);
  };

  return (
    <div className="min-h-screen bg-surface text-gray-900 dark:text-gray-50 flex items-center justify-center overflow-hidden relative">
      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 w-full max-w-md p-6"
      >
        {/* Back Button */}
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={async () => {
            await signOut();
            router.push('/');
          }}
          className="mb-4 flex items-center gap-2 text-gray-500 hover:text-gray-900 dark:hover:text-gray-50 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          ย้อนกลับ
        </motion.button>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl font-bold text-gray-900 dark:text-gray-50 mb-4 tracking-wider">
            NEXORE
          </h1>
          <p className="text-gray-500 text-lg tracking-widest">
            สมัครใช้งาน
          </p>
        </motion.div>

        {/* Button Card */}
        <div className="bg-surface rounded-2xl p-6 shadow-neu-lg">
          {/* Google Sign In Button */}
          {!user && (
            <button
              onClick={handleSignIn}
              disabled={loading}
              className="w-full bg-gray-900 text-white dark:bg-gray-50 dark:text-gray-900 font-bold py-4 rounded-lg mb-2 hover:bg-black dark:hover:bg-white active:scale-[0.98] transition-[background-color,transform] duration-150 disabled:opacity-50 flex items-center justify-center gap-3 shadow-neu-sm"
            >
              <svg className="h-8 w-8 rounded-full bg-white p-1" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04-2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วย Google เพื่อดำเนินการต่อ'}
            </button>
          )}

          {/* Sign Up Options */}
          {user && (
            <div className="space-y-4">
              <button
                onClick={() => handleSignup('teacher')}
                className="w-full bg-surface text-gray-900 dark:text-gray-50 rounded-lg py-4 text-center active:shadow-neu-in-sm transition-shadow duration-150 shadow-neu-sm"
              >
                <h2 className="text-xl font-bold">
                  ครู
                </h2>
              </button>

              <button
                onClick={() => handleSignup('student')}
                className="w-full bg-surface text-gray-900 dark:text-gray-50 rounded-lg py-4 text-center active:shadow-neu-in-sm transition-shadow duration-150 shadow-neu-sm"
              >
                <h2 className="text-xl font-bold">
                  นักเรียน
                </h2>
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
