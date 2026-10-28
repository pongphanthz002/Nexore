import { UserIdentity } from '@/types';
import { STORAGE_KEYS as KEYS } from '@/config/storage.keys';

const STORAGE_KEYS = {
  USER_IDENTITY: KEYS.USER_IDENTITY,
  MASTER_REGISTRY_CONFIG: KEYS.MASTER_REGISTRY_CONFIG,
  SCHOOL_QR_CODE: KEYS.SCHOOL_QR_CODE,
  TEACHER_NODES: KEYS.TEACHER_NODES,
  STUDENT_DATA: KEYS.STUDENT_DATA,
} as const;

class StorageService {
  // Identity Check
  async getUserIdentity(): Promise<UserIdentity | null> {
    if (typeof window === 'undefined') return null;
    
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USER_IDENTITY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting user identity:', error);
      return null;
    }
  }

  async setUserIdentity(identity: UserIdentity): Promise<void> {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(STORAGE_KEYS.USER_IDENTITY, JSON.stringify(identity));
    } catch (error) {
      console.error('Error setting user identity:', error);
    }
  }

  async clearUserIdentity(): Promise<void> {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem(STORAGE_KEYS.USER_IDENTITY);
    } catch (error) {
      console.error('Error clearing user identity:', error);
    }
  }

  // Master Registry Config
  async getMasterRegistryConfig() {
    if (typeof window === 'undefined') return null;
    
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MASTER_REGISTRY_CONFIG);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting master registry config:', error);
      return null;
    }
  }

  async setMasterRegistryConfig(config: any): Promise<void> {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(STORAGE_KEYS.MASTER_REGISTRY_CONFIG, JSON.stringify(config));
    } catch (error) {
      console.error('Error setting master registry config:', error);
    }
  }

  // School QR Code
  async getSchoolQRCode(): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    
    try {
      return localStorage.getItem(STORAGE_KEYS.SCHOOL_QR_CODE);
    } catch (error) {
      console.error('Error getting school QR code:', error);
      return null;
    }
  }

  async setSchoolQRCode(qrCode: string): Promise<void> {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(STORAGE_KEYS.SCHOOL_QR_CODE, qrCode);
    } catch (error) {
      console.error('Error setting school QR code:', error);
    }
  }

  // Teacher Nodes
  async getTeacherNodes(): Promise<any[]> {
    if (typeof window === 'undefined') return [];
    
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TEACHER_NODES);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting teacher nodes:', error);
      return [];
    }
  }

  async setTeacherNodes(nodes: any[]): Promise<void> {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(STORAGE_KEYS.TEACHER_NODES, JSON.stringify(nodes));
    } catch (error) {
      console.error('Error setting teacher nodes:', error);
    }
  }

  // Student Data
  async getStudentData(): Promise<any | null> {
    if (typeof window === 'undefined') return null;
    
    try {
      const data = localStorage.getItem(STORAGE_KEYS.STUDENT_DATA);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting student data:', error);
      return null;
    }
  }

  async setStudentData(data: any): Promise<void> {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(STORAGE_KEYS.STUDENT_DATA, JSON.stringify(data));
    } catch (error) {
      console.error('Error setting student data:', error);
    }
  }

  // Clear all data
  async clearAll(): Promise<void> {
    if (typeof window === 'undefined') return;
    
    try {
      Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.error('Error clearing all storage:', error);
    }
  }
}

export const storageService = new StorageService();
