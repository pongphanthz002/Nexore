'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import {
  readTeacherRoster, writeTeacherRoster, TEACHER_ROSTER_FRESH_MS, type TeacherRoster,
} from '@/lib/teacher-roster-cache';

const EMPTY: TeacherRoster = { teacher: null, subjects: [], students: [] };

/**
 * The signed-in teacher's record, subjects and enrolled students for the grades and attendance
 * pages. A cached copy shows at once; it is re-read when older than TEACHER_ROSTER_FRESH_MS
 * (the service's in-memory caches absorb repeat reads within a session).
 */
export function useTeacherRoster(): TeacherRoster & { loading: boolean } {
  const { userAccount } = useAuth();
  const [roster, setRoster] = useState<TeacherRoster>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const config = userAccount?.schoolFirebaseConfig;
    const teacherId = userAccount?.userId;
    if (!config || !teacherId) return;
    const owner = `${config.projectId}:${teacherId}`;
    let cancelled = false;

    const cached = readTeacherRoster(owner);
    if (cached) {
      setRoster({ teacher: cached.teacher, subjects: cached.subjects, students: cached.students });
      setLoading(false);
      if (Date.now() - cached.savedAt < TEACHER_ROSTER_FRESH_MS) return;
    }

    (async () => {
      try {
        // Only this teacher's subjects and the students enrolled in them
        const [subjects, teacher] = await Promise.all([
          schoolDatabaseService.getSubjectsForTeacher(config, teacherId),
          schoolDatabaseService.getTeacherConfig(config, teacherId),
        ]);
        const students = await schoolDatabaseService.getStudentsForSubjects(config, subjects);
        if (cancelled) return;
        const fresh = { teacher, subjects, students };
        setRoster(fresh);
        writeTeacherRoster(owner, fresh);
      } catch (error) {
        // A cached copy stays on screen; without one the page shows its empty state
        console.error('Error loading teacher roster:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userAccount]);

  return { ...roster, loading };
}
