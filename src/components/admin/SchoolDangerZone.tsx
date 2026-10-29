'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { schoolDatabaseService } from '@/services/school-database.service';
import { firestoreService } from '@/services/firestore.service';
import Modal, { ModalHeader } from '@/components/Modal';

type Action = 'reset' | 'delete';

const COPY: Record<Action, { title: string; warning: string; confirm: string }> = {
  reset: {
    title: 'รีเซ็ตข้อมูลโรงเรียน',
    warning: 'ลบครู นักเรียน วิชาเรียน และฐานข้อมูลของครูทุกคน รวมถึงบัญชีผู้ใช้ของครูและนักเรียน โรงเรียนและบัญชีผู้ดูแลยังอยู่',
    confirm: 'รีเซ็ตข้อมูล',
  },
  delete: {
    title: 'ลบโรงเรียนออกจากระบบ',
    warning: 'ลบข้อมูลทั้งหมดของโรงเรียน รวมถึงบัญชีผู้ดูแลระบบ แล้วออกจากระบบทันที กู้คืนไม่ได้',
    confirm: 'ลบโรงเรียน',
  },
};

/**
 * Admin home's danger zone: reset the school's data, or delete the school. Both ask the admin
 * to type the school ID first.
 */
export default function SchoolDangerZone() {
  const router = useRouter();
  const { userAccount, invalidateCache, signOut } = useAuth();
  const [action, setAction] = useState<Action | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const schoolName = userAccount?.schoolId || 'โรงเรียน';

  const close = () => { if (!busy) { setAction(null); setTyped(''); } };

  const accountEmails = async () => {
    const config = userAccount!.schoolFirebaseConfig;
    const [teachers, students] = await Promise.all([
      schoolDatabaseService.getAllTeachers(config),
      schoolDatabaseService.getAllStudents(config),
    ]);
    return {
      teacherEmails: teachers.map(t => t.email).filter((e): e is string => !!e),
      studentEmails: students.map(s => s.email).filter((e): e is string => !!e),
    };
  };

  const handleReset = async () => {
    if (!userAccount?.schoolFirebaseConfig) return;
    setBusy(true);
    try {
      const { teacherEmails, studentEmails } = await accountEmails();
      await schoolDatabaseService.deleteAllTeacherDatabases(userAccount.schoolFirebaseConfig);
      await schoolDatabaseService.deleteAllSchoolData(userAccount.schoolFirebaseConfig);
      await schoolDatabaseService.deleteAllUserAccountsFromMasterRegistry(teacherEmails, studentEmails);
      invalidateCache();
      alert('รีเซ็ตข้อมูลสำเร็จ');
      setAction(null);
      setTyped('');
    } catch (error) {
      console.error('Error resetting data:', error);
      alert('ไม่สามารถรีเซ็ตข้อมูลได้');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!userAccount?.schoolId || !userAccount?.schoolFirebaseConfig) return;
    setBusy(true);
    try {
      const { teacherEmails, studentEmails } = await accountEmails();
      await schoolDatabaseService.deleteAllSchoolData(userAccount.schoolFirebaseConfig);
      await schoolDatabaseService.deleteAllTeacherDatabases(userAccount.schoolFirebaseConfig);
      await schoolDatabaseService.deleteAllUserAccountsFromMasterRegistry(teacherEmails, studentEmails);
      await firestoreService.deleteHub(userAccount.schoolId);
      if (userAccount.email) await firestoreService.deleteUserAccount(userAccount.email);
      invalidateCache();
      alert('ลบข้อมูลโรงเรียนสำเร็จ');
      await signOut();
      router.push('/signup');
    } catch (error) {
      console.error('Error deleting data:', error);
      alert('ไม่สามารถลบข้อมูลได้');
    } finally {
      setBusy(false);
    }
  };

  const rows: { key: Action; label: string; hint: string }[] = [
    { key: 'reset', label: 'รีเซ็ตข้อมูล', hint: 'ลบครู นักเรียน และวิชาทั้งหมด เริ่มใหม่' },
    { key: 'delete', label: 'ลบโรงเรียน', hint: 'ลบทุกอย่างรวมถึงบัญชีผู้ดูแล' },
  ];
  const copy = action ? COPY[action] : null;

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
        <AlertTriangle size={16} /> โซนอันตราย
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map(row => (
          <button
            key={row.key}
            type="button"
            onClick={() => setAction(row.key)}
            className="flex items-center gap-3 rounded-2xl bg-surface p-4 text-left shadow-neu-in-sm transition-shadow active:shadow-neu-in-xs"
          >
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-red-700 dark:text-red-400">{row.label}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{row.hint}</div>
            </div>
            <ChevronRight size={18} className="flex-none text-gray-400" />
          </button>
        ))}
      </div>

      <Modal open={!!action} onClose={close} dismissible={!busy} closeOnBackdrop={false} labelledBy="danger-title">
        {copy && (<>
          <ModalHeader id="danger-title" title={copy.title} icon={<AlertTriangle size={22} className="text-red-600" />} onClose={close} />
          <p className="mb-4 rounded-2xl bg-red-500/10 p-4 text-sm text-red-800 dark:text-red-200">{copy.warning}</p>
          <label htmlFor="danger-confirm" className="mb-2 block text-sm text-gray-600 dark:text-gray-300">
            พิมพ์ <span className="font-mono font-semibold text-red-700 dark:text-red-400">{schoolName}</span> เพื่อยืนยัน
          </label>
          <input
            id="danger-confirm"
            data-autofocus
            type="text"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            autoComplete="off"
            className="mb-5 h-12 w-full rounded-xl border border-transparent bg-surface px-4 font-mono text-gray-900 shadow-neu-in-sm outline-none focus:border-red-400 dark:text-gray-50"
          />
          <div className="flex gap-3">
            <button type="button" onClick={close} disabled={busy} className="h-12 flex-1 rounded-xl bg-surface font-semibold text-gray-700 shadow-neu-sm active:shadow-neu-in-sm disabled:opacity-50 dark:text-gray-200">
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={action === 'reset' ? handleReset : handleDelete}
              disabled={typed !== schoolName || busy}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 font-semibold text-white shadow-neu-sm active:bg-red-700 disabled:opacity-40"
            >
              {busy && <Loader2 size={18} className="animate-spin" />}
              {busy ? 'กำลังดำเนินการ…' : copy.confirm}
            </button>
          </div>
        </>)}
      </Modal>
    </section>
  );
}
