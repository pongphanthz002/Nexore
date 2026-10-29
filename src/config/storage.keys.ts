/**
 * All localStorage keys used by Nexore.
 * Values are kept identical to the historical strings so existing caches keep working.
 */
export const STORAGE_KEYS = {
  USER_ACCOUNT: 'NEXORE_USER_ACCOUNT',
  USER_ACCOUNT_TIMESTAMP: 'NEXORE_USER_ACCOUNT_TIMESTAMP',
  /** Prefix for per-school hub config cache: `${HUB_PREFIX}${schoolId}` */
  HUB_PREFIX: 'NEXORE_HUB_',
  TODAY_ATTENDANCE: 'NEXORE_TODAY_ATTENDANCE',
  THEME: 'nexore-theme',
  /** Teacher home statistics (per-subject summaries), see src/lib/teacher-stats-cache.ts */
  TEACHER_STATS: 'NEXORE_TEACHER_STATS',
  /** Teacher's record, subjects and students for the grades/attendance pages, see src/lib/teacher-roster-cache.ts */
  TEACHER_ROSTER: 'NEXORE_TEACHER_ROSTER',
  /** Admin's feature visibility settings (School DB settings/features), see src/services/feature-settings.service.ts */
  FEATURE_SETTINGS: 'NEXORE_FEATURE_SETTINGS',
  /** Classroom tools: last groups and who has been called, per room, see src/lib/classroom-tools-store.ts */
  CLASSROOM_TOOLS: 'NEXORE_CLASSROOM_TOOLS',
  // Legacy keys used by storage.service.ts
  USER_IDENTITY: 'nexore_user_identity',
  MASTER_REGISTRY_CONFIG: 'nexore_master_registry_config',
  SCHOOL_QR_CODE: 'nexore_school_qr_code',
  TEACHER_NODES: 'nexore_teacher_nodes',
  STUDENT_DATA: 'nexore_student_data',
} as const;
