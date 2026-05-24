'use client';

import { useState, useEffect, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { storageService } from '@/services/storage.service';
import { UserIdentity } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { firestoreService, Hub } from '@/services/firestore.service';
import { schoolDatabaseService, TeacherFirebaseConfig } from '@/services/school-database.service';
import { UserAccount } from '@/contexts/AuthContext';

function TeacherSetupContent() {
  const router = useRouter();
  const { signInWithGoogle, user, setUserAccount, signOut } = useAuth();
  const [step, setStep] = useState(1);
  const [teacherId, setTeacherId] = useState('');
  const [loading, setLoading] = useState(false);
  const [schoolId, setSchoolId] = useState<string>('');
  const [schoolFirebaseConfig, setSchoolFirebaseConfig] = useState<any>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [teacherFirebaseConfig, setTeacherFirebaseConfig] = useState({
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  });
  const searchParams = useSearchParams();

  // Restore state from localStorage on mount
  useEffect(() => {
    const savedStep = localStorage.getItem('teacherSetup_step');
    const savedSchoolId = localStorage.getItem('teacherSetup_schoolId');
    const savedSchoolFirebaseConfig = localStorage.getItem('teacherSetup_schoolFirebaseConfig');
    const savedTeacherId = localStorage.getItem('teacherSetup_teacherId');
    
    if (savedStep) {
      setStep(parseInt(savedStep));
      if (savedSchoolId) setSchoolId(savedSchoolId);
      if (savedSchoolFirebaseConfig) setSchoolFirebaseConfig(JSON.parse(savedSchoolFirebaseConfig));
      if (savedTeacherId) setTeacherId(savedTeacherId);
    }
  }, []);

  // Check if user is authenticated
  useEffect(() => {
    if (!user) {
      router.push('/signup');
    }
  }, [user, router]);

  const handleSchoolIdSubmit = async () => {
    if (!schoolId.trim()) {
      alert('กรุณากรอก School ID');
      return;
    }

    try {
      // Fetch school hub from Master Registry to get school's Firebase config
      const schoolHub = await firestoreService.getHub(schoolId.trim());
      if (schoolHub && schoolHub.schoolFirebaseConfig) {
        setSchoolFirebaseConfig(schoolHub.schoolFirebaseConfig);
        // Save to localStorage for state preservation
        localStorage.setItem('teacherSetup_schoolId', schoolId);
        localStorage.setItem('teacherSetup_schoolFirebaseConfig', JSON.stringify(schoolHub.schoolFirebaseConfig));
        localStorage.setItem('teacherSetup_step', '2');
        setStep(2);
      } else {
        alert('ไม่พบข้อมูลโรงเรียนในระบบ');
      }
    } catch (error) {
      console.error('Error fetching school hub:', error);
      alert('ไม่สามารถดึงข้อมูลโรงเรียนได้');
    }
  };

  const handleIDVerification = async () => {
    setLoading(true);
    
    try {
      // Use schoolFirebaseConfig from state (fetched in handleSchoolIdSubmit)
      if (!schoolFirebaseConfig) {
        alert('ไม่พบ School Firebase Config กรุณาติดต่อแอดมิน');
        setLoading(false);
        return;
      }

      const teachers = await schoolDatabaseService.getAllTeachers(schoolFirebaseConfig);
      console.log('Teachers from Firestore:', teachers);
      console.log('Teacher ID entered:', teacherId);
      
      const teacherExists = teachers.some((t: any) => t.teacherId === teacherId);
      console.log('Teacher exists:', teacherExists);
      
      if (!teacherExists) {
        alert('เลขประจำตัวครูไม่พบในระบบ กรุณาติดต่อแอดมิน');
        setLoading(false);
        return;
      }

      // Get teacher data
      const teacherData = teachers.find((t: any) => t.teacherId === teacherId);

      if (!teacherData) {
        alert('ไม่พบข้อมูลครู กรุณาติดต่อแอดมิน');
        setLoading(false);
        return;
      }

      // Check if teacher already has email/uid assigned
      if (teacherData.email || teacherData.uid) {
        alert('เลขประจำตัวนี้ถูกใช้งานแล้ว');
        setLoading(false);
        return;
      }

      // Save to localStorage for state preservation
      localStorage.setItem('teacherSetup_teacherId', teacherId);
      localStorage.setItem('teacherSetup_step', '3');
      setStep(3);
    } catch (error) {
      console.error('Error verifying ID:', error);
      alert('Teacher ID not found in registry');
    } finally {
      setLoading(false);
    }
  };

  const handleNodeBinding = async () => {
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

      // Get teacher data again
      const teachers = await schoolDatabaseService.getAllTeachers(schoolFirebaseConfig);
      const teacherData = teachers.find((t: any) => t.teacherId === teacherId);
      
      if (!teacherData) {
        alert('ไม่พบข้อมูลครู กรุณาติดต่อแอดมิน');
        setLoading(false);
        return;
      }
      
      // Save teacher identity
      const identity: UserIdentity = {
        role: 'teacher',
        userId: teacherId,
        teacherId,
        schoolId: schoolId,
        isSetup: true,
        lastLogin: Date.now(),
      };

      await storageService.setUserIdentity(identity);

      // Save email → schoolId mapping to Master Registry
      console.log('Saving user account to Master Registry:', user.email, schoolId);
      console.log('User UID:', user.uid);
      await firestoreService.saveUserAccount(user.email, schoolId, user.uid, 'teacher');
      console.log('User account saved successfully');
      
      // Update teacher data with email, uid, role, and Firebase config in School Database
      const updatedTeacherData: TeacherFirebaseConfig = {
        teacherId: teacherId,
        name: teacherData.name,
        email: user.email,
        uid: user.uid,
        role: 'teacher',
        firebaseConfig: teacherFirebaseConfig,
        createdAt: teacherData.createdAt || new Date(),
        updatedAt: new Date(),
      };

      try {
        await schoolDatabaseService.saveTeacherConfig(schoolFirebaseConfig, updatedTeacherData);
        console.log('Teacher data saved to school database successfully');
      } catch (error) {
        console.error('Error saving teacher data to school database:', error);
      }

      // Set up user account for navigation with teacher's Firebase config
      console.log('=== Setting up user account for navigation ===');
      console.log('User email:', user.email);
      console.log('School ID:', schoolId);
      console.log('Teacher ID:', teacherId);
      console.log('Teacher name:', teacherData.name);
      console.log('Teacher Firebase config:', teacherFirebaseConfig);

      const userAccount: UserAccount = {
        id: user.email,
        email: user.email,
        schoolId: schoolId,
        schoolFirebaseConfig: teacherFirebaseConfig, // Use teacher's own Firebase config
        role: 'teacher',
        userId: teacherId,
        name: teacherData.name,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      setUserAccount(userAccount);
      console.log('User account set, redirecting to /teacher/dashboard');
      router.push('/teacher/dashboard');
    } catch (error) {
      console.error('Error in node binding:', error);
      alert('Failed to register teacher node');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center overflow-hidden relative p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Back Button */}
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            if (step > 1) {
              setStep(step - 1);
            } else {
              localStorage.removeItem('teacherSetup_step');
              localStorage.removeItem('teacherSetup_schoolId');
              localStorage.removeItem('teacherSetup_schoolFirebaseConfig');
              localStorage.removeItem('teacherSetup_teacherId');
              router.push('/signup');
            }
          }}
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
            TEACHER SETUP
          </h1>
          <p className="text-gray-500 tracking-widest">
            STEP {step} OF 3
          </p>
        </div>

        {/* Step 1: School ID Input */}
        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-2xl p-6 shadow-lg"
          >
            <p className="text-gray-500 mb-6">
              กรุณากรอก School ID
            </p>

            <div className="space-y-4">
              <div className="relative">
                <input
                  type="text"
                  value={schoolId}
                  onChange={(e) => setSchoolId(e.target.value)}
                  placeholder="ใส่ School ID ของโรงเรียน"
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-black focus:border-gray-400 focus:outline-none transition-colors pr-10"
                />
                <button
                  type="button"
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                {showTooltip && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-gray-800 text-white text-sm rounded-lg p-3 shadow-lg z-10">
                    School ID คือรหัสประจำโรงเรียน<br/>ขอรับได้จากผู้ดูแล
                  </div>
                )}
              </div>

              <button
                onClick={handleSchoolIdSubmit}
                disabled={loading}
                className="w-full bg-gray-500 text-white font-bold py-3 rounded-lg hover:bg-[#000000] hover:scale-105 transition-all duration-150 disabled:opacity-50"
              >
                {loading ? 'กำลังตรวจสอบ...' : 'NEXT'}
              </button>

              {/* Admin Setup Link */}
              <div className="text-center mt-4">
                <button
                  onClick={() => router.push('/setup/admin')}
                  className="text-gray-400 text-sm hover:text-black transition-colors underline"
                >
                  หรือ Setup ในฐานะ Admin
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 2: ID Verification */}
        {step === 2 && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-2xl p-6 shadow-lg"
          >
            <h2 className="text-2xl font-bold text-black mb-6">
              ID Verification
            </h2>
            <p className="text-gray-500 mb-6">
              ใส่เลขประจำตัวครูเพื่อยืนยันตัวตน
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-gray-700 text-sm mb-2">เลขประจำตัวครู</label>
                <input
                  type="text"
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-black focus:border-gray-400 focus:outline-none transition-colors"
                  placeholder="เช่น T001"
                  required
                />
              </div>

              <button
                onClick={handleIDVerification}
                disabled={loading}
                className="w-full bg-gray-500 text-white font-bold py-3 rounded-lg hover:bg-[#000000] hover:scale-105 transition-all duration-150 disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Node Binding */}
        {step === 3 && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-2xl p-6 shadow-lg"
          >
            <h2 className="text-2xl font-bold text-black mb-6">
              SET UP with Firebase
            </h2>

            <div className="space-y-4">
              <div className="bg-gray-900 rounded-lg p-4 mb-4">
                <p className="text-green-400 text-sm mb-2">
                  School ID: <span className="text-white">{schoolId}</span>
                </p>
                <p className="text-green-400 text-sm mb-2">
                  Teacher ID: <span className="text-white">{teacherId}</span>
                </p>
              </div>

              <p className="text-gray-500 mb-6">
                Enter your Firebase configuration
              </p>

              <div>
                <label className="block text-gray-700 text-sm mb-2">API Key</label>
                <input
                  type="text"
                  value={teacherFirebaseConfig.apiKey}
                  onChange={(e) => setTeacherFirebaseConfig({...teacherFirebaseConfig, apiKey: e.target.value})}
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-black focus:border-gray-400 focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 text-sm mb-2">Auth Domain</label>
                <input
                  type="text"
                  value={teacherFirebaseConfig.authDomain}
                  onChange={(e) => setTeacherFirebaseConfig({...teacherFirebaseConfig, authDomain: e.target.value})}
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-black focus:border-gray-400 focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 text-sm mb-2">Project ID</label>
                <input
                  type="text"
                  value={teacherFirebaseConfig.projectId}
                  onChange={(e) => setTeacherFirebaseConfig({...teacherFirebaseConfig, projectId: e.target.value})}
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-black focus:border-gray-400 focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 text-sm mb-2">Storage Bucket</label>
                <input
                  type="text"
                  value={teacherFirebaseConfig.storageBucket}
                  onChange={(e) => setTeacherFirebaseConfig({...teacherFirebaseConfig, storageBucket: e.target.value})}
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-black focus:border-gray-400 focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 text-sm mb-2">Messaging Sender ID</label>
                <input
                  type="text"
                  value={teacherFirebaseConfig.messagingSenderId}
                  onChange={(e) => setTeacherFirebaseConfig({...teacherFirebaseConfig, messagingSenderId: e.target.value})}
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-black focus:border-gray-400 focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 text-sm mb-2">App ID</label>
                <input
                  type="text"
                  value={teacherFirebaseConfig.appId}
                  onChange={(e) => setTeacherFirebaseConfig({...teacherFirebaseConfig, appId: e.target.value})}
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-black focus:border-gray-400 focus:outline-none transition-colors"
                  required
                />
              </div>

              <button
                onClick={handleNodeBinding}
                disabled={loading}
                className="w-full bg-gray-500 text-white font-bold py-3 rounded-lg hover:bg-[#000000] hover:scale-105 transition-all duration-150 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'NEXT'}
              </button>

              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => router.push('/setup/admin/guide?from=teacher')}
                  className="text-gray-400 text-sm hover:text-black transition-colors underline"
                >
                  Firebase Setup Guide
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

export default function TeacherSetup() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center">Loading...</div>}>
      <TeacherSetupContent />
    </Suspense>
  );
}
