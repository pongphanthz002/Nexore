'use client';

import StudentHeader from '@/components/StudentHeader';
import StudentFooter from '@/components/StudentFooter';
import ComingSoon from '@/components/ComingSoon';
import { Lightbulb } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

export default function StudentLearningPage() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-surface font-sans text-gray-900 dark:text-gray-50">
      <StudentHeader isDark={isDark} toggleTheme={toggleTheme} />
      <main className="mx-auto max-w-3xl px-4 pb-32 pt-28 sm:px-6">
        <ComingSoon icon={Lightbulb} title="การเรียนรู้" />
      </main>
      <StudentFooter isDark={isDark} />
    </div>
  );
}
