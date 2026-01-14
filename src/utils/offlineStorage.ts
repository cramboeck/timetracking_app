import { TimeEntry } from '../types';

const PENDING_ENTRIES_KEY = 'pending_time_entries';

export interface PendingEntry {
  entry: TimeEntry;
  action: 'create' | 'update';
  timestamp: string;
  retryCount: number;
}

/**
 * Get all pending entries from localStorage
 */
export function getPendingEntries(): PendingEntry[] {
  try {
    const stored = localStorage.getItem(PENDING_ENTRIES_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error('❌ [OFFLINE] Failed to read pending entries:', error);
    return [];
  }
}

/**
 * Add a pending entry to localStorage
 */
export function addPendingEntry(entry: TimeEntry, action: 'create' | 'update'): void {
  try {
    const pending = getPendingEntries();

    // Check if entry already exists (update it instead of adding duplicate)
    const existingIndex = pending.findIndex(p => p.entry.id === entry.id);

    const newPending: PendingEntry = {
      entry,
      action,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };

    if (existingIndex >= 0) {
      // Update existing pending entry
      pending[existingIndex] = newPending;
      console.log('📝 [OFFLINE] Updated pending entry:', entry.id);
    } else {
      // Add new pending entry
      pending.push(newPending);
      console.log('📝 [OFFLINE] Added pending entry:', entry.id);
    }

    localStorage.setItem(PENDING_ENTRIES_KEY, JSON.stringify(pending));
  } catch (error) {
    console.error('❌ [OFFLINE] Failed to save pending entry:', error);
  }
}

/**
 * Remove a pending entry after successful sync
 */
export function removePendingEntry(entryId: string): void {
  try {
    const pending = getPendingEntries();
    const filtered = pending.filter(p => p.entry.id !== entryId);
    localStorage.setItem(PENDING_ENTRIES_KEY, JSON.stringify(filtered));
    console.log('✅ [OFFLINE] Removed synced entry:', entryId);
  } catch (error) {
    console.error('❌ [OFFLINE] Failed to remove pending entry:', error);
  }
}

/**
 * Increment retry count for a pending entry
 */
export function incrementRetryCount(entryId: string): void {
  try {
    const pending = getPendingEntries();
    const entry = pending.find(p => p.entry.id === entryId);
    if (entry) {
      entry.retryCount++;
      localStorage.setItem(PENDING_ENTRIES_KEY, JSON.stringify(pending));
    }
  } catch (error) {
    console.error('❌ [OFFLINE] Failed to update retry count:', error);
  }
}

/**
 * Clear all pending entries (use with caution)
 */
export function clearPendingEntries(): void {
  localStorage.removeItem(PENDING_ENTRIES_KEY);
  console.log('🗑️ [OFFLINE] Cleared all pending entries');
}

/**
 * Get count of pending entries
 */
export function getPendingCount(): number {
  return getPendingEntries().length;
}

/**
 * Check if there are any pending entries
 */
export function hasPendingEntries(): boolean {
  return getPendingCount() > 0;
}
