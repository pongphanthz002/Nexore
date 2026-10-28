'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { loadTeacherStats } from '@/services/teacher-stats.service';
import { readTeacherStats, TEACHER_STATS_FRESH_MS } from '@/lib/teacher-stats-cache';
import { computeTeacherStats, type SubjectStatsInput } from '@/lib/class-stats';
import { ATTENDANCE_THRESHOLD } from '@/lib/attendance';
import { allowAction } from '@/lib/firestore-helpers';
import { buildHueMap, hueColor, roomLabel } from '@/lib/timetable';
import {
  Bar, CARD, ChartCard, ColumnChart, META, MIX_COLORS, Podium, RankBars, StackedBar, StatTile, fmt,
} from './charts';

/**
 * Teacher home statistics: KPIs, the top three, grade spread, most pending work, most absences,
 * attendance mix and a per-subject (or per-assignment) comparison, for all subjects or one.
 * Data: two summary documents per subject, cached in localStorage for 10 minutes (see
 * loadTeacherStats); the refresh button forces a re-read.
 */

const COLORS = {
  score: { light: '#2563eb', dark: '#3b82f6' },
  pending: { light: '#d97706', dark: '#f59e0b' },
  absent: { light: MIX_COLORS.absent.light, dark: MIX_COLORS.absent.dark },
};

const subjectKey = (s: SubjectStatsInput) => s.subjectId;
const subjectLabel = (s: { subjectName: string; classroom: string }) => `${s.subjectName} · ${roomLabel(s.classroom)}`;

export default function TeacherStats() {
  const { userAccount } = useAuth();
  const [inputs, setInputs] = useState<SubjectStatsInput[] | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const schoolConfig = userAccount?.schoolFirebaseConfig;
  const teacherId = userAccount?.userId;

  const load = useCallback(async (force: boolean) => {
    if (!schoolConfig || !teacherId) return;
    setRefreshing(true);
    try {
      const result = await loadTeacherStats(schoolConfig, teacherId, { force });
      setInputs(result.inputs);
      setSavedAt(result.savedAt);
      setFailed(false);
    } catch (err) {
      console.error('Error loading teacher statistics:', err);
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, [schoolConfig, teacherId]);

  useEffect(() => {
    if (!schoolConfig || !teacherId) return;
    // Show the last numbers at once, then re-read only if they are older than 10 minutes
    const cached = readTeacherStats(`${schoolConfig.projectId}:${teacherId}`);
    if (cached) {
      setInputs(cached.inputs);
      setSavedAt(cached.savedAt);
    }
    if (!cached || Date.now() - cached.savedAt >= TEACHER_STATS_FRESH_MS) load(false);
  }, [schoolConfig, teacherId, load]);

  const refresh = () => {
    if (refreshing || !allowAction('teacher-stats-refresh', 10_000)) return;
    load(true);
  };

  if (!inputs) {
    if (failed) {
      return (
        <section className={`${CARD} p-5`}>
          <p className="font-medium">โหลดสถิติไม่สำเร็จ</p>
          <button type="button" onClick={() => load(true)} className="mt-3 h-11 rounded-xl bg-gray-100 px-4 font-semibold dark:bg-gray-700">ลองอีกครั้ง</button>
        </section>
      );
    }
    return (
      <div className="space-y-4" aria-label="กำลังโหลดสถิติ">
        <div className="h-7 w-40 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-28 animate-pulse rounded-[22px] bg-white dark:bg-gray-800" />)}
        </div>
        <div className="h-64 animate-pulse rounded-[22px] bg-white dark:bg-gray-800" />
      </div>
    );
  }
  if (inputs.length === 0) return null;

  return <TeacherStatsView inputs={inputs} savedAt={savedAt} refreshing={refreshing} onRefresh={refresh} />;
}

/** The statistics for already-loaded summaries (also used by the dev preview). */
export function TeacherStatsView({ inputs, savedAt, refreshing, onRefresh }: {
  inputs: SubjectStatsInput[];
  savedAt: number | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { isDark } = useTheme();
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const hues = useMemo(() => buildHueMap(inputs), [inputs]);
  const stats = useMemo(() => computeTeacherStats(inputs, subjectId), [inputs, subjectId]);
  const selected = inputs.find(s => s.subjectId === subjectId) ?? null;
  const c = (pair: { light: string; dark: string }) => (isDark ? pair.dark : pair.light);

  const empty = !stats.hasScores && !stats.hasAttendance;
  const scoreUnit = subjectId ? 'คะแนน' : 'คะแนนเฉลี่ย';

  return (
    <section className={`space-y-4 transition-opacity ${refreshing && savedAt ? 'opacity-70' : ''}`} aria-labelledby="teacher-stats-title">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="teacher-stats-title" className="text-2xl font-semibold text-gray-900 dark:text-gray-50">สถิติห้องเรียน</h2>
          {savedAt && (
            <p className={`text-[13px] ${META}`}>
              อัปเดต {new Date(savedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="โหลดสถิติใหม่"
          className="grid h-11 w-11 place-items-center rounded-full text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* One filter row scopes everything below */}
      {inputs.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="เลือกวิชา">
          {[null, ...inputs].map(s => {
            const id = s ? subjectKey(s) : null;
            const active = subjectId === id;
            return (
              <button
                key={id ?? 'all'}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSubjectId(id)}
                className={`flex h-10 flex-none items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                    : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700'
                }`}
              >
                {s && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hueColor(hues.get(s.subjectName) ?? 'blue') }} />}
                {s ? subjectLabel(s) : 'ทุกวิชา'}
              </button>
            );
          })}
        </div>
      )}

      {empty ? (
        <div className={`${CARD} p-6 text-center`}>
          <p className="font-medium">ยังไม่มีข้อมูลสถิติ{selected ? `ของ ${subjectLabel(selected)}` : ''}</p>
          <p className={`mt-1 text-sm ${META}`}>เมื่อเริ่มกรอกคะแนนหรือเช็คชื่อ สถิติจะแสดงที่นี่</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="นักเรียน" value={stats.studentCount.toLocaleString()} unit="คน" note={subjectId ? undefined : `${inputs.length} วิชา`} />
            <StatTile
              label={subjectId ? 'คะแนนเฉลี่ยห้อง' : 'คะแนนเฉลี่ย'}
              value={stats.averageTotal === null ? '–' : fmt(stats.averageTotal)}
              unit="/ 100"
              note={stats.gradePointAverage === null ? 'ยังไม่มีคะแนน' : `เกรดเฉลี่ย ${stats.gradePointAverage.toFixed(2)}`}
            />
            <StatTile
              label="งานค้างทั้งหมด"
              value={stats.pendingTotal.toLocaleString()}
              unit="งาน"
              note={stats.studentsWithPending > 0 ? `${stats.studentsWithPending} คนยังค้างงาน` : 'ส่งครบทุกคน'}
            />
            <StatTile
              label="เข้าเรียนเฉลี่ย"
              value={stats.attendanceRate === null ? '–' : `${fmt(stats.attendanceRate)}%`}
              tone={stats.attendanceRate !== null && stats.attendanceRate < ATTENDANCE_THRESHOLD ? 'alert' : 'default'}
              note={stats.attendanceRate === null ? 'ยังไม่มีการเช็คชื่อ' : stats.belowThreshold > 0 ? `${stats.belowThreshold} คนต่ำกว่า ${ATTENDANCE_THRESHOLD}%` : `ทุกคนผ่านเกณฑ์ ${ATTENDANCE_THRESHOLD}%`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <ChartCard title="คะแนนสูงสุด" note={subjectId ? 'คะแนนรวมในวิชานี้' : 'คะแนนรวมเฉลี่ยทุกวิชาที่เรียนกับครู'} className="lg:col-span-5">
              <Podium
                empty="ยังไม่มีคะแนน"
                items={stats.podium.map(s => ({
                  id: s.studentId,
                  name: s.name,
                  sub: `${roomLabel(s.classroom)}${s.number ? ` · เลขที่ ${s.number}` : ''}`,
                  value: fmt(s.total ?? 0),
                  note: s.grade ? `เกรด ${s.grade}` : 'คะแนนเฉลี่ย',
                }))}
              />
            </ChartCard>

            <ChartCard
              title="การกระจายเกรด"
              note={subjectId ? 'จำนวนนักเรียนในแต่ละเกรด' : 'จำนวนผลการเรียน (นักเรียน × วิชา) ในแต่ละเกรด'}
              className="lg:col-span-7"
            >
              {stats.hasScores ? (
                <ColumnChart
                  data={stats.grades.map(g => ({ label: g.label, value: g.count }))}
                  color={c(COLORS.score)}
                  emphasis={{ label: '0', color: c(COLORS.absent) }}
                  height={176}
                />
              ) : (
                <p className={`py-10 text-center text-sm ${META}`}>ยังไม่มีคะแนน</p>
              )}
            </ChartCard>

            <ChartCard title="งานค้างมากที่สุด" note="จำนวนงานที่ยังไม่มีคะแนน" className="lg:col-span-6">
              <RankBars
                color={c(COLORS.pending)}
                empty="ไม่มีงานค้าง"
                items={stats.mostPending.map(s => ({
                  id: s.studentId,
                  label: s.name,
                  sub: `${roomLabel(s.classroom)}${s.number ? ` · เลขที่ ${s.number}` : ''}`,
                  value: s.pending,
                  valueLabel: `${s.pending} งาน`,
                }))}
              />
            </ChartCard>

            <ChartCard title="ขาดเรียนมากที่สุด" note="ชั่วโมงที่ขาดหรือหนีเรียน" className="lg:col-span-6">
              <RankBars
                color={c(COLORS.absent)}
                empty="ยังไม่มีใครขาดเรียน"
                items={stats.mostAbsent.map(s => ({
                  id: s.studentId,
                  label: s.name,
                  sub: `${roomLabel(s.classroom)}${s.number ? ` · เลขที่ ${s.number}` : ''}`,
                  value: s.hours.absent,
                  valueLabel: `${fmt(s.hours.absent)} ชม.`,
                  note: s.rate === null ? undefined : `เข้าเรียน ${fmt(s.rate)}%`,
                }))}
              />
            </ChartCard>

            <ChartCard title="สัดส่วนเวลาเรียน" note="รวมทุกคาบที่เช็คชื่อแล้ว (ชั่วโมง)" className="lg:col-span-5">
              {stats.hasAttendance ? (
                <StackedBar
                  isDark={isDark}
                  segments={(['present', 'leave', 'absent'] as const).map(key => ({
                    key, label: MIX_COLORS[key].label, value: stats.attendanceMix[key], color: MIX_COLORS[key],
                  }))}
                />
              ) : (
                <p className={`py-6 text-center text-sm ${META}`}>ยังไม่มีการเช็คชื่อ</p>
              )}
            </ChartCard>

            {subjectId ? (
              <ChartCard title="งานที่ส่งน้อยที่สุด" note="สัดส่วนนักเรียนที่มีคะแนนแล้ว" className="lg:col-span-7">
                {stats.assignments.length === 0 ? (
                  <p className={`py-6 text-center text-sm ${META}`}>ยังไม่มีชิ้นงาน</p>
                ) : (
                  <ul className="space-y-3.5">
                    {stats.assignments.slice(0, 6).map((a, i) => (
                      <li key={a.id}>
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="min-w-0 truncate font-medium">{a.title}</p>
                          <p className="flex-none tabular-nums">
                            <span className="font-semibold">{a.rate}%</span>
                            <span className={`text-[13px] ${META}`}> · {a.submitted}/{a.students} คน</span>
                          </p>
                        </div>
                        <Bar ratio={a.rate / 100} color={hueColor(hues.get(selected?.subjectName ?? '') ?? 'blue')} className="mt-1.5 h-1.5" delay={i * 0.05} />
                      </li>
                    ))}
                  </ul>
                )}
              </ChartCard>
            ) : (
              <ChartCard title="เทียบรายวิชา" note={`แถบคือคะแนนเฉลี่ยของห้อง (เต็ม 100)`} className="lg:col-span-7">
                <ul className="space-y-3.5">
                  {stats.subjects.map((s, i) => (
                    <li key={s.subjectId}>
                      <button
                        type="button"
                        onClick={() => setSubjectId(s.subjectId)}
                        className="-mx-2 w-[calc(100%+1rem)] rounded-xl px-2 py-1 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="min-w-0 truncate font-medium">{subjectLabel(s)}</p>
                          <p className="flex-none tabular-nums">
                            <span className="font-semibold">{s.averageTotal === null ? '–' : fmt(s.averageTotal)}</span>
                            <span className={`text-[13px] ${META}`}> {scoreUnit}</span>
                          </p>
                        </div>
                        <div className={`flex justify-between gap-3 text-[13px] ${META}`}>
                          <span>{s.students} คน{s.pending > 0 ? ` · ค้าง ${s.pending} งาน` : ''}</span>
                          <span>{s.attendanceRate === null ? 'ยังไม่เช็คชื่อ' : `เข้าเรียน ${fmt(s.attendanceRate)}%`}</span>
                        </div>
                        <Bar ratio={(s.averageTotal ?? 0) / 100} color={hueColor(hues.get(s.subjectName) ?? 'blue')} className="mt-1.5 h-1.5" delay={i * 0.05} />
                      </button>
                    </li>
                  ))}
                </ul>
              </ChartCard>
            )}
          </div>
        </>
      )}
    </section>
  );
}
