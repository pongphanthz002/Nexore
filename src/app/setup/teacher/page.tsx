'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { storageService } from '@/services/storage.service';
import { UserIdentity } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { firestoreService, Hub } from '@/services/firestore.service';
import { schoolDatabaseService, TeacherFirebaseConfig } from '@/services/school-database.service';
import { UserAccount } from '@/contexts/AuthContext';

export default function TeacherSetup() {
  const router = useRouter();
  const { signInWithGoogle, user, setUserAccount, signOut } = useAuth();
  const [step, setStep] = useState(1);
  const [teacherId, setTeacherId] = useState('');
  const [loading, setLoading] = useState(false);
  const [schoolId, setSchoolId] = useState<string>('');
  const [schoolFirebaseConfig, setSchoolFirebaseConfig] = useState<any>(null);
  const [teacherFirebaseConfig, setTeacherFirebaseConfig] = useState({
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  });

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
        className="relative z-10 w-full max-w-md"
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
            TEACHER SETUP
          </h1>
          <p className="text-neon-glow tracking-widest">
            STEP {step} OF 3
          </p>
        </div>

        {/* Step 1: School ID Input */}
        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-black-500 border-2 border-neon-glow rounded-xl p-6"
          >
            <h2 className="text-2xl font-bold text-white mb-6">
              🏫 เชื่อมต่อกับโรงเรียน
            </h2>
            <p className="text-gray-400 mb-6">
              กรอก School ID เพื่อเชื่อมต่อกับโรงเรียน
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-neon-glow text-sm mb-2">School ID</label>
                <input
                  type="text"
                  value={schoolId}
                  onChange={(e) => setSchoolId(e.target.value)}
                  placeholder="ใส่ School ID ของโรงเรียน"
                  className="w-full bg-black-400 border border-gray-600 rounded-lg p-3 text-white focus:border-neon-glow focus:outline-none transition-colors"
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSchoolIdSubmit}
                disabled={loading}
                className="w-full bg-neon-glow text-black font-bold py-3 rounded-lg hover:bg-neon-bright transition-colors disabled:opacity-50"
              >
                {loading ? 'กำลังตรวจสอบ...' : 'ถัดไป'}
              </motion.button>

              {/* Admin Setup Link */}
              <div className="text-center mt-4">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => router.push('/setup/admin')}
                  className="text-gray-400 text-sm hover:text-neon-glow transition-colors underline"
                >
                  หรือ Setup ในฐานะ Admin
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 2: ID Verification */}
        {step === 2 && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-black-500 border-2 border-neon-glow rounded-xl p-6"
          >
            <h2 className="text-2xl font-bold text-white mb-6">
              🆔 ID Verification
            </h2>
            <p className="text-gray-400 mb-6">
              ใส่เลขประจำตัวครูเพื่อยืนยันตัวตน
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-neon-glow text-sm mb-2">เลขประจำตัวครู</label>
                <input
                  type="text"
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  className="w-full bg-black-400 border border-gray-600 rounded-lg p-3 text-white focus:border-neon-glow focus:outline-none transition-colors"
                  placeholder="เช่น T001"
                  required
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleIDVerification}
                disabled={loading}
                className="w-full bg-neon-glow text-black font-bold py-3 rounded-lg hover:bg-neon-bright transition-colors disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Node Binding */}
        {step === 3 && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-black-500 border-2 border-neon-glow rounded-xl p-6"
          >
            <h2 className="text-2xl font-bold text-white mb-6">
              🔗 Complete Setup
            </h2>
            <p className="text-gray-400 mb-6">
              ใส่ Firebase Config สำหรับฐานข้อมูลของครู
            </p>

            <div className="space-y-4">
              <div className="bg-black-400 border border-gray-600 rounded-lg p-4 mb-4">
                <p className="text-gray-400 text-sm mb-2">
                  School ID: {schoolId}
                </p>
                <p className="text-gray-400 text-sm mb-2">
                  Teacher ID: {teacherId}
                </p>
              </div>

              <div>
                <label className="block text-neon-glow text-sm mb-2">API Key</label>
                <input
                  type="text"
                  value={teacherFirebaseConfig.apiKey}
                  onChange={(e) => setTeacherFirebaseConfig({...teacherFirebaseConfig, apiKey: e.target.value})}
                  className="w-full bg-black-400 border border-gray-600 rounded-lg p-3 text-white focus:border-neon-glow focus:outline-none transition-colors"
                  placeholder="AIzaSy..."
                  required
                />
              </div>

              <div>
                <label className="block text-neon-glow text-sm mb-2">Auth Domain</label>
                <input
                  type="text"
                  value={teacherFirebaseConfig.authDomain}
                  onChange={(e) => setTeacherFirebaseConfig({...teacherFirebaseConfig, authDomain: e.target.value})}
                  className="w-full bg-black-400 border border-gray-600 rounded-lg p-3 text-white focus:border-neon-glow focus:outline-none transition-colors"
                  placeholder="your-app.firebaseapp.com"
                  required
                />
              </div>

              <div>
                <label className="block text-neon-glow text-sm mb-2">Project ID</label>
                <input
                  type="text"
                  value={teacherFirebaseConfig.projectId}
                  onChange={(e) => setTeacherFirebaseConfig({...teacherFirebaseConfig, projectId: e.target.value})}
                  className="w-full bg-black-400 border border-gray-600 rounded-lg p-3 text-white focus:border-neon-glow focus:outline-none transition-colors"
                  placeholder="your-project-id"
                  required
                />
              </div>

              <div>
                <label className="block text-neon-glow text-sm mb-2">Storage Bucket</label>
                <input
                  type="text"
                  value={teacherFirebaseConfig.storageBucket}
                  onChange={(e) => setTeacherFirebaseConfig({...teacherFirebaseConfig, storageBucket: e.target.value})}
                  className="w-full bg-black-400 border border-gray-600 rounded-lg p-3 text-white focus:border-neon-glow focus:outline-none transition-colors"
                  placeholder="your-project.appspot.com"
                  required
                />
              </div>

              <div>
                <label className="block text-neon-glow text-sm mb-2">Messaging Sender ID</label>
                <input
                  type="text"
                  value={teacherFirebaseConfig.messagingSenderId}
                  onChange={(e) => setTeacherFirebaseConfig({...teacherFirebaseConfig, messagingSenderId: e.target.value})}
                  className="w-full bg-black-400 border border-gray-600 rounded-lg p-3 text-white focus:border-neon-glow focus:outline-none transition-colors"
                  placeholder="123456789"
                  required
                />
              </div>

              <div>
                <label className="block text-neon-glow text-sm mb-2">App ID</label>
                <input
                  type="text"
                  value={teacherFirebaseConfig.appId}
                  onChange={(e) => setTeacherFirebaseConfig({...teacherFirebaseConfig, appId: e.target.value})}
                  className="w-full bg-black-400 border border-gray-600 rounded-lg p-3 text-white focus:border-neon-glow focus:outline-none transition-colors"
                  placeholder="1:123456789:web:abcdef"
                  required
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleNodeBinding}
                disabled={loading}
                className="w-full bg-neon-glow text-black font-bold py-3 rounded-lg hover:bg-neon-bright transition-colors disabled:opacity-50"
              >
                {loading ? 'Registering...' : 'Confirm & Complete Setup'}
              </motion.button>
            </div>
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
