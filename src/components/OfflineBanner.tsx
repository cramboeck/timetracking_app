import { useState } from 'react';
import { WifiOff, Wifi, Loader2, Check, AlertCircle, RefreshCw, ChevronDown, ChevronUp, Trash2, RotateCcw } from 'lucide-react';
import { getFailedEntries, type PendingEntry } from '../utils/offlineStorage';

interface OfflineBannerProps {
  isOnline: boolean;
  wasOffline: boolean;
  pendingCount: number;
  failedCount: number;
  isSyncing: boolean;
  syncError?: string | null;
  onRetryFailed?: (entryId: string) => void;
  onDiscardFailed?: (entryId: string) => void;
  onRetryAll?: () => void;
}

export function OfflineBanner({ isOnline, wasOffline, pendingCount, failedCount, isSyncing, syncError, onRetryFailed, onDiscardFailed, onRetryAll }: OfflineBannerProps) {
  const [showFailedDetails, setShowFailedDetails] = useState(false);

  // Don't show anything if online, no pending entries, no failed, and wasn't recently offline
  if (isOnline && !wasOffline && pendingCount === 0 && failedCount === 0 && !isSyncing && !syncError) {
    return null;
  }

  // Offline state
  if (!isOnline) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
        <WifiOff size={16} />
        <span>
          Du bist offline
          {pendingCount > 0 && (
            <> – {pendingCount} {pendingCount === 1 ? 'Eintrag wartet' : 'Einträge warten'} auf Synchronisierung</>
          )}
        </span>
      </div>
    );
  }

  // Syncing state
  if (isSyncing) {
    return (
      <div className="bg-blue-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
        <Loader2 size={16} className="animate-spin" />
        <span>Synchronisiere {pendingCount} {pendingCount === 1 ? 'Eintrag' : 'Einträge'}...</span>
      </div>
    );
  }

  // Failed entries banner with details
  if (failedCount > 0) {
    const failedEntries = showFailedDetails ? getFailedEntries() : [];

    return (
      <div className="bg-red-500 text-white text-sm font-medium">
        <div className="px-4 py-2 flex items-center justify-center gap-2">
          <AlertCircle size={16} />
          <span>
            {failedCount} {failedCount === 1 ? 'Eintrag konnte' : 'Einträge konnten'} nicht synchronisiert werden
          </span>
          <button
            onClick={() => setShowFailedDetails(!showFailedDetails)}
            className="ml-2 hover:bg-red-600 rounded p-1 transition-colors"
          >
            {showFailedDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {showFailedDetails && failedEntries.length > 0 && (
          <div className="border-t border-red-400 px-4 py-2 space-y-2 max-h-48 overflow-y-auto">
            {failedEntries.map((pe: PendingEntry) => (
              <div key={pe.entry.id} className="flex items-center gap-2 text-xs bg-red-600/50 rounded px-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <div className="truncate">
                    {pe.entry.description || 'Kein Beschreibung'} – {new Date(pe.entry.startTime).toLocaleDateString('de-DE')}
                  </div>
                  <div className="text-red-200 truncate">{pe.lastError}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => onRetryFailed?.(pe.entry.id)}
                    className="hover:bg-red-700 rounded p-1 transition-colors"
                    title="Erneut versuchen"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    onClick={() => onDiscardFailed?.(pe.entry.id)}
                    className="hover:bg-red-700 rounded p-1 transition-colors"
                    title="Verwerfen"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Sync error state (transient)
  if (syncError) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
        <RefreshCw size={16} />
        <span>{syncError}</span>
        {onRetryAll && (
          <button
            onClick={onRetryAll}
            className="ml-2 hover:bg-amber-600 rounded px-2 py-0.5 transition-colors text-xs"
          >
            Jetzt synchronisieren
          </button>
        )}
      </div>
    );
  }

  // Back online with pending entries still to sync
  if (pendingCount > 0) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
        <Wifi size={16} />
        <span>{pendingCount} {pendingCount === 1 ? 'Eintrag wartet' : 'Einträge warten'} auf Synchronisierung</span>
        {onRetryAll && (
          <button
            onClick={onRetryAll}
            className="ml-2 hover:bg-amber-600 rounded px-2 py-0.5 transition-colors text-xs"
          >
            Jetzt synchronisieren
          </button>
        )}
      </div>
    );
  }

  // Just came back online, all synced
  if (wasOffline) {
    return (
      <div className="bg-green-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium animate-fade-in">
        <Check size={16} />
        <span>Wieder online – alle Einträge synchronisiert</span>
      </div>
    );
  }

  return null;
}
