'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { storageService } from '@/services/storage.service';
import { firestoreService } from '@/services/firestore.service';
import { schoolDatabaseService } from '@/services/school-database.service';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminDashboard() {
  const router = useRouter();
  const { userAccount, signOut } = useAuth();
  const [stats, setStats] = useState({ students: 0, teachers: 0, nodes: 0 });
  const [schoolId, setSchoolId] = useState<string>('');
  const [loading, setLoading] = useState(true);

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
          const teachers = await schoolDatabaseService.getAllTeachers(schoolFirebaseConfig);
          const students = await schoolDatabaseService.getAllStudents(schoolFirebaseConfig);
          
          console.log('Teachers:', teachers.length, 'Students:', students.length);
          
          setStats({
            students: students.length,
            teachers: teachers.length,
            nodes: teachers.filter(t => t.firebaseConfig && Object.keys(t.firebaseConfig).length > 0).length,
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

  const handleSwitchRole = () => {
    router.push('/teacher/dashboard');
  };

  return (
    <div className="min-h-screen bg-black overflow-hidden relative">
      {/* Animated background grid */}
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

      {/* Glowing orbs */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute w-96 h-96 bg-neon-glow rounded-full blur-3xl opacity-20 top-0 right-0"
      />

      <div className="relative z-10 p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h1 className="text-3xl font-bold text-white" style={{
              textShadow: '0 0 10px #39ff14, 0 0 20px #39ff14'
            }}>
              ADMIN DASHBOARD
            </h1>
            <p className="text-neon-glow text-sm tracking-widest">
              SYSTEM CONTROL
            </p>
          </div>
          <div className="flex gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={async () => {
                await signOut();
                router.push('/');
              }}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              Log out
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSwitchRole}
              className="bg-neon-glow text-black px-4 py-2 rounded-lg hover:bg-neon-bright transition-colors font-bold"
            >
              Switch Role
            </motion.button>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-black-500 border-2 border-neon-glow rounded-xl p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Students</p>
                <p className="text-3xl font-bold text-white">{stats.students}</p>
              </div>
              <span className="text-4xl">👨‍🎓</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-black-500 border-2 border-neon-glow rounded-xl p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Teachers</p>
                <p className="text-3xl font-bold text-white">{stats.teachers}</p>
              </div>
              <span className="text-4xl">👨‍🏫</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-black-500 border-2 border-neon-glow rounded-xl p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Active Nodes</p>
                <p className="text-3xl font-bold text-white">{stats.nodes}</p>
              </div>
              <span className="text-4xl">🔗</span>
            </div>
          </motion.div>
        </div>

        {/* School ID Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-black-500 border-2 border-neon-glow rounded-xl p-6 mb-6"
        >
          <h2 className="text-xl font-bold text-white mb-4">
            🏫 School ID
          </h2>
          <p className="text-gray-400 mb-4">
            School ID สำหรับครูและนักเรียนใช้เชื่อมต่อกับโรงเรียน
          </p>
          {schoolId && (
            <div className="p-4 bg-black-400 rounded-lg">
              <p className="text-gray-400 text-sm mb-1">School ID:</p>
              <p className="text-neon-glow font-mono text-lg">{schoolId}</p>
            </div>
          )}
        </motion.div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
            whileHover={{ scale: 1.02, boxShadow: '0 0 20px rgba(57, 255, 20, 0.3)' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push('/admin/dashboard/users')}
            className="bg-black-500 border-2 border-neon-glow rounded-xl p-6 cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white group-hover:text-neon-glow transition-colors">
                👥 จัดการผู้ใช้
              </h3>
              <span className="text-3xl">👤</span>
            </div>
            <p className="text-gray-400 text-sm">
              จัดการข้อมูลนักเรียนและครู (รวมห้องเรียนและชั้นเรียน)
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7 }}
            whileHover={{ scale: 1.02, boxShadow: '0 0 20px rgba(57, 255, 20, 0.3)' }}
            className="bg-black-500 border-2 border-neon-glow rounded-xl p-6 cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white group-hover:text-neon-glow transition-colors">
                📊 รายงาน
              </h3>
              <span className="text-3xl">📈</span>
            </div>
            <p className="text-gray-400 text-sm">
              ดูรายงานและสถิติระบบ
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8 }}
            whileHover={{ scale: 1.02, boxShadow: '0 0 20px rgba(57, 255, 20, 0.3)' }}
            className="bg-black-500 border-2 border-neon-glow rounded-xl p-6 cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white group-hover:text-neon-glow transition-colors">
                ⚙️ ตั้งค่าระบบ
              </h3>
              <span className="text-3xl">🔧</span>
            </div>
            <p className="text-gray-400 text-sm">
              ตั้งค่าและกำหนดค่าระบบ
            </p>
          </motion.div>
        </div>
      </div>

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
