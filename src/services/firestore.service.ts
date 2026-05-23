import { db } from '@/lib/firebase';
import { collection, doc, setDoc, getDoc, getDocs, query, where, updateDoc, deleteDoc, Firestore } from 'firebase/firestore';
import { UserAccount } from '@/contexts/AuthContext';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

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
    console.log('saveHub called with hub:', hub);
    const database = this.getDB();
    console.log('Database obtained:', database);
    const hubRef = doc(database, this.hubsCollection, hub.id);
    console.log('Hub ref created:', hubRef);
    await setDoc(hubRef, {
      ...hub,
      updatedAt: new Date(),
    });
    console.log('setDoc completed successfully');
  }

  // Get a hub by ID
  async getHub(id: string): Promise<Hub | null> {
    const database = this.getDB();
    const hubRef = doc(database, this.hubsCollection, id);
    const hubSnap = await getDoc(hubRef);
    
    if (hubSnap.exists()) {
      return hubSnap.data() as Hub;
    }
    return null;
  }

  // Get all hubs for a school
  async getSchoolHubs(schoolId: string): Promise<Hub[]> {
    const database = this.getDB();
    const q = query(collection(database, this.hubsCollection), where('schoolId', '==', schoolId));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => doc.data() as Hub);
  }

  // Get all hubs
  async getAllHubs(): Promise<Hub[]> {
    const database = this.getDB();
    const querySnapshot = await getDocs(collection(database, this.hubsCollection));
    return querySnapshot.docs.map(doc => doc.data() as Hub);
  }

  // Delete a hub
  async deleteHub(id: string): Promise<void> {
    const database = this.getDB();
    await deleteDoc(doc(database, this.hubsCollection, id));
  }

  // Update school firebase config
  async updateSchoolFirebaseConfig(id: string, schoolFirebaseConfig: Hub['schoolFirebaseConfig']): Promise<void> {
    const database = this.getDB();
    const hubRef = doc(database, this.hubsCollection, id);
    await updateDoc(hubRef, {
      schoolFirebaseConfig,
      updatedAt: new Date(),
    });
  }

  // User Account Functions

  // Save or update user account (email → schoolId mapping + UID + role)
  async saveUserAccount(email: string, schoolId: string, uid?: string, role?: 'admin' | 'teacher' | 'student'): Promise<void> {
    const database = this.getDB();
    const userRef = doc(database, this.usersCollection, email);
    const data: any = {
      email,
      schoolId,
      updatedAt: new Date(),
    };
    if (uid) {
      data.uid = uid;
    }
    if (role) {
      data.role = role;
    }
    
    console.log('=== saveUserAccount ===');
    console.log('Email:', email);
    console.log('SchoolId:', schoolId);
    console.log('UID:', uid);
    console.log('Role:', role);
    console.log('Data to save:', data);
    console.log('=====================');
    
    await setDoc(userRef, data);
    
    console.log('User account saved successfully');
  }

  // Get user account by email (id) - returns schoolId, UID, and role
  async getUserAccount(email: string): Promise<{ schoolId: string; uid?: string; role?: 'admin' | 'teacher' | 'student' } | null> {
    const database = this.getDB();
    const userRef = doc(database, this.usersCollection, email);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      return userSnap.data() as { schoolId: string; uid?: string; role?: 'admin' | 'teacher' | 'student' };
    }
    return null;
  }

  // Delete user account
  async deleteUserAccount(email: string): Promise<void> {
    const database = this.getDB();
    await deleteDoc(doc(database, this.usersCollection, email));
  }
}

export const firestoreService = new FirestoreService();
