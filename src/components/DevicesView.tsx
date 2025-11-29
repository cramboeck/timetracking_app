import { useState, useEffect, useMemo } from 'react';
import {
  Monitor, Wifi, WifiOff, Search, RefreshCw, ExternalLink,
  X, Cpu, HardDrive, Globe, Building, AlertTriangle
} from 'lucide-react';
import { ninjaApi, NinjaDevice, NinjaRMMConfig } from '../services/api';

export const DevicesView = () => {
  const [devices, setDevices] = useState<NinjaDevice[]>([]);
  const [config, setConfig] = useState<NinjaRMMConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<NinjaDevice | null>(null);
  const [refreshingDevice, setRefreshingDevice] = useState(false);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [configRes, devicesRes] = await Promise.all([
        ninjaApi.getConfig(),
        ninjaApi.getDevices(),
      ]);
      if (configRes.success) setConfig(configRes.data);
      if (devicesRes.success) setDevices(devicesRes.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setError('');
      await ninjaApi.syncAll();
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleRefreshDevice = async (deviceId: string) => {
    try {
      setRefreshingDevice(true);
      setError('');
      const result = await ninjaApi.refreshDeviceDetails(deviceId);
      if (result.success) {
        setDevices(prev => prev.map(d => d.id === deviceId ? result.data : d));
        if (selectedDevice?.id === deviceId) {
          setSelectedDevice(result.data);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRefreshingDevice(false);
    }
  };

  const filteredDevices = useMemo(() => {
    return devices.filter(device => {
      const matchesSearch = search === '' ||
        device.systemName.toLowerCase().includes(search.toLowerCase()) ||
        device.displayName?.toLowerCase().includes(search.toLowerCase()) ||
        device.organizationName.toLowerCase().includes(search.toLowerCase()) ||
        device.customerName?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'online' && !device.offline) ||
        (statusFilter === 'offline' && device.offline);

      return matchesSearch && matchesStatus;
    });
  }, [devices, search, statusFilter]);

  const onlineCount = devices.filter(d => !d.offline).length;
  const offlineCount = devices.filter(d => d.offline).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  if (!config?.isConnected) {
    return (
      <div className="p-6">
        <div className="text-center py-12 bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200">
          <Monitor size={48} className="mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            NinjaRMM nicht verbunden
          </h3>
          <p className="text-gray-500 dark:text-dark-400 mb-4">
            Verbinde NinjaRMM in den Einstellungen um Geräte zu sehen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Geräte</h2>
          <p className="text-sm text-gray-500 dark:text-dark-400">
            {devices.length} Geräte synchronisiert
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-dark disabled:opacity-50"
        >
          <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Sync...' : 'Sync'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-4">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <Wifi size={18} />
          <span className="font-medium">{onlineCount} Online</span>
        </div>
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <WifiOff size={18} />
          <span className="font-medium">{offlineCount} Offline</span>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Gerät suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-4 py-2 border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
        >
          <option value="all">Alle Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
        </select>
      </div>

      {/* Device List */}
      <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-dark-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase">Gerät</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase hidden md:table-cell">Typ</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase hidden lg:table-cell">Kunde</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase hidden lg:table-cell">Letzter Kontakt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-dark-200">
            {filteredDevices.map(device => (
              <tr
                key={device.id}
                onClick={() => setSelectedDevice(device)}
                className="hover:bg-gray-50 dark:hover:bg-dark-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  {device.offline ? (
                    <WifiOff size={18} className="text-red-500" />
                  ) : (
                    <Wifi size={18} className="text-green-500" />
                  )}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {device.displayName || device.systemName}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-dark-400">{device.organizationName}</p>
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-gray-600 dark:text-dark-300">
                  {device.nodeClass?.replace(/_/g, ' ')}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-gray-600 dark:text-dark-300">
                  {device.customerName || '-'}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-gray-500 dark:text-dark-400 text-sm">
                  {device.lastContact ? new Date(device.lastContact).toLocaleString('de-DE') : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredDevices.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-dark-400">
            Keine Geräte gefunden
          </div>
        )}
      </div>

      {/* Device Detail Modal */}
      {selectedDevice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-100 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-200">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${selectedDevice.offline ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                  {selectedDevice.offline ? (
                    <WifiOff className="text-red-600 dark:text-red-400" size={20} />
                  ) : (
                    <Wifi className="text-green-600 dark:text-green-400" size={20} />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {selectedDevice.displayName || selectedDevice.systemName}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-dark-400">
                    {selectedDevice.offline ? 'Offline' : 'Online'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDevice(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* System Info */}
                <div className="bg-gray-50 dark:bg-dark-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Cpu size={16} className="text-gray-500" />
                    <h4 className="font-medium text-gray-900 dark:text-white">System</h4>
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Systemname</dt>
                      <dd className="text-gray-900 dark:text-white font-medium">{selectedDevice.systemName}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Typ</dt>
                      <dd className="text-gray-900 dark:text-white">{selectedDevice.nodeClass?.replace(/_/g, ' ') || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Betriebssystem</dt>
                      <dd className="text-gray-900 dark:text-white">{selectedDevice.osName || '-'}</dd>
                    </div>
                  </dl>
                </div>

                {/* Hardware Info */}
                <div className="bg-gray-50 dark:bg-dark-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <HardDrive size={16} className="text-gray-500" />
                    <h4 className="font-medium text-gray-900 dark:text-white">Hardware</h4>
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Hersteller</dt>
                      <dd className="text-gray-900 dark:text-white">{selectedDevice.manufacturer || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Modell</dt>
                      <dd className="text-gray-900 dark:text-white">{selectedDevice.model || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Seriennummer</dt>
                      <dd className="text-gray-900 dark:text-white font-mono text-xs">{selectedDevice.serialNumber || '-'}</dd>
                    </div>
                  </dl>
                </div>

                {/* Network & Access */}
                <div className="bg-gray-50 dark:bg-dark-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Globe size={16} className="text-gray-500" />
                    <h4 className="font-medium text-gray-900 dark:text-white">Netzwerk & Zugriff</h4>
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Öffentliche IP</dt>
                      <dd className="text-gray-900 dark:text-white font-mono">{selectedDevice.publicIp || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Letzter Kontakt</dt>
                      <dd className="text-gray-900 dark:text-white">
                        {selectedDevice.lastContact ? new Date(selectedDevice.lastContact).toLocaleString('de-DE') : '-'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Letzter Benutzer</dt>
                      <dd className="text-gray-900 dark:text-white">{selectedDevice.lastLoggedInUser || '-'}</dd>
                    </div>
                  </dl>
                </div>

                {/* Organization */}
                <div className="bg-gray-50 dark:bg-dark-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Building size={16} className="text-gray-500" />
                    <h4 className="font-medium text-gray-900 dark:text-white">Organisation</h4>
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">NinjaRMM Org</dt>
                      <dd className="text-gray-900 dark:text-white">{selectedDevice.organizationName}</dd>
                    </div>
                    {selectedDevice.customerName && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500 dark:text-dark-400">Kunde</dt>
                        <dd className="text-gray-900 dark:text-white font-medium">{selectedDevice.customerName}</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Synchronisiert</dt>
                      <dd className="text-gray-900 dark:text-white">
                        {selectedDevice.syncedAt ? new Date(selectedDevice.syncedAt).toLocaleString('de-DE') : '-'}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between gap-3 p-4 border-t border-gray-200 dark:border-dark-200">
              <div className="flex gap-2">
                <button
                  onClick={() => handleRefreshDevice(selectedDevice.id)}
                  disabled={refreshingDevice}
                  className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-dark disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={16} className={refreshingDevice ? 'animate-spin' : ''} />
                  {refreshingDevice ? 'Lade...' : 'Details laden'}
                </button>
                <a
                  href={`${config?.instanceUrl || 'https://eu.ninjarmm.com'}/#/deviceDashboard/${selectedDevice.ninjaId}/overview`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <ExternalLink size={16} />
                  In NinjaRMM öffnen
                </a>
              </div>
              <button
                onClick={() => setSelectedDevice(null)}
                className="px-4 py-2 text-gray-700 dark:text-dark-300 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg transition-colors"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
