'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { storageService } from '@/services/storage.service';
import { MasterRegistryConfig } from '@/types';
import { firestoreService, Hub, FirebaseConfig } from '@/services/firestore.service';
import { useAuth } from '@/contexts/AuthContext';
import { UserAccount } from '@/contexts/AuthContext';

export default function AdminSetup() {
  const router = useRouter();
  const { signInWithGoogle, user, setUserAccount, signOut } = useAuth();
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<Partial<MasterRegistryConfig>>({});
  const [loading, setLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    async function checkIfSetup() {
      const existingConfig = await storageService.getMasterRegistryConfig();
      if (existingConfig) {
        // Already setup, redirect to dashboard
        router.push('/admin/dashboard');
      }
    }
    checkIfSetup();
  }, [router]);

  // Check if user is authenticated
  useEffect(() => {
    if (!user) {
      router.push('/signup');
    }
  }, [user, router]);

  const handleConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      console.log('Saving config to localStorage...');
      await storageService.setMasterRegistryConfig(config);
      console.log('Config saved to localStorage successfully');
      
      // Save School Hub to Master Registry (nexore-hub)
      console.log('Saving school hub to Firestore...');
      const schoolHub: Hub = {
        id: config.schoolProjectId || 'default-school',
        name: config.schoolName || 'Default School',
        schoolId: config.schoolProjectId || 'default',
        type: 'school',
        schoolFirebaseConfig: {
          apiKey: config.schoolApiKey || '',
          authDomain: config.schoolAuthDomain || '',
          projectId: config.schoolProjectId || '',
          storageBucket: config.schoolStorageBucket || '',
          messagingSenderId: config.schoolMessagingSenderId || '',
          appId: config.schoolAppId || '',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await firestoreService.saveHub(schoolHub);
      console.log('School hub saved to Firestore successfully');
      
      // Save user account to Master Registry
      if (user?.email && user?.uid) {
        console.log('=== Admin Setup Debug ===');
        console.log('User email:', user.email);
        console.log('User UID:', user.uid);
        console.log('School Hub ID:', schoolHub.id);
        console.log('=========================');
        
        try {
          await firestoreService.saveUserAccount(user.email, schoolHub.id, user.uid, 'admin');
          console.log('User account saved successfully');
        } catch (error) {
          console.error('Error saving user account to Master Registry:', error);
          alert('Failed to save user account: ' + (error instanceof Error ? error.message : 'Unknown error'));
          setLoading(false);
          return;
        }
        
        // Save admin data to School Database
        try {
          const { schoolDatabaseService } = await import('@/services/school-database.service');
          const adminData = {
            email: user.email,
            uid: user.uid,
            role: 'admin',
            name: user.displayName || 'Admin',
            schoolId: schoolHub.id,
            updatedAt: new Date(),
          };
          await schoolDatabaseService.saveAdminWhitelist(schoolHub.schoolFirebaseConfig, [adminData]);
          console.log('Admin data saved to school database successfully');
        } catch (error) {
          console.error('Error saving admin data to school database:', error);
          // Continue anyway, as Master Registry save was successful
        }
      } else {
        console.error('User email or UID is missing, cannot save user account');
        alert('User information is missing. Please try signing in again.');
        setLoading(false);
        return;
      }
      
      console.log('Redirecting to dashboard...');
      router.push('/admin/dashboard');
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Failed to save configuration: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = (field: keyof MasterRegistryConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleCompleteSetup = async () => {
    setLoading(true);
    try {
      // Check if user is already signed in, if not sign in with Google
      if (!user?.email) {
        await signInWithGoogle();
      }
      
      if (!user?.email) {
        alert('กรุณาล็อกอินด้วย Google');
        setLoading(false);
        return;
      }

      // Save School Hub to Master Registry (nexore-hub)
      const schoolHub: Hub = {
        id: config.schoolProjectId || 'default-school',
        name: config.schoolName || 'Default School',
        schoolId: config.schoolProjectId || 'default',
        type: 'school',
        schoolFirebaseConfig: {
          apiKey: config.schoolApiKey || '',
          authDomain: config.schoolAuthDomain || '',
          projectId: config.schoolProjectId || '',
          storageBucket: config.schoolStorageBucket || '',
          messagingSenderId: config.schoolMessagingSenderId || '',
          appId: config.schoolAppId || '',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Save to Firestore
      await firestoreService.saveHub(schoolHub);
      console.log('Hub saved successfully');

      console.log('=== Admin Setup Debug ===');
      console.log('User object:', user);
      console.log('User email:', user.email);
      console.log('User UID:', user.uid);
      console.log('User UID type:', typeof user.uid);
      console.log('School Hub ID:', schoolHub.id);
      console.log('=========================');

      if (!user?.email || !user?.uid) {
        console.error('User email or UID is missing, cannot save user account');
        alert('User information is missing. Please try signing in again.');
        setLoading(false);
        return;
      }

      console.log('Saving user account to Master Registry:', user.email, schoolHub.id);
      try {
        await firestoreService.saveUserAccount(user.email, schoolHub.id, user.uid, 'admin');
        console.log('User account saved successfully');
      } catch (error) {
        console.error('Error saving user account to Master Registry:', error);
        alert('Failed to save user account: ' + (error instanceof Error ? error.message : 'Unknown error'));
        setLoading(false);
        return;
      }
      
      // Set user account for navigation
      const userAccount: UserAccount = {
        id: user.email,
        email: user.email,
        schoolId: schoolHub.id,
        schoolFirebaseConfig: schoolHub.schoolFirebaseConfig,
        role: 'admin',
        userId: schoolHub.id,
        name: config.schoolName || 'Admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setUserAccount(userAccount);

      // Save to localStorage as well
      await storageService.setMasterRegistryConfig({
        schoolProjectId: config.schoolProjectId,
        schoolName: config.schoolName,
        schoolFirebaseConfig: schoolHub.schoolFirebaseConfig,
      });

      setStep(3);
    } catch (error) {
      console.error('Error saving hub to Firestore:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      alert('ไม่สามารถบันทึกข้อมูล Hub ได้ กรุณาตรวจสอบ Firestore Rules ใน Firebase Console');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center overflow-hidden relative p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-2xl"
      >
        {/* Back Button */}
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => router.push('/setup/teacher')}
          className="mb-4 flex items-center gap-2 text-gray-500 hover:text-black transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          BACK
        </motion.button>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-black mb-2">
            ADMIN SETUP
          </h1>
          <p className="text-gray-500 tracking-widest">
            STEP {step} OF 4
          </p>
        </div>

        {/* Step 1: Firebase Config */}
        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-2xl p-6 shadow-lg"
          >
            <h2 className="text-2xl font-bold text-black mb-6">
              SET UP with Firebase
            </h2>
            <p className="text-gray-500 mb-6">
              Enter school information and Firebase configuration
            </p>

            <form onSubmit={handleConfigSubmit} className="space-y-4">
              <div>
                <label className="block text-gray-700 text-sm mb-2">School Name</label>
                <input
                  type="text"
                  value={config.schoolName || ''}
                  onChange={(e) => handleConfigChange('schoolName', e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-black focus:border-gray-400 focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 text-sm mb-2">API Key</label>
                <input
                  type="text"
                  value={config.schoolApiKey || ''}
                  onChange={(e) => handleConfigChange('schoolApiKey', e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-black focus:border-gray-400 focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 text-sm mb-2">Auth Domain</label>
                <input
                  type="text"
                  value={config.schoolAuthDomain || ''}
                  onChange={(e) => handleConfigChange('schoolAuthDomain', e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-black focus:border-gray-400 focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 text-sm mb-2">Project ID</label>
                <input
                  type="text"
                  value={config.schoolProjectId || ''}
                  onChange={(e) => handleConfigChange('schoolProjectId', e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-black focus:border-gray-400 focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 text-sm mb-2">Storage Bucket</label>
                <input
                  type="text"
                  value={config.schoolStorageBucket || ''}
                  onChange={(e) => handleConfigChange('schoolStorageBucket', e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-black focus:border-gray-400 focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 text-sm mb-2">Messaging Sender ID</label>
                <input
                  type="text"
                  value={config.schoolMessagingSenderId || ''}
                  onChange={(e) => handleConfigChange('schoolMessagingSenderId', e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-black focus:border-gray-400 focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 text-sm mb-2">App ID</label>
                <input
                  type="text"
                  value={config.schoolAppId || ''}
                  onChange={(e) => handleConfigChange('schoolAppId', e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-black focus:border-gray-400 focus:outline-none transition-colors"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gray-500 text-white font-bold py-3 rounded-lg hover:bg-[#000000] hover:scale-105 transition-all duration-150 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'NEXT'}
              </button>

              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => router.push('/setup/admin/guide')}
                  className="text-gray-400 text-sm hover:text-black transition-colors underline"
                >
                  Firebase Setup Guide
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
