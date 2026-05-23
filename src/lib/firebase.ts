import { initializeApp, getApps, FirebaseApp, FirebaseOptions } from 'firebase/app';
import { getAuth, Auth, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { MASTER_REGISTRY_CONFIG } from '@/config/master-registry.config';

interface FirebaseInstance {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

class FirebaseManager {
  private instances: Map<string, FirebaseInstance> = new Map();

  /**
   * Initialize or get existing Firebase instance for a specific project
   * @param config - Firebase configuration object
   * @param instanceName - Unique identifier for this Firebase instance (default: 'default')
   * @returns FirebaseInstance containing app, auth, and db
   */
  getInstance(config: FirebaseOptions, instanceName: string = 'default'): FirebaseInstance {
    if (this.instances.has(instanceName)) {
      return this.instances.get(instanceName)!;
    }

    if (typeof window === 'undefined') {
      throw new Error('Firebase can only be initialized in browser environment');
    }

    // Check if app with this name already exists in Firebase's global registry
    const existingApps = getApps();
    const existingApp = existingApps.find(app => app.name === instanceName);

    const app = existingApp || initializeApp(config, instanceName);
    const auth = getAuth(app);
    const db = getFirestore(app);

    const instance: FirebaseInstance = { app, auth, db };
    this.instances.set(instanceName, instance);

    console.log(`Firebase instance created: ${instanceName}`);

    return instance;
  }

  /**
   * Get the Master Registry Firebase instance (nexore-hub)
   * This is hardcoded and used for central registry operations
   */
  getMasterRegistryInstance(): FirebaseInstance {
    return this.getInstance(MASTER_REGISTRY_CONFIG, 'master-registry');
  }

  /**
   * Get the default Firebase instance using environment variables
   * This is for school-specific databases
   */
  getDefaultInstance(): FirebaseInstance | null {
    const config: FirebaseOptions = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    // Check if all required config values are present
    if (!config.apiKey || !config.projectId || !config.appId) {
      console.warn('Firebase config is incomplete. Please set environment variables.');
      return null;
    }

    return this.getInstance(config, 'default');
  }

  /**
   * Remove a Firebase instance from cache
   * @param instanceName - Name of the instance to remove
   */
  removeInstance(instanceName: string): void {
    this.instances.delete(instanceName);
  }

  /**
   * Clear all cached instances
   */
  clearAllInstances(): void {
    this.instances.clear();
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
    console.log('Firebase initialized successfully:', defaultInstance?.app?.name);
  } catch (error) {
    console.error('Firebase initialization failed:', error);
  }
}

export { firebaseManager };
export type { FirebaseInstance, FirebaseOptions };
export const app = defaultInstance?.app;
export const auth = defaultInstance?.auth;
export const db = defaultInstance?.db;
