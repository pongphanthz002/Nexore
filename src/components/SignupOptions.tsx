'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';

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
      alert('เข้าสู่ระบบไม่สำเร็จ');
      setLoading(false);
    }
  };

  const handleSignup = (role: 'admin' | 'teacher' | 'student') => {
    router.push(`/setup/${role}`);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden relative">
      {/* Animated background grid */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(57, 255, 20, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(57, 255, 20, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          animation: 'gridMove 20s linear infinite'
        }} />
      </div>

      {/* Glowing orbs */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute w-96 h-96 bg-neon-glow rounded-full blur-3xl opacity-20"
      />

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
          className="mb-4 flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
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
          <h1 className="text-5xl font-bold text-white mb-4 tracking-wider" style={{
            textShadow: '0 0 10px #39ff14, 0 0 20px #39ff14'
          }}>
            NEXORE
          </h1>
          <p className="text-neon-glow text-lg tracking-widest">
            SIGN UP
          </p>
        </motion.div>

        {/* Google Sign In Button */}
        {!user && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            whileHover={{ scale: 1.02, boxShadow: '0 0 20px rgba(57, 255, 20, 0.3)' }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSignIn}
            disabled={loading}
            className="w-full bg-white text-black font-bold py-4 rounded-xl mb-6 hover:bg-gray-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading ? 'Signing in...' : 'Sign in with Google to continue'}
          </motion.button>
        )}

        {/* Sign Up Options */}
        {user && (
          <div className="space-y-3">
          <motion.button
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            whileHover={{ scale: 1.02, boxShadow: '0 0 20px rgba(57, 255, 20, 0.3)' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSignup('teacher')}
            className="w-full bg-black-500 border-2 border-neon-glow rounded-xl p-4 text-left group hover:bg-black-400 transition-all relative"
          >
            <div className="flex items-center justify-between pr-16">
              <div>
                <h2 className="text-xl font-bold text-white mb-1 group-hover:text-neon-glow transition-colors">
                  Teacher
                </h2>
                <p className="text-gray-400 text-sm">
                  ลงทะเบียนครู
                </p>
              </div>
              <span className="text-3xl">👨‍🏫</span>
            </div>
            {/* Admin small button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation();
                handleSignup('admin');
              }}
              className="absolute top-2 right-2 text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded hover:bg-gray-700 transition-colors z-10 border border-gray-600"
            >
              Admin
            </motion.button>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            whileHover={{ scale: 1.02, boxShadow: '0 0 20px rgba(57, 255, 20, 0.3)' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSignup('student')}
            className="w-full bg-black-500 border-2 border-neon-glow rounded-xl p-4 text-left group hover:bg-black-400 transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white mb-1 group-hover:text-neon-glow transition-colors">
                  Student
                </h2>
                <p className="text-gray-400 text-sm">
                  ลงทะเบียนนักเรียน
                </p>
              </div>
              <span className="text-3xl">👨‍🎓</span>
            </div>
          </motion.button>
        </div>
        )}
      </motion.div>

      <style jsx>{`
        @keyframes gridMove {
          0% {
            transform: translate(0, 0);
          }
          100% {
            transform: translate(50px, 50px);
          }
        }
      `}</style>
    </div>
  );
}
