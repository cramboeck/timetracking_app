import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Monitor, Wifi, WifiOff, Shield, RefreshCw } from 'lucide-react';
import { ninjaApi, NinjaDevice } from '../../services/api';

interface TicketNinjaInfoProps {
  deviceId: string;
  ninjaAlertId?: string;
  deviceName?: string;
}

export const TicketNinjaInfo = ({ deviceId, ninjaAlertId, deviceName }: TicketNinjaInfoProps) => {
  const [device, setDevice] = useState<NinjaDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDeviceInfo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ninjaApi.getDevice(deviceId);
      if (result.success) {
        setDevice(result.data);
      } else {
        setError('Gerätedaten nicht verfügbar');
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    loadDeviceInfo();
  }, [loadDeviceInfo]);

  if (loading) {
    return (
      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-500"></div>
          <span className="text-sm text-orange-700 dark:text-orange-300">Lade NinjaRMM Daten...</span>
        </div>
      </div>
    );
  }

  if (error && !device) {
    return (
      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-orange-500" size={16} />
            <span className="text-sm text-orange-700 dark:text-orange-300">{error}</span>
          </div>
          <button
            onClick={loadDeviceInfo}
            className="p-1 text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-800/30 rounded"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="text-orange-600 dark:text-orange-400" size={18} />
          <span className="font-medium text-orange-800 dark:text-orange-200">NinjaRMM Alert</span>
        </div>
        {ninjaAlertId && (
          <span className="text-xs font-mono text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-800/50 px-2 py-0.5 rounded">
            {ninjaAlertId.substring(0, 12)}...
          </span>
        )}
      </div>

      {device && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-2 bg-white dark:bg-dark-200 rounded-lg">
            <div className="p-2 bg-orange-100 dark:bg-orange-800/30 rounded-lg">
              <Monitor size={20} className="text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 dark:text-white truncate">
                  {device.displayName || device.systemName}
                </span>
                {device.offline ? (
                  <WifiOff size={14} className="text-red-500" title="Offline" />
                ) : (
                  <Wifi size={14} className="text-green-500" title="Online" />
                )}
              </div>
              <div className="text-sm text-gray-500 dark:text-dark-400">
                {device.osName}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            {device.lastLoggedInUser && (
              <div className="bg-white dark:bg-dark-200 rounded p-2">
                <div className="text-xs text-gray-500 dark:text-dark-400">Benutzer</div>
                <div className="font-medium text-gray-900 dark:text-white truncate">
                  {device.lastLoggedInUser}
                </div>
              </div>
            )}
            {device.privateIp && (
              <div className="bg-white dark:bg-dark-200 rounded p-2">
                <div className="text-xs text-gray-500 dark:text-dark-400">IP-Adresse</div>
                <div className="font-mono text-gray-900 dark:text-white">
                  {device.privateIp}
                </div>
              </div>
            )}
            {device.lastContactTime && (
              <div className="bg-white dark:bg-dark-200 rounded p-2">
                <div className="text-xs text-gray-500 dark:text-dark-400">Letzter Kontakt</div>
                <div className="text-gray-900 dark:text-white">
                  {new Date(device.lastContactTime).toLocaleString('de-DE')}
                </div>
              </div>
            )}
            {device.organizationName && (
              <div className="bg-white dark:bg-dark-200 rounded p-2">
                <div className="text-xs text-gray-500 dark:text-dark-400">Organisation</div>
                <div className="font-medium text-gray-900 dark:text-white truncate">
                  {device.organizationName}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!device && deviceName && (
        <div className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-300">
          <Monitor size={16} />
          <span>{deviceName}</span>
        </div>
      )}
    </div>
  );
};
