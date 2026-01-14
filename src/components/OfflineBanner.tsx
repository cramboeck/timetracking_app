import { WifiOff, Wifi, Loader2, Check, AlertCircle } from 'lucide-react';

interface OfflineBannerProps {
  isOnline: boolean;
  wasOffline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  syncError?: string | null;
}

export function OfflineBanner({ isOnline, wasOffline, pendingCount, isSyncing, syncError }: OfflineBannerProps) {
  // Don't show anything if online, no pending entries, and wasn't recently offline
  if (isOnline && !wasOffline && pendingCount === 0 && !isSyncing && !syncError) {
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

  // Sync error state
  if (syncError) {
    return (
      <div className="bg-red-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
        <AlertCircle size={16} />
        <span>Synchronisierung fehlgeschlagen: {syncError}</span>
      </div>
    );
  }

  // Back online with pending entries still to sync
  if (pendingCount > 0) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
        <Wifi size={16} />
        <span>{pendingCount} {pendingCount === 1 ? 'Eintrag wartet' : 'Einträge warten'} auf Synchronisierung</span>
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
