import { describe, expect, it } from 'vitest';
import { sessionDateKey, studentAttendanceTotals, summarizeAttendance } from './attendance';

describe('summarizeAttendance', () => {
  it('counts hours, with มา, สาย and กิจกรรม as present', () => {
    const stats = summarizeAttendance([
      { date: 'Mon 3/11', hours: 2, status: 'มา' },
      { date: 'Tue 4/11', hours: 1, status: 'สาย' },
      { date: 'Wed 5/11', hours: 1, status: 'กิจกรรม' },
      { date: 'Thu 6/11', hours: 1, status: 'ขาด' },
    ]);
    expect(stats.totalHours).toBe(5);
    expect(stats.presentHours).toBe(4);
    expect(stats.percentage).toBe(80);
    expect(stats.hours['มา']).toBe(2);
  });

  it('leaves out sessions with no status', () => {
    const stats = summarizeAttendance([
      { date: 'Mon 3/11', hours: 1, status: 'มา' },
      { date: 'Tue 4/11', hours: 1, status: '' },
    ]);
    expect(stats.totalHours).toBe(1);
    expect(stats.history).toHaveLength(1);
  });

  it('has no percentage before anything is recorded', () => {
    expect(summarizeAttendance([]).percentage).toBeNull();
  });

  it('rounds the percentage to one decimal', () => {
    const stats = summarizeAttendance([
      { date: 'Mon 3/11', hours: 2, status: 'มา' },
      { date: 'Tue 4/11', hours: 1, status: 'ขาด' },
    ]);
    expect(stats.percentage).toBe(66.7);
  });

  it('adds missed hours to the weekday of the session', () => {
    const stats = summarizeAttendance([
      { date: 'Wed 5/11', hours: 2, status: 'ขาด' },
      { date: 'Wed 12/11', hours: 1, status: 'ลาป่วย' },
      { date: 'Fri 7/11', hours: 1, status: 'หนี' },
      { date: 'Mon 3/11', hours: 1, status: 'สาย' },
    ]);
    expect(stats.missedByDay).toEqual({ Mon: 0, Tue: 0, Wed: 3, Thu: 0, Fri: 1 });
  });

  it('lists history newest first across the new year', () => {
    const stats = summarizeAttendance([
      { date: 'Mon 3/11', hours: 1, status: 'มา' },
      { date: 'Fri 9/1', hours: 1, status: 'มา' },
      { date: 'Mon 20/5', hours: 1, status: 'มา' },
    ]);
    expect(stats.history.map(h => h.date)).toEqual(['Fri 9/1', 'Mon 3/11', 'Mon 20/5']);
  });
});

describe('sessionDateKey', () => {
  it('puts May before April of the same school year', () => {
    expect(sessionDateKey('Mon 20/5')).toBeLessThan(sessionDateKey('Tue 1/4'));
    expect(sessionDateKey('nonsense')).toBe(0);
  });
});

describe('studentAttendanceTotals', () => {
  const summary = {
    sessions: { a: { hours: 2 }, b: { hours: 1 }, c: { hours: 1 }, d: { hours: 1 } },
    students: { S1: { a: 'มา', b: 'ขาด', c: 'กิจกรรม', d: '', gone: 'มา' } },
  };

  it('counts hours per status and the present share', () => {
    expect(studentAttendanceTotals(summary, 'S1')).toEqual({
      present: 2, absent: 1, late: 0, sickLeave: 0, personalLeave: 0, activity: 1, skipped: 0, total: 4, percentage: 75,
    });
  });

  it('is all zero for a student with no sessions', () => {
    expect(studentAttendanceTotals(summary, 'S2').total).toBe(0);
    expect(studentAttendanceTotals(summary, 'S2').percentage).toBe(0);
  });
});
