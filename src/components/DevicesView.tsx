import { useState, useEffect, useMemo } from 'react';
import {
  Monitor, Wifi, WifiOff, Search, RefreshCw, ExternalLink,
  X, Cpu, HardDrive, Globe, Building, AlertTriangle, Package, ChevronDown, ChevronUp, Shield
} from 'lucide-react';
import { ninjaApi, NinjaDevice, NinjaRMMConfig, NinjaDeviceSoftware, NinjaDeviceOSPatch } from '../services/api';
import { Button, IconButton } from './ui/Button';

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

  // Software
  const [showSoftware, setShowSoftware] = useState(false);
  const [software, setSoftware] = useState<NinjaDeviceSoftware[]>([]);
  const [softwareLoading, setSoftwareLoading] = useState(false);
  const [softwareLastFetched, setSoftwareLastFetched] = useState<string | null>(null);
  const [softwareSearch, setSoftwareSearch] = useState('');
  const [softwareSort, setSoftwareSort] = useState<'name' | 'date'>('name');

  // OS Patches (Windows Updates)
  const [showPatches, setShowPatches] = useState(false);
  const [installedPatches, setInstalledPatches] = useState<NinjaDeviceOSPatch[]>([]);
  const [pendingPatches, setPendingPatches] = useState<NinjaDeviceOSPatch[]>([]);
  const [patchesLoading, setPatchesLoading] = useState(false);
  const [patchesLastFetched, setPatchesLastFetched] = useState<string | null>(null);
  const [patchesSearch, setPatchesSearch] = useState('');
  const [patchesTab, setPatchesTab] = useState<'pending' | 'installed'>('pending');

  useEffect(() => {
    loadDataAndSync();
  }, []);

  const loadData = async () => {
    try {
      const [configRes, devicesRes] = await Promise.all([
        ninjaApi.getConfig(),
        ninjaApi.getDevices(),
      ]);
      if (configRes.success) setConfig(configRes.data);
      if (devicesRes.success) setDevices(devicesRes.data);
      return configRes.success && devicesRes.success;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  // Load data from DB first, then sync in background to get fresh data
  const loadDataAndSync = async () => {
    setLoading(true);
    try {
      // First load existing data from DB for quick display
      await loadData();
      setLoading(false);

      // Then sync in background to get fresh data (including private IPs)
      setSyncing(true);
      try {
        await ninjaApi.syncAll();
        await loadData();
      } catch (syncErr: any) {
        // Sync errors are not critical - we still have cached data
        console.warn('Background sync failed:', syncErr.message);
      } finally {
        setSyncing(false);
      }
    } catch (err: any) {
      setError(err.message);
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

  // Load cached software for a device
  const loadSoftware = async (deviceId: string) => {
    try {
      setSoftwareLoading(true);
      const result = await ninjaApi.getDeviceSoftware(deviceId);
      if (result.success) {
        setSoftware(result.data.software);
        setSoftwareLastFetched(result.data.lastFetched);
      }
    } catch (err: any) {
      console.error('Failed to load software:', err.message);
    } finally {
      setSoftwareLoading(false);
    }
  };

  // Refresh software from NinjaRMM
  const refreshSoftware = async (deviceId: string) => {
    try {
      setSoftwareLoading(true);
      const result = await ninjaApi.refreshDeviceSoftware(deviceId);
      if (result.success) {
        setSoftware(result.data.software);
        setSoftwareLastFetched(result.data.lastFetched);
      }
    } catch (err: any) {
      setError(`Software konnte nicht geladen werden: ${err.message}`);
    } finally {
      setSoftwareLoading(false);
    }
  };

  // Toggle software section
  const handleToggleSoftware = async () => {
    if (!showSoftware && selectedDevice) {
      // First time opening - load cached software, or fetch if none exists
      await loadSoftware(selectedDevice.id);
      if (software.length === 0) {
        await refreshSoftware(selectedDevice.id);
      }
    }
    setShowSoftware(!showSoftware);
  };

  // Load cached OS patches for a device
  const loadPatches = async (deviceId: string) => {
    try {
      setPatchesLoading(true);
      const result = await ninjaApi.getDeviceOSPatches(deviceId);
      if (result.success) {
        setInstalledPatches(result.data.installed);
        setPendingPatches(result.data.pending);
        setPatchesLastFetched(result.data.lastFetched);
      }
    } catch (err: any) {
      console.error('Failed to load patches:', err.message);
    } finally {
      setPatchesLoading(false);
    }
  };

  // Refresh OS patches from NinjaRMM
  const refreshPatches = async (deviceId: string) => {
    try {
      setPatchesLoading(true);
      const result = await ninjaApi.refreshDeviceOSPatches(deviceId);
      if (result.success) {
        setInstalledPatches(result.data.installed);
        setPendingPatches(result.data.pending);
        setPatchesLastFetched(result.data.lastFetched);
      }
    } catch (err: any) {
      setError(`Updates konnten nicht geladen werden: ${err.message}`);
    } finally {
      setPatchesLoading(false);
    }
  };

  // Toggle patches section
  const handleTogglePatches = async () => {
    if (!showPatches && selectedDevice) {
      // First time opening - load cached patches, or fetch if none exists
      await loadPatches(selectedDevice.id);
      if (installedPatches.length === 0 && pendingPatches.length === 0) {
        await refreshPatches(selectedDevice.id);
      }
    }
    setShowPatches(!showPatches);
  };

  // Filter and sort software
  const filteredSoftware = useMemo(() => {
    let result = software;

    // Filter by search
    if (softwareSearch) {
      const search = softwareSearch.toLowerCase();
      result = result.filter(sw =>
        sw.name.toLowerCase().includes(search) ||
        sw.publisher?.toLowerCase().includes(search) ||
        sw.version?.toLowerCase().includes(search)
      );
    }

    // Sort
    return [...result].sort((a, b) => {
      if (softwareSort === 'date') {
        // Sort by install date (newest first), null dates at end
        if (!a.installDate && !b.installDate) return 0;
        if (!a.installDate) return 1;
        if (!b.installDate) return -1;
        return new Date(b.installDate).getTime() - new Date(a.installDate).getTime();
      }
      // Sort by name (alphabetically)
      return a.name.localeCompare(b.name, 'de');
    });
  }, [software, softwareSearch, softwareSort]);

  // Format install date for display
  const formatInstallDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Filter patches based on search and tab
  const filteredPatches = useMemo(() => {
    const patches = patchesTab === 'pending' ? pendingPatches : installedPatches;

    if (!patchesSearch) return patches;

    const search = patchesSearch.toLowerCase();
    return patches.filter(patch =>
      patch.name.toLowerCase().includes(search) ||
      patch.kbNumber?.toLowerCase().includes(search) ||
      patch.category?.toLowerCase().includes(search)
    );
  }, [installedPatches, pendingPatches, patchesSearch, patchesTab]);

  // Get severity color class
  const getSeverityColor = (severity: string | null) => {
    if (!severity) return 'bg-gray-100 dark:bg-dark-100 text-gray-600 dark:text-gray-400';
    const sev = severity.toLowerCase();
    if (sev === 'critical') return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
    if (sev === 'important') return 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400';
    if (sev === 'moderate') return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400';
    return 'bg-gray-100 dark:bg-dark-100 text-gray-600 dark:text-gray-400';
  };

  // Reset software and patches when device changes
  useEffect(() => {
    if (selectedDevice) {
      setShowSoftware(false);
      setSoftware([]);
      setSoftwareLastFetched(null);
      setSoftwareSearch('');
      setShowPatches(false);
      setInstalledPatches([]);
      setPendingPatches([]);
      setPatchesLastFetched(null);
      setPatchesSearch('');
      setPatchesTab('pending');
    }
  }, [selectedDevice?.id]);

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
        <Button
          onClick={handleSync}
          loading={syncing}
          icon={!syncing ? <RefreshCw size={16} /> : undefined}
        >
          {syncing ? 'Sync...' : 'Sync'}
        </Button>
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
                <td className="px-4 py-3 hidden md:table-cell text-gray-600 dark:text-gray-300">
                  {device.nodeClass?.replace(/_/g, ' ')}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-gray-600 dark:text-gray-300">
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
              <IconButton
                onClick={() => setSelectedDevice(null)}
                icon={<X size={20} />}
                tooltip="Schließen"
              />
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
                      <dd className="text-gray-900 dark:text-white">{selectedDevice.osVersion || selectedDevice.osName || '-'}</dd>
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
                    {selectedDevice.processorName && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500 dark:text-dark-400">Prozessor</dt>
                        <dd className="text-gray-900 dark:text-white text-xs">
                          {selectedDevice.processorName}
                          {selectedDevice.processorCores && ` (${selectedDevice.processorCores} Kerne)`}
                        </dd>
                      </div>
                    )}
                    {selectedDevice.memoryGb && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500 dark:text-dark-400">Arbeitsspeicher</dt>
                        <dd className="text-gray-900 dark:text-white">{selectedDevice.memoryGb} GB</dd>
                      </div>
                    )}
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
                      <dt className="text-gray-500 dark:text-dark-400">Private IP</dt>
                      <dd className="text-gray-900 dark:text-white font-mono">{selectedDevice.privateIp || '-'}</dd>
                    </div>
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

              {/* Software Section (Collapsible) */}
              <div className="mt-4 border border-gray-200 dark:border-dark-200 rounded-lg overflow-hidden">
                <button
                  onClick={handleToggleSoftware}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-50 hover:bg-gray-100 dark:hover:bg-dark-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Package size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-900 dark:text-white">Installierte Software</span>
                    {software.length > 0 && (
                      <span className="px-2 py-0.5 text-xs bg-accent-primary/10 text-accent-primary rounded-full">
                        {software.length}
                      </span>
                    )}
                  </div>
                  {showSoftware ? (
                    <ChevronUp size={18} className="text-gray-500" />
                  ) : (
                    <ChevronDown size={18} className="text-gray-500" />
                  )}
                </button>

                {showSoftware && (
                  <div className="p-4 border-t border-gray-200 dark:border-dark-200">
                    {/* Software Header */}
                    <div className="flex flex-col gap-3 mb-4">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Software suchen..."
                            value={softwareSearch}
                            onChange={(e) => setSoftwareSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                          />
                        </div>
                        <Button
                          onClick={() => selectedDevice && refreshSoftware(selectedDevice.id)}
                          loading={softwareLoading}
                          variant="secondary"
                          size="sm"
                          icon={!softwareLoading ? <RefreshCw size={14} /> : undefined}
                        >
                          Aktualisieren
                        </Button>
                      </div>

                      {/* Sort Toggle */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 bg-gray-100 dark:bg-dark-100 rounded-lg p-1">
                          <button
                            onClick={() => setSoftwareSort('name')}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${
                              softwareSort === 'name'
                                ? 'bg-white dark:bg-dark-200 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 dark:text-dark-400 hover:text-gray-700'
                            }`}
                          >
                            A-Z
                          </button>
                          <button
                            onClick={() => setSoftwareSort('date')}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${
                              softwareSort === 'date'
                                ? 'bg-white dark:bg-dark-200 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 dark:text-dark-400 hover:text-gray-700'
                            }`}
                          >
                            Datum
                          </button>
                        </div>
                        {softwareLastFetched && (
                          <p className="text-xs text-gray-500 dark:text-dark-400">
                            Stand: {new Date(softwareLastFetched).toLocaleDateString('de-DE')}
                          </p>
                        )}
                      </div>
                    </div>

                    {softwareLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <RefreshCw size={20} className="animate-spin text-gray-400" />
                      </div>
                    ) : filteredSoftware.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 dark:text-dark-400">
                        {software.length === 0 ? 'Keine Software gefunden' : 'Keine Software entspricht der Suche'}
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-y-auto">
                        {/* Mobile: Card View */}
                        <div className="sm:hidden space-y-2">
                          {filteredSoftware.map(sw => (
                            <div key={sw.id} className="p-3 bg-gray-50 dark:bg-dark-50 rounded-lg">
                              <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{sw.name}</p>
                              {sw.publisher && (
                                <p className="text-xs text-gray-500 dark:text-dark-400 truncate">{sw.publisher}</p>
                              )}
                              <div className="flex items-center justify-between mt-2 text-xs">
                                <span className="text-gray-600 dark:text-gray-400 font-mono">{sw.version || '-'}</span>
                                {sw.installDate && (
                                  <span className="text-gray-500 dark:text-dark-400">{formatInstallDate(sw.installDate)}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Desktop: Table View */}
                        <table className="hidden sm:table w-full text-sm border border-gray-200 dark:border-dark-200 rounded-lg overflow-hidden">
                          <thead className="bg-gray-50 dark:bg-dark-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-dark-400">Name</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-dark-400">Version</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-dark-400">Installiert</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-dark-200">
                            {filteredSoftware.map(sw => (
                              <tr key={sw.id} className="hover:bg-gray-50 dark:hover:bg-dark-50">
                                <td className="px-3 py-2">
                                  <p className="text-gray-900 dark:text-white">{sw.name}</p>
                                  {sw.publisher && (
                                    <p className="text-xs text-gray-500 dark:text-dark-400">{sw.publisher}</p>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-gray-500 dark:text-dark-400 font-mono text-xs">{sw.version || '-'}</td>
                                <td className="px-3 py-2 text-gray-500 dark:text-dark-400 text-xs">{formatInstallDate(sw.installDate)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Windows Updates Section (Collapsible) */}
              <div className="mt-4 border border-gray-200 dark:border-dark-200 rounded-lg overflow-hidden">
                <button
                  onClick={handleTogglePatches}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-50 hover:bg-gray-100 dark:hover:bg-dark-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Shield size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-900 dark:text-white">Windows Updates</span>
                    {pendingPatches.length > 0 && (
                      <span className="px-2 py-0.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full">
                        {pendingPatches.length} ausstehend
                      </span>
                    )}
                    {installedPatches.length > 0 && (
                      <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full">
                        {installedPatches.length} installiert
                      </span>
                    )}
                  </div>
                  {showPatches ? (
                    <ChevronUp size={18} className="text-gray-500" />
                  ) : (
                    <ChevronDown size={18} className="text-gray-500" />
                  )}
                </button>

                {showPatches && (
                  <div className="p-4 border-t border-gray-200 dark:border-dark-200">
                    {/* Patches Header */}
                    <div className="flex flex-col gap-3 mb-4">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Update suchen (KB...)"
                            value={patchesSearch}
                            onChange={(e) => setPatchesSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                          />
                        </div>
                        <Button
                          onClick={() => selectedDevice && refreshPatches(selectedDevice.id)}
                          loading={patchesLoading}
                          variant="secondary"
                          size="sm"
                          icon={!patchesLoading ? <RefreshCw size={14} /> : undefined}
                        >
                          Aktualisieren
                        </Button>
                      </div>

                      {/* Tab Toggle */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 bg-gray-100 dark:bg-dark-100 rounded-lg p-1">
                          <button
                            onClick={() => setPatchesTab('pending')}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${
                              patchesTab === 'pending'
                                ? 'bg-white dark:bg-dark-200 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 dark:text-dark-400 hover:text-gray-700'
                            }`}
                          >
                            Ausstehend ({pendingPatches.length})
                          </button>
                          <button
                            onClick={() => setPatchesTab('installed')}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${
                              patchesTab === 'installed'
                                ? 'bg-white dark:bg-dark-200 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 dark:text-dark-400 hover:text-gray-700'
                            }`}
                          >
                            Installiert ({installedPatches.length})
                          </button>
                        </div>
                        {patchesLastFetched && (
                          <p className="text-xs text-gray-500 dark:text-dark-400">
                            Stand: {new Date(patchesLastFetched).toLocaleDateString('de-DE')}
                          </p>
                        )}
                      </div>
                    </div>

                    {patchesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <RefreshCw size={20} className="animate-spin text-gray-400" />
                      </div>
                    ) : filteredPatches.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 dark:text-dark-400">
                        {patchesTab === 'pending' ? (
                          pendingPatches.length === 0 ? 'Keine ausstehenden Updates' : 'Keine Updates entsprechen der Suche'
                        ) : (
                          installedPatches.length === 0 ? 'Keine installierten Updates gefunden' : 'Keine Updates entsprechen der Suche'
                        )}
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-y-auto">
                        {/* Mobile: Card View */}
                        <div className="sm:hidden space-y-2">
                          {filteredPatches.map(patch => (
                            <div key={patch.id} className="p-3 bg-gray-50 dark:bg-dark-50 rounded-lg">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-medium text-gray-900 dark:text-white text-sm">{patch.name}</p>
                                {patch.severity && (
                                  <span className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${getSeverityColor(patch.severity)}`}>
                                    {patch.severity}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-2 text-xs">
                                {patch.kbNumber && (
                                  <span className="font-mono text-gray-600 dark:text-gray-400">{patch.kbNumber}</span>
                                )}
                                {patch.category && (
                                  <span className="text-gray-500 dark:text-dark-400">• {patch.category}</span>
                                )}
                              </div>
                              {patch.installDate && (
                                <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
                                  Installiert: {formatInstallDate(patch.installDate)}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Desktop: Table View */}
                        <table className="hidden sm:table w-full text-sm border border-gray-200 dark:border-dark-200 rounded-lg overflow-hidden">
                          <thead className="bg-gray-50 dark:bg-dark-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-dark-400">Update</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-dark-400">KB</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-dark-400">Priorität</th>
                              {patchesTab === 'installed' && (
                                <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-dark-400">Installiert</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-dark-200">
                            {filteredPatches.map(patch => (
                              <tr key={patch.id} className="hover:bg-gray-50 dark:hover:bg-dark-50">
                                <td className="px-3 py-2">
                                  <p className="text-gray-900 dark:text-white text-sm">{patch.name}</p>
                                  {patch.category && (
                                    <p className="text-xs text-gray-500 dark:text-dark-400">{patch.category}</p>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-gray-500 dark:text-dark-400 font-mono text-xs">
                                  {patch.kbNumber || '-'}
                                </td>
                                <td className="px-3 py-2">
                                  {patch.severity && (
                                    <span className={`px-2 py-0.5 text-xs rounded-full ${getSeverityColor(patch.severity)}`}>
                                      {patch.severity}
                                    </span>
                                  )}
                                </td>
                                {patchesTab === 'installed' && (
                                  <td className="px-3 py-2 text-gray-500 dark:text-dark-400 text-xs">
                                    {formatInstallDate(patch.installDate)}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between gap-3 p-4 border-t border-gray-200 dark:border-dark-200">
              <div className="flex gap-2">
                <Button
                  onClick={() => handleRefreshDevice(selectedDevice.id)}
                  loading={refreshingDevice}
                  icon={!refreshingDevice ? <RefreshCw size={16} /> : undefined}
                >
                  {refreshingDevice ? 'Lade...' : 'Details laden'}
                </Button>
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
              <Button
                onClick={() => setSelectedDevice(null)}
                variant="secondary"
              >
                Schließen
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
