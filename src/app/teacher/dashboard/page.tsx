'use client';

import TodayTimetable from '@/components/timetable/TodayTimetable';
import TeacherStats from '@/components/stats/TeacherStats';

export default function TeacherDashboard() {
  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* Attendance bar (current period, until checked) + today's timetable */}
        <TodayTimetable role="teacher" />
        {/* Class statistics (2 summary reads per subject, cached 10 minutes) */}
        <TeacherStats />
      </div>
    </div>
  );
}
