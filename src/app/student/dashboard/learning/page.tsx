'use client';

import StudentHeader from '@/components/StudentHeader';
import StudentFooter from '@/components/StudentFooter';
import ComingSoon from '@/components/ComingSoon';
import { Lightbulb } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';

export default function StudentLearningPage() {
  const { isDark, toggleTheme } = useTheme();
  const { can, loading } = useFeatureAccess();
  const open = loading || can('learning');

  return (
    <div className="min-h-screen bg-surface font-sans text-gray-900 dark:text-gray-50">
      <StudentHeader isDark={isDark} toggleTheme={toggleTheme} />
      <main className="mx-auto max-w-3xl px-4 pb-32 pt-28 sm:px-6">
        {open
          ? <ComingSoon icon={Lightbulb} title="การเรียนรู้" />
          : <ComingSoon icon={Lightbulb} title="การเรียนรู้" message="ระบบนี้ยังไม่เปิดให้ใช้งาน" />}
      </main>
      <StudentFooter isDark={isDark} />
    </div>
  );
}
