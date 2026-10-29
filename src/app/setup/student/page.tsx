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
import { toast } from '@/components/Toast';
import { FormError } from '@/components/Modal';

export default function StudentSetup() {
  console.log('=== StudentSetup component mounted ===');
  const router = useRouter();
  const { signInWithGoogle, user, setUserAccount, signOut } = useAuth();
  const [step, setStep] = useState(1);
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [schoolId, setSchoolId] = useState<string>('');
  const [stepError, setStepError] = useState('');

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
      setStepError('กรุณากรอก School ID');
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
        setStepError('ไม่พบโรงเรียนนี้ในระบบ ตรวจสอบ School ID อีกครั้ง');
        setLoading(false);
        return;
      }

      console.log('Fetching student data from school database...');
      const studentData = await schoolDatabaseService.getStudentData(schoolHub.schoolFirebaseConfig, studentId, true);
      console.log('Student data fetched:', studentData);
      
      if (!studentData) {
        setStepError('เลขประจำตัวนักเรียนไม่พบในระบบ กรุณาติดต่อแอดมิน');
        setLoading(false);
        return;
      }

      // Check if student already has email/uid assigned
      if (studentData.email || studentData.uid) {
        setStepError('เลขประจำตัวนี้ถูกใช้งานแล้ว');
        setLoading(false);
        return;
      }

      console.log('Student data found, saving user account and redirecting...');
      
      if (!user?.email || !user?.uid) {
        toast.error('กรุณาล็อกอินด้วย Google');
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

      // Link the student record first: if this fails the student must not end up half-registered
      await schoolDatabaseService.saveStudentData(schoolHub.schoolFirebaseConfig, {
        studentId,
        email: user.email,
        uid: user.uid,
        role: 'student',
        updatedAt: new Date(),
      });

      // Save uid → schoolId mapping to Master Registry
      await firestoreService.saveUserAccount(user.email, schoolId, user.uid, 'student', studentId);

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
      setStepError('ไม่พบเลขประจำตัวนักเรียนในระบบ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="no-scroll bg-surface text-gray-900 dark:text-gray-50 flex items-center justify-center overflow-hidden relative p-4">
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
          onClick={() => { if (step === 2) { setStepError(''); setStep(1); } else router.push('/signup'); }}
          className="mb-4 flex items-center gap-2 text-gray-500 hover:text-gray-900 dark:hover:text-gray-50 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          ย้อนกลับ
        </motion.button>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-50 mb-2">
            ลงทะเบียนนักเรียน
          </h1>
          <p className="text-gray-500 tracking-widest">
            ขั้นตอนที่ {step} จาก 2
          </p>
        </div>

        {/* Step 1: QR Scan */}
        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-surface rounded-2xl p-6 shadow-neu-lg"
          >
            <p className="text-gray-500 mb-6">
              กรุณากรอก School ID
            </p>

            <div className="space-y-4">
              <div>
                <input
                  type="text"
                  value={schoolId}
                  onChange={(e) => { setSchoolId(e.target.value); setStepError(''); }}
                  placeholder="ใส่ School ID ของโรงเรียน"
                  className="w-full bg-surface border border-transparent shadow-neu-in-sm rounded-xl p-3 text-gray-900 dark:text-gray-50 focus:border-gray-400 focus:outline-none transition-colors"
                  aria-describedby="school-id-hint"
                />
                <p id="school-id-hint" className="mt-2 text-sm text-gray-500">School ID คือรหัสประจำโรงเรียน ขอรับได้จากครูผู้สอน</p>
              </div>

              <FormError message={stepError} className="" />

              <button
                onClick={handleSchoolIdSubmit}
                disabled={loading}
                className="w-full bg-gray-900 text-white dark:bg-gray-50 dark:text-gray-900 font-bold py-3 rounded-xl shadow-neu-sm hover:bg-black dark:hover:bg-white active:scale-[0.98] active:shadow-none transition-[background-color,box-shadow,transform] duration-150 disabled:opacity-50"
              >
                {loading ? 'กำลังตรวจสอบ...' : 'ถัดไป'}
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 2: ID Verification */}
        {step === 2 && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-surface rounded-2xl p-6 shadow-neu-lg"
          >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-6">
              ยืนยันตัวตน
            </h2>
            <p className="text-gray-500 mb-6">
              ใส่เลขประจำตัวนักเรียนเพื่อยืนยันตัวตน
            </p>

            <div className="space-y-4">
              <input
                type="text"
                value={studentId}
                onChange={(e) => { setStudentId(e.target.value); setStepError(''); }}
                className="w-full bg-surface border border-transparent shadow-neu-in-sm rounded-xl p-3 text-gray-900 dark:text-gray-50 focus:border-gray-400 focus:outline-none transition-colors"
                placeholder="เช่น S001"
                required
              />

              <FormError message={stepError} className="" />

              <button
                onClick={handleIDVerification}
                disabled={loading}
                className="w-full bg-gray-900 text-white dark:bg-gray-50 dark:text-gray-900 font-bold py-3 rounded-xl shadow-neu-sm hover:bg-black dark:hover:bg-white active:scale-[0.98] active:shadow-none transition-[background-color,box-shadow,transform] duration-150 disabled:opacity-50"
              >
                {loading ? 'กำลังยืนยัน...' : 'ยืนยัน'}
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}