'use client';

import { useEffect } from 'react';
import TeacherHeader from '@/components/TeacherHeader';
import TeacherDock from '@/components/TeacherDock';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

export default function TeacherDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userAccount } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  console.log('TeacherDashboardLayout - userAccount role:', userAccount?.role);

  useEffect(() => {
    console.log('TeacherDashboardLayout - userAccount changed:', userAccount?.role);
  }, [userAccount]);

  return (
    <div 
      className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}
    >
      <TeacherHeader isDark={isDark} toggleTheme={toggleTheme} />
      <div className="pt-24 pb-20">
        {children}
      </div>
      <TeacherDock isDark={isDark} />
    </div>
  );
}
