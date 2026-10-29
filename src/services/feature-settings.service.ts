import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseManager } from '@/lib/firebase';
import { dedupe } from '@/lib/firestore-helpers';
import { STORAGE_KEYS } from '@/config/storage.keys';
import { withFeatureDefaults, type FeatureSettings } from '@/lib/feature-access';
import type { FirebaseConfig } from '@/types/firebase.types';

/**
 * The admin's feature visibility settings: one School DB doc (`settings/features`), read at most
 * once per 10 minutes per device (localStorage), so a change reaches other devices within that
 * time or on a pull-to-refresh. A failed read keeps the cached copy, else the defaults.
 */

export const FEATURE_SETTINGS_FRESH_MS = 10 * 60 * 1000;

interface CachedFeatureSettings {
  projectId: string;
  savedAt: number;
  settings: FeatureSettings;
}

type Listener = (settings: FeatureSettings) => void;
const listeners = new Set<Listener>();

function readCache(projectId: string): CachedFeatureSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FEATURE_SETTINGS);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedFeatureSettings;
    return cached.projectId === projectId ? { ...cached, settings: withFeatureDefaults(cached.settings) } : null;
  } catch {
    return null;
  }
}

function writeCache(projectId: string, settings: FeatureSettings) {
  try {
    localStorage.setItem(STORAGE_KEYS.FEATURE_SETTINGS, JSON.stringify({ projectId, savedAt: Date.now(), settings }));
  } catch {
    // Storage full or blocked: settings are read again next time
  }
}

const ref = (config: FirebaseConfig) => doc(firebaseManager.getSchoolDb(config), 'settings', 'features');

export const featureSettingsService = {
  /** The cached copy at once (or null), for a first render without waiting. */
  peek(schoolConfig: FirebaseConfig): FeatureSettings | null {
    return readCache(schoolConfig.projectId)?.settings ?? null;
  },

  async get(schoolConfig: FirebaseConfig, { force = false } = {}): Promise<FeatureSettings> {
    const cached = readCache(schoolConfig.projectId);
    if (!force && cached && Date.now() - cached.savedAt < FEATURE_SETTINGS_FRESH_MS) return cached.settings;
    try {
      return await dedupe(`feature-settings:${schoolConfig.projectId}`, async () => {
        const snap = await getDoc(ref(schoolConfig));
        const settings = withFeatureDefaults(snap.exists() ? snap.data() : undefined);
        writeCache(schoolConfig.projectId, settings);
        listeners.forEach(fn => fn(settings));
        return settings;
      });
    } catch (error) {
      console.error('Error loading feature settings:', error);
      return cached?.settings ?? withFeatureDefaults(undefined);
    }
  },

  async save(schoolConfig: FirebaseConfig, settings: FeatureSettings): Promise<void> {
    await setDoc(ref(schoolConfig), { ...settings, updatedAt: serverTimestamp() });
    writeCache(schoolConfig.projectId, settings);
    listeners.forEach(fn => fn(settings));
  },

  /** Every mounted `useFeatureAccess` hears about fresh settings (dock and page stay in step). */
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};
