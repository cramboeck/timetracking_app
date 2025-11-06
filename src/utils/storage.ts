import { TimeEntry } from '../types';

const STORAGE_KEY = 'timetracking_entries';

export const storage = {
  getEntries: (): TimeEntry[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading entries:', error);
      return [];
    }
  },

  saveEntries: (entries: TimeEntry[]): void => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      console.error('Error saving entries:', error);
    }
  },

  addEntry: (entry: TimeEntry): void => {
    const entries = storage.getEntries();
    entries.push(entry);
    storage.saveEntries(entries);
  },

  updateEntry: (id: string, updates: Partial<TimeEntry>): void => {
    const entries = storage.getEntries();
    const index = entries.findIndex(e => e.id === id);
    if (index !== -1) {
      entries[index] = { ...entries[index], ...updates };
      storage.saveEntries(entries);
    }
  },

  deleteEntry: (id: string): void => {
    const entries = storage.getEntries();
    const filtered = entries.filter(e => e.id !== id);
    storage.saveEntries(filtered);
  }
};
