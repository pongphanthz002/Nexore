'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import StudentScheduleWidget from '@/components/StudentScheduleWidget';
import StudentHeader from '@/components/StudentHeader';
import StudentFooter from '@/components/StudentFooter';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import { studentDatabaseService } from '@/services/student-database.service';
import { AlertCircle, Clock, BookOpen, ChevronRight } from 'lucide-react';

interface PendingAssignment {
  subjectId: string;
  subjectName: string;
  assignmentTitle: string;
  deadline: string;
  maxScore: number;
  teacherName: string;
}

export default function StudentDashboard() {
  const [isDark, setIsDark] = useState(false);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAssignments, setPendingAssignments] = useState<PendingAssignment[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
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

        // Fetch pending assignments
        if (studentData) {
          setLoadingPending(true);
          try {
            const pending = await studentDatabaseService.getStudentPendingAssignments(
              userAccount.schoolFirebaseConfig,
              studentData
            );
            setPendingAssignments(pending);
          } catch (err) {
            console.error('Error loading pending assignments:', err);
          } finally {
            setLoadingPending(false);
          }
        }
      } catch (error) {
        console.error('Error loading student info:', error);
      } finally {
        setLoading(false);
      }
    };
    loadStudentInfo();
  }, [userAccount]);

  const formatDeadline = (deadline: string) => {
    if (!deadline) return '';
    try {
      const date = new Date(deadline);
      const now = new Date();
      const diffMs = date.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      const formatted = date.toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: undefined
      });

      if (diffDays < 0) return { text: `เลยกำหนด ${Math.abs(diffDays)} วัน`, isOverdue: true, formatted };
      if (diffDays === 0) return { text: 'วันนี้!', isOverdue: true, formatted };
      if (diffDays === 1) return { text: 'พรุ่งนี้', isOverdue: false, formatted };
      if (diffDays <= 3) return { text: `อีก ${diffDays} วัน`, isOverdue: false, formatted };
      return { text: formatted, isOverdue: false, formatted };
    } catch {
      return { text: deadline, isOverdue: false, formatted: deadline };
    }
  };

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <StudentHeader isDark={isDark} toggleTheme={toggleTheme} />
      
      {/* Main content */}
      <div className="pt-24 pb-24 px-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Student Schedule Widget */}
          <StudentScheduleWidget isDark={isDark} studentInfo={studentInfo} />

          {/* Pending Assignments Section */}
          {!loadingPending && pendingAssignments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className={`${isDark ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-100'} border rounded-2xl p-5 shadow-sm`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-red-950/50' : 'bg-red-50'}`}>
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className={`font-bold text-base ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                      งานค้าง
                    </h3>
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {pendingAssignments.length} รายการ
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {pendingAssignments.map((item, idx) => {
                    const deadlineInfo = item.deadline ? formatDeadline(item.deadline) : null;
                    const isOverdue = typeof deadlineInfo === 'object' && deadlineInfo?.isOverdue;

                    return (
                      <motion.div
                        key={`${item.subjectId}-${item.assignmentTitle}-${idx}`}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        onClick={() => router.push('/student/dashboard/subjects')}
                        className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-sm active:scale-[0.98] ${
                          isOverdue
                            ? (isDark ? 'bg-red-950/20 border-red-900/40' : 'bg-red-50/60 border-red-200/60')
                            : (isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-100')
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className={`font-bold text-sm leading-tight truncate ${
                              isOverdue ? 'text-red-500' : (isDark ? 'text-slate-200' : 'text-slate-700')
                            }`}>
                              {item.assignmentTitle}
                            </p>
                            <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              {item.subjectName}
                            </p>
                            {deadlineInfo && typeof deadlineInfo === 'object' && (
                              <p className={`text-xs font-semibold flex items-center gap-1 mt-1 ${
                                isOverdue ? 'text-red-500' : (isDark ? 'text-slate-400' : 'text-slate-500')
                              }`}>
                                <Clock className="w-3 h-3" />
                                กำหนดส่ง: {deadlineInfo.text}
                              </p>
                            )}
                          </div>
                          <div className={`p-1.5 rounded-lg shrink-0 ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-400'}`}>
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
      
      <StudentFooter isDark={isDark} />
    </div>
  );
}
