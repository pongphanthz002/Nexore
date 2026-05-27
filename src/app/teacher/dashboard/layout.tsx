'use client';

import { useState, useEffect } from 'react';
import TeacherHeader from '@/components/TeacherHeader';
import TeacherDock from '@/components/TeacherDock';

export default function TeacherDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('nexore-theme');
    if (savedTheme === 'dark') {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    localStorage.setItem('nexore-theme', newTheme ? 'dark' : 'light');
    if (newTheme) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

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
