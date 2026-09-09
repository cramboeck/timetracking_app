import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { TimeEntry } from '../types';
import { entriesApi, ticketsApi } from '../services/api';
import { queryClient } from '../lib/queryClient';
import {
  discardFailedComment,
  discardFailedEntry,
  getFailedCommentCount,
  getFailedCount,
  getPendingCommentCount,
  getPendingCount,
  getRetryableComments,
  getRetryableEntries,
  isRetryableError,
  markCommentFailed,
  markEntryFailed,
  removePendingComment,
  removePendingEntry,
  resetFailedComment,
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
  handleRetryFailedComment: (clientId: string) => void;
  handleDiscardFailedComment: (clientId: string) => void;
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
  // Zähler decken Zeiteinträge UND Ticket-Kommentare ab (eine Offline-Queue
  // aus Nutzersicht — die Banner-Texte bleiben generisch „Einträge")
  const [pendingCount, setPendingCount] = useState(() => getPendingCount() + getPendingCommentCount());
  const [failedCount, setFailedCount] = useState(() => getFailedCount() + getFailedCommentCount());
  const syncMutexRef = useRef(false);

  const refreshCounts = useCallback(() => {
    setPendingCount(getPendingCount() + getPendingCommentCount());
    setFailedCount(getFailedCount() + getFailedCommentCount());
  }, []);

  const syncPendingEntries = useCallback(async () => {
    if (syncMutexRef.current) {
      console.log('🔒 [SYNC] Sync already in progress, skipping');
      return;
    }

    const pending = getRetryableEntries();
    const pendingComments = getRetryableComments();
    if (pending.length === 0 && pendingComments.length === 0) return;

    syncMutexRef.current = true;
    console.log('🔄 [SYNC] Starting sync of', pending.length, 'pending entries +', pendingComments.length, 'comments');
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
        // Update auf einen serverseitig geloeschten Eintrag (404): kann nie
        // gelingen — still aus der Queue nehmen statt ewig rot zu bannern
        // (der Eintrag wurde bewusst geloescht; ein queued Create fuer
        // dieselbe ID waere in der Queue davor gelaufen)
        const status = (error as { status?: number })?.status;
        if (action === 'update' && status === 404) {
          removePendingEntry(entry.id);
          console.log('🗑️ [SYNC] Queued update verworfen — Eintrag existiert nicht mehr:', entry.id);
          continue;
        }
        const retryable = isRetryableError(error);
        const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
        markEntryFailed(entry.id, errorMessage, !retryable);
        console.error('❌ [SYNC] Failed to sync entry:', entry.id, retryable ? '(will retry)' : '(permanent)', error);
        failCount++;
        if (!retryable) permanentFailCount++;
      }
    }

    // Ticket-Kommentare nachschieben — clientId macht den Retry idempotent
    // (Server nutzt sie als Kommentar-ID und liefert Bestehendes zurück)
    for (const comment of pendingComments) {
      try {
        await ticketsApi.addComment(comment.ticketId, comment.content, {
          isInternal: comment.isInternal,
          notifyCustomer: comment.notifyCustomer,
          replyViaEmail: comment.replyViaEmail,
          clientId: comment.clientId,
        });
        removePendingComment(comment.clientId);
        // Offenes Ticket-Detail zeigt den Kommentar beim nächsten Fokus
        queryClient.invalidateQueries({ queryKey: ['ticket', comment.ticketId] });
        successCount++;
        console.log('✅ [SYNC] Synced ticket comment:', comment.clientId);
      } catch (error) {
        const retryable = isRetryableError(error);
        const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
        markCommentFailed(comment.clientId, errorMessage, !retryable);
        console.error('❌ [SYNC] Failed to sync comment:', comment.clientId, retryable ? '(will retry)' : '(permanent)', error);
        failCount++;
        if (!retryable) permanentFailCount++;
      }
    }

    setPendingCount(getPendingCount() + getPendingCommentCount());
    setFailedCount(getFailedCount() + getFailedCommentCount());
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

  // Periodic sync retry every 30 seconds while there are retryable pending items
  useEffect(() => {
    if (!isOnline) return;

    const interval = setInterval(() => {
      const retryable = getRetryableEntries().length + getRetryableComments().length;
      if (retryable > 0) {
        console.log('🔄 [SYNC] Periodic retry: found', retryable, 'retryable items');
        syncPendingEntries();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isOnline, syncPendingEntries]);

  // Andere Komponenten (z.B. TicketDetail) queuen direkt in offlineStorage —
  // das Event hält Banner-Zähler aktuell und stößt sofort einen Sync-Versuch
  // an (der Server kann trotz „online" gerade eben erreichbar geworden sein)
  useEffect(() => {
    const onQueueChanged = () => {
      refreshCounts();
      if (isOnline) syncPendingEntries();
    };
    window.addEventListener('offline-queue-changed', onQueueChanged);
    return () => window.removeEventListener('offline-queue-changed', onQueueChanged);
  }, [isOnline, refreshCounts, syncPendingEntries]);

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

  const handleRetryFailedComment = useCallback((clientId: string) => {
    resetFailedComment(clientId);
    refreshCounts();
    syncPendingEntries();
  }, [syncPendingEntries, refreshCounts]);

  const handleDiscardFailedComment = useCallback((clientId: string) => {
    discardFailedComment(clientId);
    refreshCounts();
  }, [refreshCounts]);

  return {
    isSyncing,
    syncError,
    pendingCount,
    failedCount,
    refreshCounts,
    syncPendingEntries,
    handleRetryFailedEntry,
    handleDiscardFailedEntry,
    handleRetryFailedComment,
    handleDiscardFailedComment,
  };
}
