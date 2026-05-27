'use client';

import { useState, useEffect } from 'react';
import ScheduleWidget from '@/components/ScheduleWidget';

export default function TeacherDashboard() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));

    // Listen for theme changes
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="p-6">
      {/* Main content */}
      <div className="max-w-7xl mx-auto">

        {/* Schedule Widget */}
        <ScheduleWidget isDark={isDark} />

      </div>
    </div>
  );
}
