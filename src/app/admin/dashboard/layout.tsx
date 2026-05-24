'use client';

import { useState, useEffect } from 'react';
import AdminHeader from '@/components/AdminHeader';

export default function AdminDashboardLayout({
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
      <AdminHeader isDark={isDark} toggleTheme={toggleTheme} />
      <div className="pt-24">
        {children}
      </div>
    </div>
  );
}
