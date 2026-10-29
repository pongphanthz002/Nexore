import type { FirebaseConfig } from '@/types/firebase.types';
import { schoolDatabaseService, type SubjectData } from '@/services/school-database.service';
import { teacherDatabaseService } from '@/services/teacher-database.service';
import { buildGradeSummary, sessionMixes, type GradeSummary, type SubjectStatsInput } from '@/lib/class-stats';
import { defaultGradeConfig } from '@/lib/grade-calculation';
import { runPool } from '@/lib/firestore-helpers';
import { readTeacherStats, writeTeacherStats, TEACHER_STATS_FRESH_MS, TEACHER_STATS_VERSION, type CachedTeacherStats } from '@/lib/teacher-stats-cache';

/**
 * Loads what the teacher home statistics need: each subject's grade summary and attendance
 * summary (2 reads per subject). A subject whose grade summary doesn't exist yet (the grades
 * page hasn't been opened since summaries were added) is built once from its scores here and
 * saved, so later visits are back to 2 reads.
 */

const studentsOf = <T extends { studentId: string; class: string }>(subject: SubjectData, students: T[]) =>
  students.filter(s => (subject.subjectType === 'elective' && subject.studentIds?.length
    ? subject.studentIds.includes(s.studentId)
    : s.class === subject.classroom));

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
      const [config, assignments, groups, scores] = await Promise.all([
        teacherDatabaseService.getGradeConfig(dbConfig, subject.subjectId),
        teacherDatabaseService.getAssignments(dbConfig, subject.subjectId, subject.classroom),
        teacherDatabaseService.getAssignmentGroups(dbConfig, subject.subjectId, subject.classroom),
        teacherDatabaseService.getStudentScores(dbConfig, subject.subjectId, subject.classroom),
      ]);
      const roster = studentsOf(subject, students).sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0));
      const summary = buildGradeSummary(
        subject.subjectId, subject.classroom, roster, assignments, groups,
        config || defaultGradeConfig(subject.subjectId), scores,
      );
      await teacherDatabaseService.saveGradeSummary(dbConfig, summary);
      built.set(subject.subjectId, summary);
    } catch (err) {
      // Best effort: the subject shows without scores and is retried next time
      console.error(`Error building grade summary for ${subject.subjectId}:`, err);
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
  const built = await buildMissingSummaries(schoolConfig, dbConfig, missing);

  const inputs: SubjectStatsInput[] = subjects.map(subject => {
    const found = summaries.get(subject.subjectId);
    return {
      subjectId: subject.subjectId,
      subjectName: subject.subjectName,
      classroom: subject.classroom,
      grades: found?.grades ?? built.get(subject.subjectId) ?? null,
      sessions: found?.attendance ? sessionMixes(found.attendance) : null,
    };
  });

  const result: CachedTeacherStats = { version: TEACHER_STATS_VERSION, owner, savedAt: Date.now(), inputs };
  writeTeacherStats(result);
  return result;
}
