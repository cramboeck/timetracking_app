import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { TimeEntry } from '../types';
import { entriesApi } from '../services/api';
import {
  discardFailedEntry,
  getFailedCount,
  getPendingCount,
  getRetryableEntries,
  isRetryableError,
  markEntryFailed,
  removePendingEntry,
  resetFailedEntry,
} from '../utils/offlineStorage';

interface UseOfflineEntrySyncArgs {
  isOnline: boolean;
  wasOffline: boolean;
  setEntries: Dispatch<SetStateAction<TimeEntry[]>>;
}

interface UseOfflineEntrySyncReturn {
  isSyncing: boolean;
  syncError: string | null;
  pendingCount: number;
  failedCount: number;
  /** Re-read pending + failed counts from offline storage. Call this after
   *  `addPendingEntry` so the OfflineBanner badge updates. */
  refreshCounts: () => void;
  /** Manually kick off a sync pass (used by the OfflineBanner "Retry all" button). */
  syncPendingEntries: () => Promise<void>;
  handleRetryFailedEntry: (entryId: string) => void;
  handleDiscardFailedEntry: (entryId: string) => void;
}

/**
 * Manages background sync of entries that were saved to local storage while
 * offline (or while the server was unreachable). Owns:
 *   - Two counters (pending / permanently-failed) backed by offlineStorage
 *   - A mutex that prevents concurrent sync passes
 *   - Auto-sync on `online` transition + a 30 s periodic retry
 *   - Retry / Discard handlers consumed by OfflineBanner
 *
 * `setEntries` is taken as an argument because the sync writes the
 * server-returned (id-stamped) entry back into the App's entries state, and
 * Discard removes the local entry entirely.
 */
export function useOfflineEntrySync({
  isOnline,
  wasOffline,
  setEntries,
}: UseOfflineEntrySyncArgs): UseOfflineEntrySyncReturn {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(() => getPendingCount());
  const [failedCount, setFailedCount] = useState(() => getFailedCount());
  const syncMutexRef = useRef(false);

  const refreshCounts = useCallback(() => {
    setPendingCount(getPendingCount());
    setFailedCount(getFailedCount());
  }, []);

  const syncPendingEntries = useCallback(async () => {
    if (syncMutexRef.current) {
      console.log('🔒 [SYNC] Sync already in progress, skipping');
      return;
    }

    const pending = getRetryableEntries();
    if (pending.length === 0) return;

    syncMutexRef.current = true;
    console.log('🔄 [SYNC] Starting sync of', pending.length, 'pending entries');
    setIsSyncing(true);
    setSyncError(null);

    let successCount = 0;
    let failCount = 0;
    let permanentFailCount = 0;

    for (const { entry, action } of pending) {
      try {
        if (action === 'update') {
          const response = await entriesApi.update(entry.id, entry);
          setEntries(prev => prev.map(e => e.id === entry.id ? response.data : e));
        } else {
          // Send clientId for idempotent creation
          const response = await entriesApi.create({ ...entry, clientId: entry.id });
          setEntries(prev => prev.map(e => e.id === entry.id ? response.data : e));
        }
        removePendingEntry(entry.id);
        successCount++;
        console.log('✅ [SYNC] Synced entry:', entry.id);
      } catch (error) {
        const retryable = isRetryableError(error);
        const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
        markEntryFailed(entry.id, errorMessage, !retryable);
        console.error('❌ [SYNC] Failed to sync entry:', entry.id, retryable ? '(will retry)' : '(permanent)', error);
        failCount++;
        if (!retryable) permanentFailCount++;
      }
    }

    setPendingCount(getPendingCount());
    setFailedCount(getFailedCount());
    setIsSyncing(false);
    syncMutexRef.current = false;

    if (permanentFailCount > 0) {
      setSyncError(`${permanentFailCount} ${permanentFailCount === 1 ? 'Eintrag konnte' : 'Einträge konnten'} nicht synchronisiert werden (Daten ungültig)`);
    } else if (failCount > 0) {
      setSyncError(`${failCount} ${failCount === 1 ? 'Eintrag' : 'Einträge'} – Retry läuft automatisch`);
      setTimeout(() => setSyncError(null), 5000);
    }

    console.log('🔄 [SYNC] Sync complete:', successCount, 'synced,', failCount, 'failed (' + permanentFailCount + ' permanent)');
  }, [setEntries]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && wasOffline) {
      console.log('🌐 [SYNC] Back online, checking for pending entries...');
      syncPendingEntries();
    }
  }, [isOnline, wasOffline, syncPendingEntries]);

  // Periodic sync retry every 30 seconds while there are retryable pending entries
  useEffect(() => {
    if (!isOnline) return;

    const interval = setInterval(() => {
      const retryable = getRetryableEntries();
      if (retryable.length > 0) {
        console.log('🔄 [SYNC] Periodic retry: found', retryable.length, 'retryable entries');
        syncPendingEntries();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isOnline, syncPendingEntries]);

  const handleRetryFailedEntry = useCallback((entryId: string) => {
    resetFailedEntry(entryId);
    refreshCounts();
    syncPendingEntries();
  }, [syncPendingEntries, refreshCounts]);

  const handleDiscardFailedEntry = useCallback((entryId: string) => {
    discardFailedEntry(entryId);
    setEntries(prev => prev.filter(e => e.id !== entryId));
    refreshCounts();
  }, [setEntries, refreshCounts]);

  return {
    isSyncing,
    syncError,
    pendingCount,
    failedCount,
    refreshCounts,
    syncPendingEntries,
    handleRetryFailedEntry,
    handleDiscardFailedEntry,
  };
}
