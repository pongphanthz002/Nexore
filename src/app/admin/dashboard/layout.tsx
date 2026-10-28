'use client';

import AdminHeader from '@/components/AdminHeader';
import { useTheme } from '@/contexts/ThemeContext';

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-surface">
      <AdminHeader isDark={isDark} toggleTheme={toggleTheme} />
      <div className="pt-24">
        {children}
      </div>
    </div>
  );
}
