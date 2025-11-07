export interface Customer {
  id: string;
  userId: string; // Multi-user support
  name: string;
  color: string;
  customerNumber?: string; // For sevDesk integration
  contactPerson?: string;
  email?: string;
  address?: string;
  createdAt: string;
}

export interface CompanyInfo {
  name: string;
  address: string;
  email: string;
  phone?: string;
  taxId?: string;
}

export interface Activity {
  id: string;
  userId: string; // Multi-user support
  name: string;
  description?: string;
  createdAt: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  mfaEnabled: boolean;
  mfaSecret?: string; // For future TOTP implementation
  createdAt: string;
  lastLogin?: string;
}

export interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
  mfaCode?: string; // For future MFA
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
}

export interface Project {
  id: string;
  userId: string; // Multi-user support
  customerId: string;
  name: string;
  hourlyRate: number; // in EUR
  isActive: boolean;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  userId: string; // Multi-user support
  startTime: string;
  endTime?: string;
  duration: number; // in seconds
  projectId: string; // Changed from project string to projectId
  description: string;
  isRunning: boolean;
  createdAt: string;
}

export type ViewMode = 'stopwatch' | 'manual' | 'list' | 'dashboard' | 'settings';
