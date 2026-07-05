import { useState, useEffect, useMemo } from 'react';
import { Monitor, Link, ChevronRight, Wifi, WifiOff, AlertTriangle, Unlink } from 'lucide-react';
import { ninjaApi, NinjaDevice } from '../../services/api';
import { SearchableSelect } from '../SearchableSelect';

interface TicketDeviceLinkProps {
  ticketId: string;
  customerId: string;
  linkedDeviceId?: string;
  onDeviceChange: (deviceId: string | null) => Promise<void>;
}

export const TicketDeviceLink = ({
  ticketId: _ticketId,
  customerId,
  linkedDeviceId,
  onDeviceChange,
}: TicketDeviceLinkProps) => {
  // Note: ticketId is available for future use (e.g., to persist device link on backend)
  const [expanded, setExpanded] = useState(false);
  const [devices, setDevices] = useState<NinjaDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Find the currently linked device
  const linkedDevice = useMemo(() => {
    return devices.find(d => d.id === linkedDeviceId);
  }, [devices, linkedDeviceId]);

  // Load devices when panel is expanded
  useEffect(() => {
    if (expanded && devices.length === 0) {
      loadDevices();
    }
  }, [expanded]);

  const loadDevices = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ninjaApi.getDevices({ customerId });
      if (result.success) {
        setDevices(result.data);
      } else {
        setError('Geräte konnten nicht geladen werden');
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Geräte');
    } finally {
      setLoading(false);
    }
  };

  const handleDeviceChange = async (deviceId: string) => {
    setSaving(true);
    setError(null);
    try {
      await onDeviceChange(deviceId || null);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
    setSaving(true);
    setError(null);
    try {
      await onDeviceChange(null);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Entfernen der Verknüpfung');
    } finally {
      setSaving(false);
    }
  };

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  // Build options for SearchableSelect
  const deviceOptions = useMemo(() => {
    return devices.map(device => ({
      value: device.id,
      label: device.displayName || device.systemName,
      sublabel: [
        device.osName,
        device.offline ? 'Offline' : 'Online',
      ].filter(Boolean).join(' • '),
    }));
  }, [devices]);

  // Get status indicator for a device
  const getDeviceStatusIcon = (device: NinjaDevice) => {
    if (device.offline) {
      return <WifiOff size={14} className="text-red-500" />;
    }
    return <Wifi size={14} className="text-green-500" />;
  };

  // Check if device has warnings (simplified check based on available data)
  const hasWarnings = (device: NinjaDevice) => {
    // Could be extended to check for alerts, outdated patches, etc.
    return device.offline;
  };

  return (
    <div className="border border-gray-200 dark:border-dark-border rounded-lg">
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Monitor size={16} className="text-gray-500 dark:text-dark-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-dark-500">
            Verknüpftes Gerät
          </span>
          {linkedDevice && (
            <span className="px-1.5 py-0.5 text-xs bg-accent-lighter text-accent-dark dark:bg-accent-primary/50 dark:text-accent-primary rounded flex items-center gap-1">
              <Link size={10} />
              {linkedDevice.displayName || linkedDevice.systemName}
            </span>
          )}
        </div>
        <ChevronRight
          size={16}
          className={`text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-gray-200 dark:border-dark-border px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent-primary"></div>
            </div>
          ) : error ? (
            <div className="text-sm text-red-500 dark:text-red-400 text-center py-4">
              {error}
            </div>
          ) : devices.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-dark-400 text-center py-4">
              Keine Geräte für diesen Kunden verfügbar
            </div>
          ) : (
            <div className="space-y-4">
              {/* Currently linked device info */}
              {linkedDevice && (
                <div className="bg-gray-50 dark:bg-dark-100 rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-white dark:bg-dark-200 rounded-lg">
                        <Monitor size={20} className="text-gray-600 dark:text-dark-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white truncate">
                            {linkedDevice.displayName || linkedDevice.systemName}
                          </span>
                          {getDeviceStatusIcon(linkedDevice)}
                          {hasWarnings(linkedDevice) && (
                            <AlertTriangle size={14} className="text-yellow-500" />
                          )}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-dark-400 space-y-0.5">
                          {linkedDevice.osName && (
                            <div>{linkedDevice.osName}</div>
                          )}
                          {linkedDevice.lastLoggedInUser && (
                            <div>Benutzer: {linkedDevice.lastLoggedInUser}</div>
                          )}
                          {linkedDevice.privateIp && (
                            <div>IP: {linkedDevice.privateIp}</div>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleUnlink}
                      disabled={saving}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="Verknüpfung entfernen"
                    >
                      <Unlink size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* Device selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-400 mb-1.5">
                  {linkedDevice ? 'Anderes Gerät verknüpfen' : 'Gerät verknüpfen'}
                </label>
                <SearchableSelect
                  options={deviceOptions}
                  value={linkedDeviceId || ''}
                  onChange={handleDeviceChange}
                  placeholder="Gerät auswählen..."
                  emptyMessage="Keine Geräte gefunden"
                  disabled={saving}
                  allowClear={false}
                />
              </div>

              {/* Device count info */}
              <div className="text-xs text-gray-500 dark:text-dark-400 flex items-center gap-2">
                <span>{devices.length} Gerät{devices.length !== 1 ? 'e' : ''} verfügbar</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Wifi size={12} className="text-green-500" />
                  {devices.filter(d => !d.offline).length} online
                </span>
                {devices.some(d => d.offline) && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <WifiOff size={12} className="text-red-500" />
                      {devices.filter(d => d.offline).length} offline
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
