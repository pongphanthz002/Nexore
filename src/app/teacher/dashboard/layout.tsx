'use client';

import { useState, useEffect } from 'react';
import TeacherHeader from '@/components/TeacherHeader';
import TeacherDock from '@/components/TeacherDock';
import { useAuth } from '@/contexts/AuthContext';

export default function TeacherDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userAccount } = useAuth();
  const [isDark, setIsDark] = useState(false);

  console.log('TeacherDashboardLayout - userAccount role:', userAccount?.role);

  useEffect(() => {
    console.log('TeacherDashboardLayout - userAccount changed:', userAccount?.role);
  }, [userAccount]);

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
