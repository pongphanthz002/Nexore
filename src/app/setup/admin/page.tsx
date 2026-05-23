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
    <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden relative p-4">
      {/* Animated background */}
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
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2" style={{
            textShadow: '0 0 10px #39ff14, 0 0 20px #39ff14'
          }}>
            ADMIN SETUP
          </h1>
          <p className="text-neon-glow tracking-widest">
            STEP {step} OF 4
          </p>
        </div>

        {/* Step 1: Firebase Config */}
        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-black-500 border-2 border-neon-glow rounded-xl p-6"
          >
            <h2 className="text-2xl font-bold text-white mb-6">
              🔥 School Configuration
            </h2>
            <p className="text-gray-400 mb-6">
              ใส่ข้อมูลโรงเรียนและ Firebase Config สำหรับเก็บข้อมูลนักเรียนและครู
            </p>

            <form onSubmit={handleConfigSubmit} className="space-y-4">
              <div>
                <label className="block text-neon-glow text-sm mb-2">ชื่อโรงเรียน</label>
                <input
                  type="text"
                  value={config.schoolName || ''}
                  onChange={(e) => handleConfigChange('schoolName', e.target.value)}
                  className="w-full bg-black-400 border border-gray-600 rounded-lg p-3 text-white focus:border-neon-glow focus:outline-none transition-colors"
                  required
                />
              </div>

              <div className="border-t border-gray-600 pt-4 mt-4">
                <h3 className="text-lg font-bold text-white mb-4">School Firebase (สำหรับเก็บข้อมูลนักเรียน/ครู)</h3>
              </div>

              <div>
                <label className="block text-neon-glow text-sm mb-2">API Key</label>
                <input
                  type="text"
                  value={config.schoolApiKey || ''}
                  onChange={(e) => handleConfigChange('schoolApiKey', e.target.value)}
                  className="w-full bg-black-400 border border-gray-600 rounded-lg p-3 text-white focus:border-neon-glow focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-neon-glow text-sm mb-2">Auth Domain</label>
                <input
                  type="text"
                  value={config.schoolAuthDomain || ''}
                  onChange={(e) => handleConfigChange('schoolAuthDomain', e.target.value)}
                  className="w-full bg-black-400 border border-gray-600 rounded-lg p-3 text-white focus:border-neon-glow focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-neon-glow text-sm mb-2">Project ID</label>
                <input
                  type="text"
                  value={config.schoolProjectId || ''}
                  onChange={(e) => handleConfigChange('schoolProjectId', e.target.value)}
                  className="w-full bg-black-400 border border-gray-600 rounded-lg p-3 text-white focus:border-neon-glow focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-neon-glow text-sm mb-2">Storage Bucket</label>
                <input
                  type="text"
                  value={config.schoolStorageBucket || ''}
                  onChange={(e) => handleConfigChange('schoolStorageBucket', e.target.value)}
                  className="w-full bg-black-400 border border-gray-600 rounded-lg p-3 text-white focus:border-neon-glow focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-neon-glow text-sm mb-2">Messaging Sender ID</label>
                <input
                  type="text"
                  value={config.schoolMessagingSenderId || ''}
                  onChange={(e) => handleConfigChange('schoolMessagingSenderId', e.target.value)}
                  className="w-full bg-black-400 border border-gray-600 rounded-lg p-3 text-white focus:border-neon-glow focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-neon-glow text-sm mb-2">App ID</label>
                <input
                  type="text"
                  value={config.schoolAppId || ''}
                  onChange={(e) => handleConfigChange('schoolAppId', e.target.value)}
                  className="w-full bg-black-400 border border-gray-600 rounded-lg p-3 text-white focus:border-neon-glow focus:outline-none transition-colors"
                  required
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="w-full bg-neon-glow text-black font-bold py-3 rounded-lg hover:bg-neon-bright transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Continue'}
              </motion.button>
            </form>
          </motion.div>
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
