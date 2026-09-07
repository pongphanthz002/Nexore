'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import StudentScheduleWidget from '@/components/StudentScheduleWidget';
import StudentHeader from '@/components/StudentHeader';
import StudentFooter from '@/components/StudentFooter';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';

export default function StudentDashboard() {
  const [isDark, setIsDark] = useState(false);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { userAccount } = useAuth();

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));

    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const loadStudentInfo = async () => {
      if (!userAccount?.schoolFirebaseConfig || !userAccount?.userId) return;

      try {
        setLoading(true);
        let studentData = await schoolDatabaseService.getStudentData(
          userAccount.schoolFirebaseConfig,
          userAccount.userId
        );

        // If not found by userId, try by email
        if (!studentData && userAccount?.email) {
          studentData = await schoolDatabaseService.getStudentDataByEmail(
            userAccount.schoolFirebaseConfig,
            userAccount.email
          );
        }

        setStudentInfo(studentData);
      } catch (error) {
        console.error('Error loading student info:', error);
      } finally {
        setLoading(false);
      }
    };
    loadStudentInfo();
  }, [userAccount]);

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <StudentHeader isDark={isDark} toggleTheme={toggleTheme} />
      
      {/* Main content */}
      <div className="pt-24 pb-24 px-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Student Schedule Widget */}
          <StudentScheduleWidget isDark={isDark} studentInfo={studentInfo} />
        </div>
      </div>
      
      <StudentFooter isDark={isDark} />
    </div>
  );
}
