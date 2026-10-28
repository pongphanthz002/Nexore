'use client';

import TodayTimetable from '@/components/timetable/TodayTimetable';

export default function TeacherDashboard() {
  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* Attendance bar (current period, until checked) + today's timetable */}
        <TodayTimetable role="teacher" />
      </div>
    </div>
  );
}
