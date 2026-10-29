'use client';

import { useRouter } from 'next/navigation';
import { storageService } from '@/services/storage.service';
import { firestoreService } from '@/services/firestore.service';
import { schoolDatabaseService } from '@/services/school-database.service';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Book, Check, ChevronRight, Copy, GraduationCap, Users } from 'lucide-react';
import SchoolDangerZone from '@/components/admin/SchoolDangerZone';

export default function AdminDashboard() {
  const router = useRouter();
  const { userAccount } = useAuth();
  const [stats, setStats] = useState({ students: 0, teachers: 0, nodes: 0, signedUpStudents: 0, signedUpTeachers: 0 });
  const [schoolId, setSchoolId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const lastLoadedSchoolIdRef = useRef<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        let schoolFirebaseConfig = null;
        let currentSchoolId = '';

        // Try to get from userAccount first (new system)
        if (userAccount && userAccount.role === 'admin') {
          schoolFirebaseConfig = userAccount.schoolFirebaseConfig;
          currentSchoolId = userAccount.schoolId;
        } else {
          // Fallback to localStorage (old system)
          const config = await storageService.getMasterRegistryConfig();
          if (config && config.schoolProjectId) {
            const hub = await firestoreService.getHub(config.schoolProjectId);
            if (hub && hub.schoolFirebaseConfig) {
              schoolFirebaseConfig = hub.schoolFirebaseConfig;
            }
            currentSchoolId = config.schoolProjectId;
          }
        }

        // Skip if same schoolId already loaded
        if (currentSchoolId && currentSchoolId === lastLoadedSchoolIdRef.current) {
          return;
        }

        if (schoolFirebaseConfig) {
          setLoading(true);
          const [teachers, students] = await Promise.all([
            schoolDatabaseService.getAllTeachersOptimized(schoolFirebaseConfig),
            schoolDatabaseService.getAllStudentsOptimized(schoolFirebaseConfig)
          ]);
          
          const signedUpTeachers = teachers.filter(t => t.uid).length;
          const signedUpStudents = students.filter(s => s.uid).length;
          
          setStats({
            students: students.length,
            teachers: teachers.length,
            nodes: signedUpTeachers,
            signedUpStudents,
            signedUpTeachers,
          });
          lastLoadedSchoolIdRef.current = currentSchoolId;
        }

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
    if (!schoolId) return;
    navigator.clipboard.writeText(schoolId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tiles = [
    { href: '/admin/dashboard/users/teachers', icon: Users, title: 'ครู', total: stats.teachers, registered: stats.signedUpTeachers },
    { href: '/admin/dashboard/users/students', icon: GraduationCap, title: 'นักเรียน', total: stats.students, registered: stats.signedUpStudents },
    { href: '/admin/dashboard/users/subjects', icon: Book, title: 'วิชาเรียน', hint: 'รายวิชาและตารางสอนของครู' },
  ];

  return (
    <div className="px-4 pb-16 pt-2 text-gray-900 sm:px-6 dark:text-gray-50">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">ภาพรวมโรงเรียน</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">ข้อมูลครู นักเรียน และวิชาเรียน</p>
          </div>
          {schoolId && (
            <button
              type="button"
              onClick={handleCopySchoolId}
              title="คัดลอก School ID"
              className="flex h-10 items-center gap-2 rounded-xl bg-surface pl-3 pr-2 text-sm shadow-neu-sm active:shadow-neu-in-sm"
            >
              <span className="text-gray-500 dark:text-gray-400">School ID</span>
              <span className="font-mono font-semibold">{schoolId}</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg shadow-neu-in-xs">
                {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
              </span>
            </button>
          )}
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {tiles.map(tile => {
            const Icon = tile.icon;
            const share = tile.total ? (tile.registered ?? 0) / tile.total : 0;
            return (
              <button
                key={tile.href}
                type="button"
                onClick={() => router.push(tile.href)}
                className="flex flex-col rounded-2xl bg-surface p-5 text-left shadow-neu transition-shadow active:shadow-neu-in-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl text-red-600 shadow-neu-in-sm dark:text-red-400">
                    <Icon size={22} />
                  </span>
                  <span className="flex-1 text-lg font-bold">{tile.title}</span>
                  <ChevronRight size={18} className="text-gray-400" />
                </div>
                {tile.total !== undefined ? (
                  loading ? (
                    <div className="mt-5 h-[60px] animate-pulse rounded-xl bg-gray-300/40 dark:bg-white/10" />
                  ) : (
                    <>
                      <div className="mt-5 flex items-baseline gap-1.5">
                        <span className="text-3xl font-bold tabular-nums">{tile.total.toLocaleString('th-TH')}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">คน</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full shadow-neu-in-xs">
                        <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${share * 100}%` }} />
                      </div>
                      <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                        ลงทะเบียนแล้ว {(tile.registered ?? 0).toLocaleString('th-TH')} คน ({Math.round(share * 100)}%)
                      </div>
                    </>
                  )
                ) : (
                  <p className="mt-5 text-sm text-gray-500 dark:text-gray-400">{tile.hint}</p>
                )}
              </button>
            );
          })}
        </div>

        <SchoolDangerZone />
      </div>
    </div>
  );
}
