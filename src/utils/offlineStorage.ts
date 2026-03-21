import { TimeEntry } from '../types';

const PENDING_ENTRIES_KEY = 'pending_time_entries';
const MAX_RETRY_COUNT = 10;

export type PendingEntryStatus = 'pending' | 'syncing' | 'failed';

export interface PendingEntry {
  entry: TimeEntry;
  action: 'create' | 'update';
  timestamp: string;
  retryCount: number;
  status: PendingEntryStatus;
  lastError?: string;
  lastAttempt?: string;
}

/**
 * Classify an error as retryable or permanent
 * - Network errors, 5xx, 408, 429 → retryable
 * - 4xx (except 408, 429) → permanent (validation errors, not found, etc.)
 */
export function isRetryableError(error: unknown): boolean {
  // Network errors are always retryable
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Check for HTTP status codes in error messages
  if (error instanceof Error) {
    const msg = error.message;
    // Extract HTTP status code if present
    const statusMatch = msg.match(/HTTP error! status: (\d+)/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);
      // 408 Request Timeout and 429 Too Many Requests are retryable
      if (status === 408 || status === 429) return true;
      // Other 4xx errors are permanent (validation, not found, forbidden)
      if (status >= 400 && status < 500) return false;
      // 5xx server errors are retryable
      if (status >= 500) return true;
    }

    // Auth errors are permanent
    if (msg.includes('No authentication token found')) return false;
  }

  // Default: assume retryable (benefit of the doubt)
  return true;
}

/**
 * Get all pending entries from localStorage
 */
export function getPendingEntries(): PendingEntry[] {
  try {
    const stored = localStorage.getItem(PENDING_ENTRIES_KEY);
    if (!stored) return [];
    const entries = JSON.parse(stored) as PendingEntry[];
    // Migration: add status field if missing (from old format)
    return entries.map(e => ({
      ...e,
      status: e.status || 'pending',
    }));
  } catch (error) {
    console.error('❌ [OFFLINE] Failed to read pending entries:', error);
    return [];
  }
}

/**
 * Get only retryable pending entries (not permanently failed, not exceeded max retries)
 */
export function getRetryableEntries(): PendingEntry[] {
  return getPendingEntries().filter(
    p => p.status !== 'failed' && p.retryCount < MAX_RETRY_COUNT
  );
}

/**
 * Get permanently failed entries
 */
export function getFailedEntries(): PendingEntry[] {
  return getPendingEntries().filter(
    p => p.status === 'failed' || p.retryCount >= MAX_RETRY_COUNT
  );
}

/**
 * Save pending entries to localStorage
 */
function savePendingEntries(entries: PendingEntry[]): void {
  localStorage.setItem(PENDING_ENTRIES_KEY, JSON.stringify(entries));
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
      status: 'pending',
    };

    if (existingIndex >= 0) {
      // Preserve retry count if re-queuing an existing entry
      newPending.retryCount = pending[existingIndex].retryCount;
      pending[existingIndex] = newPending;
      console.log('📝 [OFFLINE] Updated pending entry:', entry.id);
    } else {
      pending.push(newPending);
      console.log('📝 [OFFLINE] Added pending entry:', entry.id);
    }

    savePendingEntries(pending);
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
    savePendingEntries(filtered);
    console.log('✅ [OFFLINE] Removed synced entry:', entryId);
  } catch (error) {
    console.error('❌ [OFFLINE] Failed to remove pending entry:', error);
  }
}

/**
 * Mark a pending entry as failed with error info
 */
export function markEntryFailed(entryId: string, error: string, permanent: boolean): void {
  try {
    const pending = getPendingEntries();
    const entry = pending.find(p => p.entry.id === entryId);
    if (entry) {
      entry.retryCount++;
      entry.lastError = error;
      entry.lastAttempt = new Date().toISOString();
      if (permanent || entry.retryCount >= MAX_RETRY_COUNT) {
        entry.status = 'failed';
      }
      savePendingEntries(pending);
    }
  } catch (error) {
    console.error('❌ [OFFLINE] Failed to mark entry as failed:', error);
  }
}

/**
 * Mark entry as syncing (in-progress)
 */
export function markEntrySyncing(entryId: string): void {
  try {
    const pending = getPendingEntries();
    const entry = pending.find(p => p.entry.id === entryId);
    if (entry) {
      entry.status = 'syncing';
      savePendingEntries(pending);
    }
  } catch (error) {
    console.error('❌ [OFFLINE] Failed to mark entry as syncing:', error);
  }
}

/**
 * Reset a failed entry back to pending for manual retry
 */
export function resetFailedEntry(entryId: string): void {
  try {
    const pending = getPendingEntries();
    const entry = pending.find(p => p.entry.id === entryId);
    if (entry) {
      entry.status = 'pending';
      entry.retryCount = 0;
      entry.lastError = undefined;
      entry.lastAttempt = undefined;
      savePendingEntries(pending);
      console.log('🔄 [OFFLINE] Reset failed entry:', entryId);
    }
  } catch (error) {
    console.error('❌ [OFFLINE] Failed to reset entry:', error);
  }
}

/**
 * Discard a failed entry permanently
 */
export function discardFailedEntry(entryId: string): void {
  removePendingEntry(entryId);
  console.log('🗑️ [OFFLINE] Discarded failed entry:', entryId);
}

/**
 * Clear all pending entries (use with caution)
 */
export function clearPendingEntries(): void {
  localStorage.removeItem(PENDING_ENTRIES_KEY);
  console.log('🗑️ [OFFLINE] Cleared all pending entries');
}

/**
 * Get count of pending entries (excludes permanently failed)
 */
export function getPendingCount(): number {
  return getPendingEntries().filter(p => p.status !== 'failed').length;
}

/**
 * Get count of failed entries
 */
export function getFailedCount(): number {
  return getFailedEntries().length;
}

/**
 * Check if there are any pending entries
 */
export function hasPendingEntries(): boolean {
  return getPendingCount() > 0;
}

/**
 * Get the max retry count constant
 */
export function getMaxRetryCount(): number {
  return MAX_RETRY_COUNT;
}
