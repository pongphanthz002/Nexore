'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { storageService } from '@/services/storage.service';
import { firestoreService } from '@/services/firestore.service';
import { schoolDatabaseService } from '@/services/school-database.service';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import PieChart from '@/components/PieChart';
import { Files } from 'lucide-react';

export default function AdminDashboard() {
  const router = useRouter();
  const { userAccount, signOut } = useAuth();
  const [stats, setStats] = useState({ students: 0, teachers: 0, nodes: 0, signedUpStudents: 0, signedUpTeachers: 0 });
  const [schoolId, setSchoolId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));

    // Listen for theme changes
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
    async function loadData() {
      try {
        setLoading(true);
        let schoolFirebaseConfig = null;
        let currentSchoolId = '';

        // Try to get from userAccount first (new system)
        if (userAccount && userAccount.role === 'admin') {
          schoolFirebaseConfig = userAccount.schoolFirebaseConfig;
          currentSchoolId = userAccount.schoolId;
          console.log('Using userAccount data:', { schoolFirebaseConfig, currentSchoolId });
        } else {
          // Fallback to localStorage (old system)
          const config = await storageService.getMasterRegistryConfig();
          if (config && config.schoolProjectId) {
            // Fetch from Master Registry Firestore
            const hub = await firestoreService.getHub(config.schoolProjectId);
            if (hub && hub.schoolFirebaseConfig) {
              schoolFirebaseConfig = hub.schoolFirebaseConfig;
            }
            currentSchoolId = config.schoolProjectId;
          }
        }

        if (schoolFirebaseConfig) {
          console.log('Loading data with Firebase config:', schoolFirebaseConfig);
          // Parallel loading: fetch teachers and students simultaneously using optimized queries
          const [teachers, students] = await Promise.all([
            schoolDatabaseService.getAllTeachersOptimized(schoolFirebaseConfig),
            schoolDatabaseService.getAllStudentsOptimized(schoolFirebaseConfig)
          ]);
          
          console.log('Teachers:', teachers.length, 'Students:', students.length);
          
          const signedUpTeachers = teachers.filter(t => t.firebaseConfig && Object.keys(t.firebaseConfig).length > 0).length;
          const signedUpStudents = students.filter(s => s.uid).length;
          
          setStats({
            students: students.length,
            teachers: teachers.length,
            nodes: signedUpTeachers,
            signedUpStudents,
            signedUpTeachers,
          });
        }

        // Set school ID
        setSchoolId(currentSchoolId);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [userAccount]);

  const handleCopySchoolId = () => {
    if (schoolId) {
      navigator.clipboard.writeText(schoolId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getDisplaySchoolId = () => {
    return `School ID: ${schoolId}`;
  };

  // Generate syntax highlighted School ID
  const getHighlightedSchoolId = () => {
    const prefix = 'School ID: ';
    const id = schoolId;
    return (
      <>
        <span className="text-purple-600 dark:text-purple-400">{prefix}</span>
        <span className="text-blue-600 dark:text-blue-400">{id}</span>
      </>
    );
  };

  return (
    <div className="p-6">
      {/* Main content */}
      <div className="max-w-7xl mx-auto">

        {/* PIE Charts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.2 }}
          whileHover={{ scale: 1.01, y: -3 }}
          className={`rounded-2xl p-8 mb-8 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
        >
          <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-6`}>สถิติผู้ใช้</h2>
          <div className="flex justify-center gap-12">
            <PieChart
              label="ครู"
              total={stats.teachers}
              signedUp={stats.signedUpTeachers}
              color="#3b82f6"
              bgColor={isDark ? '#374151' : '#e5e7eb'}
              unsignedColor="#ef4444"
              isDark={isDark}
            />
            <PieChart
              label="นักเรียน"
              total={stats.students}
              signedUp={stats.signedUpStudents}
              color="#10b981"
              bgColor={isDark ? '#374151' : '#e5e7eb'}
              unsignedColor="#ef4444"
              isDark={isDark}
            />
          </div>
        </motion.div>

        {/* School ID Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.3 }}
          whileHover={{ scale: 1.01, y: -3 }}
          className={`rounded-2xl p-6 mb-8 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}
        >
          <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-4`}>
            School ID
          </h2>
          {schoolId && (
            <div className="relative p-4 rounded-2xl bg-gray-100 dark:bg-gray-700 font-mono text-sm">
              <div className="flex items-center justify-between">
                <p className="text-gray-800 dark:text-white">{getHighlightedSchoolId()}</p>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  onClick={handleCopySchoolId}
                  className="p-2 bg-gray-300 dark:bg-gray-600 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-all"
                >
                  <Files size={20} className={isDark ? 'text-white' : 'text-gray-900'} />
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Floating Toast */}
        {copied && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-2xl shadow-lg z-50 backdrop-blur-[20px] saturate-[180%]"
            style={{
              boxShadow: '0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3)',
            }}
          >
            คัดลอกแล้ว!
          </motion.div>
        )}

        {/* Action Card - Users Management */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.4 }}
          whileHover={{ scale: 1.02, y: -5 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => router.push('/admin/dashboard/users')}
          className={`rounded-2xl p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg cursor-pointer`}
        >
          <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            จัดการข้อมูล
          </h3>
        </motion.div>
      </div>
    </div>
  );
}
