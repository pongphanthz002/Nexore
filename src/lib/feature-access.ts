/**
 * Who sees the extra features (the teacher "เพิ่มเติม" tab, the student "การเรียนรู้" tab).
 * The admin sets each feature to off / everyone / selected people (teachers by ID, students by
 * classroom); the settings live in one School DB doc (`settings/features`). Admins always see
 * everything. Enforced in the app only (see Security Rules in CLAUDE.md).
 */

export type FeatureId = 'classroomTools' | 'learning';
export type FeatureAudience = 'teacher' | 'student';
export type FeatureMode = 'off' | 'all' | 'selected';

export interface FeatureRule {
  mode: FeatureMode;
  /** teacher IDs (teacher features) or classrooms (student features) when `mode` is "selected" */
  ids: string[];
}

export type FeatureSettings = Record<FeatureId, FeatureRule>;

export interface FeatureInfo {
  id: FeatureId;
  audience: FeatureAudience;
  title: string;
  description: string;
}

export const FEATURES: FeatureInfo[] = [
  { id: 'classroomTools', audience: 'teacher', title: 'เครื่องมือสุ่ม', description: 'สุ่มเรียกนักเรียนและจัดกลุ่มคละเก่ง–อ่อน' },
  { id: 'learning', audience: 'student', title: 'การเรียนรู้', description: 'แท็บการเรียนรู้ของนักเรียน (กำลังพัฒนา)' },
];

/** Before the admin saves anything: teacher features on for everyone, student features off. */
export const DEFAULT_FEATURE_SETTINGS: FeatureSettings = {
  classroomTools: { mode: 'all', ids: [] },
  learning: { mode: 'off', ids: [] },
};

const MODES: FeatureMode[] = ['off', 'all', 'selected'];

/** Fills in features missing from a stored doc (older docs, new features) and drops junk. */
export function withFeatureDefaults(stored: unknown): FeatureSettings {
  const raw = (stored && typeof stored === 'object' ? stored : {}) as Record<string, Partial<FeatureRule> | undefined>;
  const out = {} as FeatureSettings;
  for (const f of FEATURES) {
    const rule = raw[f.id];
    out[f.id] = rule && MODES.includes(rule.mode as FeatureMode)
      ? { mode: rule.mode as FeatureMode, ids: Array.isArray(rule.ids) ? rule.ids.map(String) : [] }
      : { ...DEFAULT_FEATURE_SETTINGS[f.id], ids: [] };
  }
  return out;
}

export interface FeatureViewer {
  role: 'admin' | 'teacher' | 'student' | string;
  /** teacher ID (teachers and admins) */
  teacherId?: string;
  /** the student's classroom */
  classroom?: string;
}

export function canUseFeature(settings: FeatureSettings, id: FeatureId, viewer: FeatureViewer): boolean {
  if (viewer.role === 'admin') return true;
  const info = FEATURES.find(f => f.id === id);
  if (!info || viewer.role !== info.audience) return false;
  const rule = settings[id];
  if (rule.mode === 'all') return true;
  if (rule.mode === 'off') return false;
  const key = info.audience === 'teacher' ? viewer.teacherId : viewer.classroom;
  return !!key && rule.ids.includes(key);
}

export const featuresFor = (audience: FeatureAudience) => FEATURES.filter(f => f.audience === audience);

/** "ม.1/2" → "ม.1"; rooms without a slash keep their whole name. */
export const classLevel = (classroom: string) => classroom.split('/')[0].trim();
