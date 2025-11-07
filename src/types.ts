export interface Customer {
  id: string;
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
  name: string;
  description?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  customerId: string;
  name: string;
  hourlyRate: number; // in EUR
  isActive: boolean;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  startTime: string;
  endTime?: string;
  duration: number; // in seconds
  projectId: string; // Changed from project string to projectId
  description: string;
  isRunning: boolean;
  createdAt: string;
}

export type ViewMode = 'stopwatch' | 'manual' | 'list' | 'dashboard' | 'settings';
