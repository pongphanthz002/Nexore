'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { storageService } from '@/services/storage.service';
import { firestoreService } from '@/services/firestore.service';
import { schoolDatabaseService } from '@/services/school-database.service';
import { UserIdentity } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { UserAccount } from '@/contexts/AuthContext';

export default function StudentSetup() {
  console.log('=== StudentSetup component mounted ===');
  const router = useRouter();
  const { signInWithGoogle, user, setUserAccount, signOut } = useAuth();
  const [step, setStep] = useState(1);
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [schoolId, setSchoolId] = useState<string>('');
  const [showTooltip, setShowTooltip] = useState(false);

  // Check if user is authenticated
  useEffect(() => {
    console.log('=== useEffect - checking user authentication ===');
    console.log('User:', user);
    if (!user) {
      console.log('No user, redirecting to signup');
      router.push('/signup');
    } else {
      console.log('User is authenticated');
    }
  }, [user, router]);

  const handleSchoolIdSubmit = async () => {
    console.log('=== handleSchoolIdSubmit called ===');
    console.log('School ID:', schoolId);
    if (!schoolId.trim()) {
      alert('กรุณากรอก School ID');
      return;
    }
    console.log('Setting step to 2');
    setStep(2);
  };

  const handleIDVerification = async () => {
    console.log('=== handleIDVerification called ===');
    console.log('School ID:', schoolId);
    console.log('Student ID:', studentId);
    setLoading(true);
    
    try {
      console.log('Fetching school config from Master Registry...');
      // Fetch school config from Master Registry using schoolId
      const schoolHub = await firestoreService.getHub(schoolId.trim());
      console.log('School hub fetched:', schoolHub);
      
      if (!schoolHub || !schoolHub.schoolFirebaseConfig) {
        console.log('No school hub or no firebase config');
        alert('ไม่พบ School Firebase Config กรุณาติดต่อแอดมิน');
        setLoading(false);
        return;
      }

      console.log('Fetching student data from school database...');
      const studentData = await schoolDatabaseService.getStudentData(schoolHub.schoolFirebaseConfig, studentId);
      console.log('Student data fetched:', studentData);
      
      if (!studentData) {
        alert('เลขประจำตัวนักเรียนไม่พบในระบบ กรุณาติดต่อแอดมิน');
        setLoading(false);
        return;
      }
      
      console.log('Student data found, saving user account and redirecting...');
      
      if (!user?.email || !user?.uid) {
        alert('กรุณาล็อกอินด้วย Google');
        setLoading(false);
        return;
      }
      
      // Save student identity
      const identity: UserIdentity = {
        role: 'student',
        userId: studentId,
        studentId,
        schoolId: schoolId,
        isSetup: true,
        lastLogin: Date.now(),
      };

      await storageService.setUserIdentity(identity);

      // Save email → schoolId mapping to Master Registry
      console.log('Saving user account to Master Registry:', user.email, schoolId);
      console.log('User UID:', user.uid);
      await firestoreService.saveUserAccount(user.email, schoolId, user.uid, 'student');
      console.log('User account saved successfully');
      
      // Update student data with email, uid, and role in School Database
      const updatedStudentData = {
        ...studentData,
        email: user.email,
        uid: user.uid,
        role: 'student',
        updatedAt: new Date(),
      };

      try {
        await schoolDatabaseService.saveStudentData(schoolHub.schoolFirebaseConfig, updatedStudentData);
        console.log('Student data saved to school database successfully');
      } catch (error) {
        console.error('Error saving student data to school database:', error);
      }
      
      // Set up user account for navigation
      console.log('=== Setting up user account for navigation ===');
      console.log('User email:', user.email);
      console.log('School ID:', schoolId);
      console.log('Student ID:', studentId);
      console.log('Student name:', studentData.name);
      
      const userAccount: UserAccount = {
        id: user.email,
        email: user.email,
        schoolId: schoolId,
        schoolFirebaseConfig: schoolHub.schoolFirebaseConfig,
        role: 'student',
        userId: studentId,
        name: studentData.name,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      setUserAccount(userAccount);
      console.log('User account set, redirecting to /student/dashboard');
      router.push('/student/dashboard');
    } catch (error) {
      console.error('Error verifying ID:', error);
      alert('Student ID not found in registry');
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
          onClick={() => router.push('/signup')}
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
            STUDENT SETUP
          </h1>
          <p className="text-gray-500 tracking-widest">
            STEP {step} OF 2
          </p>
        </div>

        {/* Step 1: QR Scan */}
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
                    School ID คือรหัสประจำโรงเรียน<br/>ขอรับได้จากครูผู้สอน
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
              ใส่เลขประจำตัวนักเรียนเพื่อยืนยันตัวตน
            </p>

            <div className="space-y-4">
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg p-3 text-black focus:border-gray-400 focus:outline-none transition-colors"
                placeholder="เช่น S001"
                required
              />

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
      </motion.div>
    </div>
  );
}