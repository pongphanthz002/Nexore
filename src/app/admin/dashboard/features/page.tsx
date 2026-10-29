'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService, type StudentData, type TeacherFirebaseConfig } from '@/services/school-database.service';
import { featureSettingsService } from '@/services/feature-settings.service';
import {
  FEATURES, classLevel, featuresFor, withFeatureDefaults,
  type FeatureAudience, type FeatureInfo, type FeatureMode, type FeatureRule, type FeatureSettings,
} from '@/lib/feature-access';
import { AdminPageHeader, SearchWell } from '@/components/admin/AdminUI';
import { Segmented } from '@/components/classroom/controls';
import Avatar from '@/components/Avatar';
import { toast } from '@/components/Toast';
import { SkeletonCard, SkeletonGroup } from '@/components/Skeleton';

/**
 * Admin: who sees each extra feature. Teacher features open to every teacher or chosen teachers;
 * student features to every student or chosen classrooms. One School DB doc; devices pick up a
 * change within 10 minutes (see feature-settings.service).
 */

const MODE_OPTIONS = [['off', 'ปิด'], ['all', 'ทุกคน'], ['selected', 'เฉพาะที่เลือก']] as const;

const sameRules = (a: FeatureSettings, b: FeatureSettings) => FEATURES.every(f =>
  a[f.id].mode === b[f.id].mode && [...a[f.id].ids].sort().join('|') === [...b[f.id].ids].sort().join('|'));

function TeacherChooser({ teachers, ids, onChange }: { teachers: TeacherFirebaseConfig[]; ids: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState('');
  const chosen = new Set(ids);
  const q = query.trim().toLowerCase();
  const list = teachers.filter(t => !q || t.name.toLowerCase().includes(q) || t.teacherId.toLowerCase().includes(q));
  return (
    <div>
      <SearchWell value={query} onChange={setQuery} placeholder="ค้นหาชื่อหรือรหัสครู" />
      <ul className="max-h-[22rem] space-y-2 overflow-y-auto overscroll-contain p-1">
        {list.map(t => {
          const on = chosen.has(t.teacherId);
          return (
            <li key={t.teacherId}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onChange(on ? ids.filter(id => id !== t.teacherId) : [...ids, t.teacherId])}
                className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-shadow ${on ? 'shadow-neu-in-sm' : 'bg-surface shadow-neu-sm'}`}
              >
                <Avatar src={t.photoURL} name={t.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{t.name}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    {t.teacherId}
                    {!t.uid && <span className="rounded-full px-2 py-px font-medium shadow-neu-in-xs">ยังไม่ลงทะเบียน</span>}
                  </span>
                </span>
                <span className={`grid h-6 w-6 flex-none place-items-center rounded-lg ${on ? 'bg-red-600 text-white' : 'shadow-neu-in-xs'}`}>
                  {on && <Check size={16} strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="p-4 text-center text-sm text-gray-500">ไม่พบครู</li>}
      </ul>
    </div>
  );
}

function ClassroomChooser({ classrooms, ids, onChange }: { classrooms: string[]; ids: string[]; onChange: (ids: string[]) => void }) {
  const chosen = new Set(ids);
  const levels = useMemo(() => {
    const by = new Map<string, string[]>();
    classrooms.forEach(c => { const l = classLevel(c); by.set(l, [...(by.get(l) ?? []), c]); });
    return Array.from(by.entries()).sort((a, b) => a[0].localeCompare(b[0], 'th', { numeric: true }));
  }, [classrooms]);
  return (
    <div className="space-y-4">
      {levels.map(([level, rooms]) => {
        const all = rooms.every(r => chosen.has(r));
        return (
          <div key={level}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">{level}</span>
              <button
                type="button"
                onClick={() => onChange(all ? ids.filter(id => !rooms.includes(id)) : Array.from(new Set([...ids, ...rooms])))}
                className="rounded-full px-3 py-1 text-xs font-semibold text-gray-700 shadow-neu-sm active:shadow-neu-in-sm dark:text-gray-200"
              >
                {all ? 'เอาออกทั้งระดับ' : 'ทั้งระดับ'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {rooms.map(room => {
                const on = chosen.has(room);
                return (
                  <button
                    key={room}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => onChange(on ? ids.filter(id => id !== room) : [...ids, room])}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold tabular-nums transition-shadow ${
                      on ? 'text-red-700 shadow-neu-in-sm dark:text-red-400' : 'bg-surface text-gray-700 shadow-neu-sm dark:text-gray-200'
                    }`}
                  >
                    {on && <Check size={14} strokeWidth={3} />}
                    {room}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {levels.length === 0 && <p className="text-sm text-gray-500">ยังไม่มีห้องเรียน</p>}
    </div>
  );
}

function FeatureCard({ info, rule, onChange, teachers, classrooms }: {
  info: FeatureInfo;
  rule: FeatureRule;
  onChange: (rule: FeatureRule) => void;
  teachers: TeacherFirebaseConfig[];
  classrooms: string[];
}) {
  const reduce = useReducedMotion();
  const who = info.audience === 'teacher' ? 'ครู' : 'นักเรียน';
  const summary = rule.mode === 'off'
    ? 'ไม่มีใครเห็น'
    : rule.mode === 'all'
      ? `${who}ทุกคนเห็น`
      : rule.ids.length === 0
        ? 'ยังไม่ได้เลือก (เท่ากับปิด)'
        : info.audience === 'teacher' ? `ครู ${rule.ids.length} คน` : `${rule.ids.length} ห้อง`;
  return (
    <section className="rounded-[24px] bg-surface p-5 shadow-neu-lg">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-bold leading-tight">{info.title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{info.description}</p>
          <p className={`mt-1 text-sm font-semibold ${rule.mode === 'off' || (rule.mode === 'selected' && !rule.ids.length) ? 'text-gray-500' : 'text-emerald-700 dark:text-emerald-400'}`}>{summary}</p>
        </div>
        <Segmented
          label={`ใครเห็น${info.title}`}
          value={rule.mode}
          options={MODE_OPTIONS}
          onChange={(mode: FeatureMode) => onChange({ ...rule, mode })}
          className="md:w-[22rem]"
        />
      </div>
      <AnimatePresence initial={false}>
        {rule.mode === 'selected' && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="pt-5">
              {info.audience === 'teacher'
                ? <TeacherChooser teachers={teachers} ids={rule.ids} onChange={ids => onChange({ ...rule, ids })} />
                : <ClassroomChooser classrooms={classrooms} ids={rule.ids} onChange={ids => onChange({ ...rule, ids })} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export default function AdminFeaturesPage() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { userAccount } = useAuth();
  const config = userAccount?.schoolFirebaseConfig;
  const [saved, setSaved] = useState<FeatureSettings | null>(null);
  const [draft, setDraft] = useState<FeatureSettings | null>(null);
  const [teachers, setTeachers] = useState<TeacherFirebaseConfig[]>([]);
  const [students, setStudents] = useState<StudentData[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    Promise.all([
      featureSettingsService.get(config, { force: true }),
      schoolDatabaseService.getAllTeachers(config),
      schoolDatabaseService.getAllStudents(config),
    ]).then(([settings, t, s]) => {
      if (cancelled) return;
      setSaved(settings);
      setDraft(settings);
      setTeachers([...t].sort((a, b) => a.name.localeCompare(b.name, 'th')));
      setStudents(s);
    }).catch(err => {
      console.error('Error loading feature settings page:', err);
      toast.error('โหลดข้อมูลไม่สำเร็จ');
    });
    return () => { cancelled = true; };
  }, [config]);

  const classrooms = useMemo(
    () => Array.from(new Set(students.map(s => s.class).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th', { numeric: true })),
    [students],
  );

  const dirty = !!saved && !!draft && !sameRules(saved, draft);

  const save = async () => {
    if (!config || !draft) return;
    setSaving(true);
    try {
      const clean = withFeatureDefaults(draft);
      await featureSettingsService.save(config, clean);
      setSaved(clean);
      setDraft(clean);
      toast.success('บันทึกแล้ว มีผลบนเครื่องผู้ใช้ภายใน 10 นาที');
    } catch (err) {
      console.error('Error saving feature settings:', err);
      toast.error('บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const section = (audience: FeatureAudience, title: string) => (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400">{title}</h2>
      {featuresFor(audience).map(info => (
        <FeatureCard
          key={info.id}
          info={info}
          rule={draft![info.id]}
          onChange={rule => setDraft(d => d && { ...d, [info.id]: rule })}
          teachers={teachers}
          classrooms={classrooms}
        />
      ))}
    </div>
  );

  return (
    <div className="px-4 pb-40 pt-2 text-gray-900 sm:px-6 dark:text-gray-50">
      <div className="mx-auto max-w-5xl">
        <AdminPageHeader
          title="ระบบเพิ่มเติม"
          subtitle="เลือกว่าใครเห็นระบบใดบ้าง · มีผลบนเครื่องผู้ใช้ภายใน 10 นาที"
          onBack={() => router.push('/admin/dashboard')}
        />
        {!draft ? (
          <SkeletonGroup label="กำลังโหลดการตั้งค่า" className="space-y-4">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </SkeletonGroup>
        ) : (
          <div className="space-y-8">
            {section('teacher', 'ระบบครู')}
            {section('student', 'ระบบนักเรียน')}
            <p className="text-xs text-gray-500 dark:text-gray-400">แอดมินเห็นทุกระบบเสมอ เพื่อให้ลองใช้ก่อนเปิดให้ผู้อื่น</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { y: 100 }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: 100 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(12px,env(safe-area-inset-bottom))]"
          >
            <div className="mx-auto flex max-w-5xl items-center gap-3 rounded-[24px] bg-surface p-3 pl-5 shadow-neu-lg">
              <span className="flex-1 text-sm font-medium">มีการเปลี่ยนแปลงที่ยังไม่บันทึก</span>
              <button
                type="button"
                onClick={() => setDraft(saved)}
                disabled={saving}
                className="h-11 rounded-xl bg-surface px-4 text-sm font-semibold shadow-neu-sm active:shadow-neu-in-sm disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="flex h-11 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white shadow-neu-sm hover:bg-red-700 disabled:opacity-60"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                บันทึก
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
