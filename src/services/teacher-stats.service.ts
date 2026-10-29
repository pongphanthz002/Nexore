import type { FirebaseConfig } from '@/types/firebase.types';
import { schoolDatabaseService, type SubjectData } from '@/services/school-database.service';
import { teacherDatabaseService, type AttendanceSummary } from '@/services/teacher-database.service';
import { buildGradeSummary, sessionMixes, type GradeSummary, type SubjectStatsInput } from '@/lib/class-stats';
import { defaultGradeConfig } from '@/lib/grade-calculation';
import { runPool } from '@/lib/firestore-helpers';
import { readTeacherStats, writeTeacherStats, TEACHER_STATS_FRESH_MS, TEACHER_STATS_VERSION, type CachedTeacherStats } from '@/lib/teacher-stats-cache';

/**
 * Loads what the teacher home statistics need: each subject's grade summary and attendance
 * summary (2 reads per subject). A subject whose grade or attendance summary is missing or
 * outdated (recorded before summaries existed, or by an older app version) is built once here
 * from its scores or sessions and saved, so every subject shows and later visits are back to
 * 2 reads.
 */

const studentsOf = <T extends { studentId: string; class: string }>(subject: SubjectData, students: T[]) =>
  students.filter(s => (subject.subjectType === 'elective' && subject.studentIds?.length
    ? subject.studentIds.includes(s.studentId)
    : s.class === subject.classroom));

/**
 * A subject's grade summary computed now from its scores (4 reads), with the shared grade
 * calculation. Used to fill missing summaries and by the classroom tools, which need fresh totals.
 */
export async function buildSubjectGradeSummary<T extends { studentId: string; class: string; name: string; number: string }>(
  dbConfig: FirebaseConfig,
  subject: SubjectData,
  students: T[],
): Promise<GradeSummary> {
  const [config, assignments, groups, scores] = await Promise.all([
    teacherDatabaseService.getGradeConfig(dbConfig, subject.subjectId),
    teacherDatabaseService.getAssignments(dbConfig, subject.subjectId, subject.classroom),
    teacherDatabaseService.getAssignmentGroups(dbConfig, subject.subjectId, subject.classroom),
    teacherDatabaseService.getStudentScores(dbConfig, subject.subjectId, subject.classroom),
  ]);
  const roster = studentsOf(subject, students).sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0));
  return buildGradeSummary(
    subject.subjectId, subject.classroom, roster, assignments, groups,
    config || defaultGradeConfig(subject.subjectId), scores,
  );
}

async function buildMissingSummaries(
  schoolConfig: FirebaseConfig,
  dbConfig: FirebaseConfig,
  subjects: SubjectData[],
): Promise<Map<string, GradeSummary>> {
  const built = new Map<string, GradeSummary>();
  if (subjects.length === 0) return built;
  const students = await schoolDatabaseService.getStudentsForSubjects(schoolConfig, subjects);
  await runPool(subjects, 3, async subject => {
    try {
      const summary = await buildSubjectGradeSummary(dbConfig, subject, students);
      await teacherDatabaseService.saveGradeSummary(dbConfig, summary);
      built.set(subject.subjectId, summary);
    } catch (err) {
      // Best effort: the subject shows without scores and is retried next time
      console.error(`Error building grade summary for ${subject.subjectId}:`, err);
    }
  });
  return built;
}

/** Attendance summaries for subjects that have none yet (or an outdated one), from their sessions. */
async function buildMissingAttendance(dbConfig: FirebaseConfig, subjects: SubjectData[]): Promise<Map<string, AttendanceSummary>> {
  const built = new Map<string, AttendanceSummary>();
  await runPool(subjects, 3, async subject => {
    try {
      built.set(subject.subjectId, await teacherDatabaseService.rebuildAttendanceSummary(dbConfig, subject.subjectId));
    } catch (err) {
      // Best effort: the subject shows without attendance and is retried next time
      console.error(`Error building attendance summary for ${subject.subjectId}:`, err);
    }
  });
  return built;
}

export async function loadTeacherStats(
  schoolConfig: FirebaseConfig,
  teacherId: string,
  { force = false }: { force?: boolean } = {},
): Promise<CachedTeacherStats> {
  const owner = `${schoolConfig.projectId}:${teacherId}`;
  if (!force) {
    const cached = readTeacherStats(owner);
    if (cached && Date.now() - cached.savedAt < TEACHER_STATS_FRESH_MS) return cached;
  }

  const [subjects, teacher] = await Promise.all([
    schoolDatabaseService.getSubjectsForTeacher(schoolConfig, teacherId, force),
    schoolDatabaseService.getTeacherConfig(schoolConfig, teacherId),
  ]);
  // A registered teacher without their own project keeps data in the School DB
  const dbConfig = teacher?.firebaseConfig || schoolConfig;

  const summaries = await teacherDatabaseService.getSubjectSummaries(dbConfig, subjects.map(s => s.subjectId));
  const missing = subjects.filter(s => !summaries.get(s.subjectId)?.grades);
  const missingAttendance = subjects.filter(s => !summaries.get(s.subjectId)?.attendance);
  const [built, builtAttendance] = await Promise.all([
    buildMissingSummaries(schoolConfig, dbConfig, missing),
    buildMissingAttendance(dbConfig, missingAttendance),
  ]);

  const inputs: SubjectStatsInput[] = subjects.map(subject => {
    const found = summaries.get(subject.subjectId);
    return {
      subjectId: subject.subjectId,
      subjectName: subject.subjectName,
      classroom: subject.classroom,
      grades: found?.grades ?? built.get(subject.subjectId) ?? null,
      sessions: (() => {
        const attendance = found?.attendance ?? builtAttendance.get(subject.subjectId);
        return attendance ? sessionMixes(attendance) : null;
      })(),
    };
  });

  const result: CachedTeacherStats = { version: TEACHER_STATS_VERSION, owner, savedAt: Date.now(), inputs };
  writeTeacherStats(result);
  return result;
}
