import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURE_SETTINGS, canUseFeature, classLevel, withFeatureDefaults } from './feature-access';

describe('feature access', () => {
  it('defaults: teacher tools on for every teacher, student learning off', () => {
    const s = withFeatureDefaults(undefined);
    expect(s).toEqual(DEFAULT_FEATURE_SETTINGS);
    expect(canUseFeature(s, 'classroomTools', { role: 'teacher', teacherId: 'T1' })).toBe(true);
    expect(canUseFeature(s, 'learning', { role: 'student', classroom: 'ม.1/1' })).toBe(false);
  });

  it('admins always see everything', () => {
    const s = withFeatureDefaults({ classroomTools: { mode: 'off', ids: [] } });
    expect(canUseFeature(s, 'classroomTools', { role: 'admin' })).toBe(true);
    expect(canUseFeature(s, 'learning', { role: 'admin' })).toBe(true);
  });

  it('selected: teachers by ID, students by classroom', () => {
    const s = withFeatureDefaults({
      classroomTools: { mode: 'selected', ids: ['T1'] },
      learning: { mode: 'selected', ids: ['ม.2/1'] },
    });
    expect(canUseFeature(s, 'classroomTools', { role: 'teacher', teacherId: 'T1' })).toBe(true);
    expect(canUseFeature(s, 'classroomTools', { role: 'teacher', teacherId: 'T2' })).toBe(false);
    expect(canUseFeature(s, 'learning', { role: 'student', classroom: 'ม.2/1' })).toBe(true);
    expect(canUseFeature(s, 'learning', { role: 'student' })).toBe(false);
  });

  it('a feature is only for its own audience', () => {
    const s = withFeatureDefaults({ learning: { mode: 'all', ids: [] } });
    expect(canUseFeature(s, 'learning', { role: 'teacher', teacherId: 'T1' })).toBe(false);
    expect(canUseFeature(s, 'classroomTools', { role: 'student', classroom: 'ม.1/1' })).toBe(false);
  });

  it('ignores malformed stored rules', () => {
    const s = withFeatureDefaults({ classroomTools: { mode: 'sometimes' }, learning: { mode: 'all', ids: [12] } });
    expect(s.classroomTools.mode).toBe('all');
    expect(s.learning.ids).toEqual(['12']);
  });

  it('reads the level of a classroom', () => {
    expect(classLevel('ม.1/2')).toBe('ม.1');
    expect(classLevel('ป.6')).toBe('ป.6');
  });
});
