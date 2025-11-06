export interface Customer {
  id: string;
  name: string;
  color: string;
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

export type ViewMode = 'stopwatch' | 'manual' | 'list' | 'settings';
