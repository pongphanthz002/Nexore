'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { firestoreService } from '@/services/firestore.service';
import { UserAccount } from '@/contexts/AuthContext';
import { useState, useEffect } from 'react';

export default function LoginSignup() {
  const router = useRouter();
  const { signInWithGoogle, user, setUserAccount, loading: authLoading, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [isSignup, setIsSignup] = useState(false);

  useEffect(() => {
    async function checkUserAccount() {
      if (user?.email && !checkingAccount) {
        setCheckingAccount(true);
        try {
          // Get schoolId from Master Registry
          console.log('Checking user account for email:', user.email);
          const userMapping = await firestoreService.getUserAccount(user.email);
          
          console.log('User mapping found:', userMapping);
          
          if (userMapping) {
            // User exists in Master Registry
            if (isSignup) {
              // User tried to sign up but already has an account
              console.log('User already exists, signing out and showing error');
              await signOut();
              alert('บัญชีนี้เคยลงทะเบียนแล้ว');
              setIsSignup(false);
              setLoading(false);
              setCheckingAccount(false);
              return;
            }
            
            // User exists, get school Firebase config from hubs
            const schoolHub = await firestoreService.getHub(userMapping.schoolId);
            console.log('School hub found:', schoolHub);
            
            if (schoolHub && schoolHub.schoolFirebaseConfig) {
              // Use role from Master Registry
              const role = userMapping.role || 'student';
              const userId = userMapping.uid || user.uid;
              const userName = user.displayName || '';
              
              // Set user account
              const userAccount: UserAccount = {
                id: user.email,
                email: user.email,
                schoolId: userMapping.schoolId,
                schoolFirebaseConfig: schoolHub.schoolFirebaseConfig,
                role: role,
                userId: userId,
                name: userName,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
              setUserAccount(userAccount);
              
              console.log('Redirecting to dashboard for role:', role);
              if (role === 'admin') {
                router.push('/admin/dashboard');
              } else if (role === 'teacher') {
                router.push('/teacher');
              } else if (role === 'student') {
                router.push('/student');
              }
            } else {
              console.log('School hub not found or no Firebase config, redirecting to signup');
              router.push('/signup');
            }
          } else {
            // User doesn't exist - redirect to signup (keep signed in)
            // User will complete setup while signed in
            console.log('User account not found, redirecting to signup');
            router.push('/signup');
          }
        } catch (error) {
          console.error('Error checking user account:', error);
          console.error('Error details:', JSON.stringify(error, null, 2));
        } finally {
          setCheckingAccount(false);
        }
      }
    }
    
    checkUserAccount();
  }, [user, checkingAccount, setUserAccount, router]);

  const handleSignIn = async () => {
    setIsSignup(false);
    setLoading(true);
    try {
      console.log('Starting Google Sign in...');
      await signInWithGoogle();
      console.log('Google Sign in completed, waiting for auth state...');
      // Wait a bit for auth state to update
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('Auth state should be updated now');
      // useEffect will handle the redirect
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
      console.log('Starting Google Sign up...');
      await signInWithGoogle();
      console.log('Google Sign up completed, waiting for auth state...');
      // Wait a bit for auth state to update
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('Auth state should be updated now');
      // The useEffect will handle the check and redirect
    } catch (error) {
      console.error('Error signing up:', error);
      alert('เข้าสู่ระบบไม่สำเร็จ: ' + (error as Error).message);
      setIsSignup(false);
      setLoading(false);
    }
  };

  return (
    <div className="no-scroll bg-white flex items-center justify-center relative">
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

        {/* Button Card */}
        <div className="bg-white rounded-2xl p-6 shadow-lg">
          {/* Sign In Button */}
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full bg-gray-500 text-white font-bold py-4 rounded-lg mb-2 hover:bg-[#000000] hover:scale-105 transition-all duration-150 disabled:opacity-50 flex items-center justify-center gap-3 shadow-md"
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
            className="w-full bg-white border border-gray-200 text-black font-bold py-4 rounded-lg hover:border-gray-400 hover:scale-105 transition-all duration-150 disabled:opacity-50 flex items-center justify-center gap-3 shadow-md"
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
