export interface TimeEntry {
  id: string;
  startTime: string;
  endTime?: string;
  duration: number; // in seconds
  project: string;
  description: string;
  isRunning: boolean;
  createdAt: string;
}

export type ViewMode = 'stopwatch' | 'manual' | 'list';
