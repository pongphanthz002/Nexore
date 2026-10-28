import { initializeApp, getApps, deleteApp, FirebaseApp, FirebaseOptions } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, initializeFirestore, Firestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from 'firebase/firestore';
import { MASTER_REGISTRY_CONFIG } from '@/config/master-registry.config';
import type { FirebaseConfig } from '@/types/firebase.types';

interface FirebaseInstance {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

const MASTER_INSTANCE = 'master-registry';
/** Max number of teacher project instances kept alive (students fan out to many teacher DBs). */
const MAX_TEACHER_INSTANCES = 15;
/** Never evict an instance used within this window (it may have a query in flight). */
const EVICT_IDLE_MS = 60 * 1000;

interface GetInstanceOptions {
  /** Use IndexedDB persistence (default true). Disable for throwaway instances. */
  persistent?: boolean;
}

class FirebaseManager {
  private instances: Map<string, FirebaseInstance> = new Map();
  private lastUsed: Map<string, number> = new Map();
  /** Instance names that are evictable (teacher project DBs). */
  private teacherInstanceNames: Set<string> = new Set();
  /** Instance names that must stay alive (school DBs). */
  private pinnedInstanceNames: Set<string> = new Set();

  /**
   * Initialize or get existing Firebase instance for a specific project
   * @param config - Firebase configuration object
   * @param instanceName - Unique identifier for this Firebase instance (default: 'default')
   * @returns FirebaseInstance containing app, auth, and db
   */
  getInstance(config: FirebaseOptions, instanceName: string = 'default', options: GetInstanceOptions = {}): FirebaseInstance {
    const cached = this.instances.get(instanceName);
    if (cached) {
      this.lastUsed.set(instanceName, Date.now());
      return cached;
    }

    if (typeof window === 'undefined') {
      throw new Error('Firebase can only be initialized in browser environment');
    }

    // Check if app with this name already exists in Firebase's global registry
    const existingApp = getApps().find(app => app.name === instanceName);

    const app = existingApp || initializeApp(config, instanceName);
    const auth = getAuth(app);

    let db: Firestore;
    if (!existingApp) {
      try {
        db = initializeFirestore(app, {
          localCache: options.persistent === false
            ? memoryLocalCache()
            : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        });
      } catch {
        // Already initialized for this app
        db = getFirestore(app);
      }
    } else {
      db = getFirestore(app);
    }

    const instance: FirebaseInstance = { app, auth, db };
    this.instances.set(instanceName, instance);
    this.lastUsed.set(instanceName, Date.now());

    return instance;
  }

  /**
   * Get the Master Registry Firebase instance (nexore-hub)
   * This is hardcoded and used for central registry operations
   */
  getMasterRegistryInstance(): FirebaseInstance {
    return this.getInstance(MASTER_REGISTRY_CONFIG, MASTER_INSTANCE);
  }

  /**
   * Firestore for a School Database. Instances are named by projectId so a teacher
   * who falls back to the school DB shares the same app/connection.
   */
  getSchoolDb(config: FirebaseConfig): Firestore {
    const name = this.projectInstanceName(config);
    this.pinnedInstanceNames.add(name);
    this.teacherInstanceNames.delete(name);
    return this.getInstance(config, name).db;
  }

  /**
   * Firestore for a Teacher Database. Teacher instances are evicted LRU-style
   * once more than MAX_TEACHER_INSTANCES are open.
   */
  getTeacherDb(config: FirebaseConfig): Firestore {
    const name = this.projectInstanceName(config);
    const isNew = !this.instances.has(name);
    if (!this.pinnedInstanceNames.has(name)) {
      this.teacherInstanceNames.add(name);
    }
    const db = this.getInstance(config, name).db;
    if (isNew) this.evictIdleTeacherInstances();
    return db;
  }

  private projectInstanceName(config: FirebaseConfig): string {
    if (!config?.projectId) {
      throw new Error('Firebase config is missing projectId');
    }
    return `db-${config.projectId}`;
  }

  private evictIdleTeacherInstances(): void {
    const teacherNames = Array.from(this.teacherInstanceNames).filter(n => this.instances.has(n));
    if (teacherNames.length <= MAX_TEACHER_INSTANCES) return;

    const now = Date.now();
    const evictable = teacherNames
      .filter(n => now - (this.lastUsed.get(n) || 0) > EVICT_IDLE_MS)
      .sort((a, b) => (this.lastUsed.get(a) || 0) - (this.lastUsed.get(b) || 0));

    const excess = teacherNames.length - MAX_TEACHER_INSTANCES;
    evictable.slice(0, excess).forEach(name => this.removeInstance(name));
  }

  /**
   * Remove a Firebase instance and release its resources (connections, cache).
   * @param instanceName - Name of the instance to remove
   */
  removeInstance(instanceName: string): void {
    const instance = this.instances.get(instanceName);
    this.instances.delete(instanceName);
    this.lastUsed.delete(instanceName);
    this.teacherInstanceNames.delete(instanceName);
    this.pinnedInstanceNames.delete(instanceName);
    if (instance) {
      deleteApp(instance.app).catch(err => console.error(`Error deleting Firebase app ${instanceName}:`, err));
    }
  }

  /**
   * Release every instance except the Master Registry (used on sign out).
   */
  clearAllInstances(): void {
    for (const name of Array.from(this.instances.keys())) {
      if (name !== MASTER_INSTANCE) this.removeInstance(name);
    }
  }
}

// Singleton instance
const firebaseManager = new FirebaseManager();

// Export default instance for backward compatibility
let defaultInstance: FirebaseInstance | null = null;

if (typeof window !== 'undefined') {
  try {
    // Use Master Registry as default for the app
    defaultInstance = firebaseManager.getMasterRegistryInstance();
  } catch (error) {
    console.error('Firebase initialization failed:', error);
  }
}

export { firebaseManager };
export type { FirebaseInstance, FirebaseOptions };
export const app = defaultInstance?.app;
export const auth = defaultInstance?.auth;
export const db = defaultInstance?.db;
