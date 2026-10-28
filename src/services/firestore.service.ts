import { db } from '@/lib/firebase';
import { collection, doc, setDoc, getDoc, getDocs, query, where, updateDoc, deleteDoc, writeBatch, Firestore } from 'firebase/firestore';
import { withRetry, dedupe } from '@/lib/firestore-helpers';
import { STORAGE_KEYS } from '@/config/storage.keys';
import type { FirebaseConfig, UserMapping, UserRole } from '@/types/firebase.types';

export type { FirebaseConfig } from '@/types/firebase.types';

export interface Hub {
  id: string;
  name: string;
  schoolId: string;
  type: 'school' | 'teacher';
  // For school hubs: Firebase config for the school's database (students/teachers)
  schoolFirebaseConfig?: FirebaseConfig;
  createdAt: Date;
  updatedAt: Date;
}

/** Hub configs almost never change, so they are cached locally for a day. */
const HUB_CACHE_TTL = 24 * 60 * 60 * 1000;

class FirestoreService {
  private hubsCollection = 'hubs';
  private usersCollection = 'users';

  private getDB(): Firestore {
    if (!db) {
      throw new Error('Firestore is not initialized. Please check your Firebase configuration.');
    }
    return db;
  }

  // Create or update a hub
  async saveHub(hub: Hub): Promise<void> {
    const database = this.getDB();
    const hubRef = doc(database, this.hubsCollection, hub.id);
    await setDoc(hubRef, {
      ...hub,
      updatedAt: new Date(),
    });
    this.invalidateHubCache(hub.id);
  }

  // Get a hub by ID (always from server)
  async getHub(id: string): Promise<Hub | null> {
    const database = this.getDB();
    const hubSnap = await withRetry(() => getDoc(doc(database, this.hubsCollection, id)));
    return hubSnap.exists() ? (hubSnap.data() as Hub) : null;
  }

  /**
   * Get a hub, using a localStorage copy younger than 24h when available.
   * Used on every login, so this saves a read per app launch.
   */
  async getHubCached(id: string, forceRefresh = false): Promise<Hub | null> {
    const key = `${STORAGE_KEYS.HUB_PREFIX}${id}`;
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const { hub, ts } = JSON.parse(raw) as { hub: Hub; ts: number };
          if (Date.now() - ts < HUB_CACHE_TTL) return hub;
        }
      } catch {
        // Corrupt cache entry — ignore and refetch
      }
    }

    const hub = await dedupe(`hub:${id}`, () => this.getHub(id));
    if (hub && typeof window !== 'undefined') {
      try {
        localStorage.setItem(key, JSON.stringify({ hub, ts: Date.now() }));
      } catch {
        // Storage full/unavailable — caching is best-effort
      }
    }
    return hub;
  }

  invalidateHubCache(id: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(`${STORAGE_KEYS.HUB_PREFIX}${id}`);
    } catch {
      // ignore
    }
  }

  // Delete a hub
  async deleteHub(id: string): Promise<void> {
    const database = this.getDB();
    await deleteDoc(doc(database, this.hubsCollection, id));
    this.invalidateHubCache(id);
  }

  // Update school firebase config
  async updateSchoolFirebaseConfig(id: string, schoolFirebaseConfig: Hub['schoolFirebaseConfig']): Promise<void> {
    const database = this.getDB();
    const hubRef = doc(database, this.hubsCollection, id);
    await updateDoc(hubRef, {
      schoolFirebaseConfig,
      updatedAt: new Date(),
    });
    this.invalidateHubCache(id);
  }

  // User Account Functions
  //
  // Documents are keyed by Firebase Auth UID (`users/{uid}`) so a user keeps their
  // identity even if their email changes. Legacy documents keyed by email are still
  // read and are migrated to the UID key on the owner's next login.

  /**
   * Save or update a user mapping.
   * With a UID the doc is written to `users/{uid}` (and any legacy email-keyed doc is removed).
   * Without a UID (admin creating an account for someone else) it is written to `users/{email}`
   * and migrated when that user logs in.
   */
  async saveUserAccount(email: string, schoolId: string, uid?: string, role?: UserRole, userId?: string): Promise<void> {
    const database = this.getDB();
    const data: Record<string, unknown> = {
      email,
      schoolId,
      updatedAt: new Date(),
    };
    if (uid) data.uid = uid;
    if (role) data.role = role;
    if (userId) data.userId = userId;

    if (uid) {
      const batch = writeBatch(database);
      batch.set(doc(database, this.usersCollection, uid), data, { merge: true });
      if (email && email !== uid) {
        batch.delete(doc(database, this.usersCollection, email));
      }
      await batch.commit();
    } else {
      await setDoc(doc(database, this.usersCollection, email), data, { merge: true });
    }
  }

  /**
   * Resolve the mapping for a signed-in user: `users/{uid}` first, then the legacy
   * `users/{email}` doc (which is migrated to `users/{uid}`).
   */
  async getUserMapping(uid: string, email?: string | null): Promise<UserMapping | null> {
    return dedupe(`user-mapping:${uid}`, async () => {
      const database = this.getDB();
      const uidSnap = await withRetry(() => getDoc(doc(database, this.usersCollection, uid)));
      if (uidSnap.exists()) {
        return uidSnap.data() as UserMapping;
      }

      if (!email) return null;
      const legacySnap = await withRetry(() => getDoc(doc(database, this.usersCollection, email)));
      if (!legacySnap.exists()) return null;

      const legacy = legacySnap.data() as UserMapping;
      const migrated: UserMapping = { ...legacy, email, uid };
      // Migrate in the background; failure just means we try again next login
      this.saveUserAccount(email, legacy.schoolId, uid, legacy.role, legacy.userId)
        .catch(err => console.error('Error migrating user mapping to UID key:', err));
      return migrated;
    });
  }

  /**
   * Look up a mapping by email only (for screens that don't know the UID).
   * Checks the legacy email-keyed doc and UID-keyed docs that store the email.
   */
  async getUserAccount(email: string): Promise<UserMapping | null> {
    const database = this.getDB();
    const legacySnap = await withRetry(() => getDoc(doc(database, this.usersCollection, email)));
    if (legacySnap.exists()) return legacySnap.data() as UserMapping;

    const snap = await withRetry(() => getDocs(query(collection(database, this.usersCollection), where('email', '==', email))));
    return snap.empty ? null : (snap.docs[0].data() as UserMapping);
  }

  /**
   * Delete every mapping for an email (UID-keyed docs and the legacy email-keyed doc).
   */
  async deleteUserAccount(email: string): Promise<void> {
    if (!email) return;
    const database = this.getDB();
    const snap = await getDocs(query(collection(database, this.usersCollection), where('email', '==', email)));
    const batch = writeBatch(database);
    snap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(doc(database, this.usersCollection, email));
    await batch.commit();
  }
}

export const firestoreService = new FirestoreService();
