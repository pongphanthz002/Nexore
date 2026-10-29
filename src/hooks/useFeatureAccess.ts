'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { featureSettingsService } from '@/services/feature-settings.service';
import { schoolDatabaseService } from '@/services/school-database.service';
import {
  DEFAULT_FEATURE_SETTINGS, FEATURES, canUseFeature, type FeatureAudience, type FeatureId, type FeatureSettings,
} from '@/lib/feature-access';

/**
 * Which extra features the signed-in user may use (see src/lib/feature-access.ts). Shows the
 * cached settings at once (else the defaults) and re-reads them when older than 10 minutes.
 * A student's classroom is only looked up when a student feature is limited to some rooms.
 */
export function useFeatureAccess() {
  const { userAccount } = useAuth();
  const config = userAccount?.schoolFirebaseConfig;
  const [settings, setSettings] = useState<FeatureSettings>(() => (config && featureSettingsService.peek(config)) || DEFAULT_FEATURE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [classroom, setClassroom] = useState<string | undefined>();

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    const cached = featureSettingsService.peek(config);
    if (cached) setSettings(cached);
    featureSettingsService.get(config).then(s => {
      if (cancelled) return;
      setSettings(s);
      setLoading(false);
    });
    const unsubscribe = featureSettingsService.subscribe(s => { if (!cancelled) setSettings(s); });
    return () => { cancelled = true; unsubscribe(); };
  }, [config]);

  const needsClassroom = userAccount?.role === 'student'
    && FEATURES.some(f => f.audience === 'student' && settings[f.id].mode === 'selected');
  useEffect(() => {
    if (!needsClassroom || !config || !userAccount) return;
    let cancelled = false;
    schoolDatabaseService.getStudentForAccount(config, userAccount)
      .then(student => { if (!cancelled) setClassroom(student?.class); })
      .catch(err => console.error('Error loading student for feature access:', err));
    return () => { cancelled = true; };
  }, [needsClassroom, config, userAccount]);

  const can = useCallback((id: FeatureId) => !!userAccount && canUseFeature(settings, id, {
    role: userAccount.role,
    teacherId: userAccount.role === 'student' ? undefined : userAccount.userId,
    classroom,
  }), [settings, userAccount, classroom]);

  /** true when the user has at least one feature of this kind (the dock tab shows) */
  const anyFor = useCallback((audience: FeatureAudience) => FEATURES.some(f => f.audience === audience && can(f.id)), [can]);

  return { settings, loading, can, anyFor };
}

/** Re-reads the settings now (pull-to-refresh). */
export function refreshFeatureSettings(config: Parameters<typeof featureSettingsService.get>[0]) {
  return featureSettingsService.get(config, { force: true });
}
