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
  // Legacy keys used by storage.service.ts
  USER_IDENTITY: 'nexore_user_identity',
  MASTER_REGISTRY_CONFIG: 'nexore_master_registry_config',
  SCHOOL_QR_CODE: 'nexore_school_qr_code',
  TEACHER_NODES: 'nexore_teacher_nodes',
  STUDENT_DATA: 'nexore_student_data',
} as const;
