import { useState, useEffect, useMemo } from 'react';
import { Monitor, Laptop, Server, Wifi, WifiOff, RefreshCw, Search, User, Globe, AlertTriangle, ChevronDown, ChevronUp, Clock, CheckCircle, HardDrive, Cpu, Power, LayoutGrid, List, Package, Shield } from 'lucide-react';
import { customerPortalApi, PortalContact, PortalDevice, PortalDeviceAlert } from '../../services/api';
import { Button, IconButton } from '../ui/Button';

interface PortalDevicesProps {
  contact: PortalContact;
}

interface DeviceSoftware {
  id: string;
  name: string;
  publisher: string | null;
  version: string | null;
  installDate: string | null;
  sizeBytes: number | null;
}

interface DeviceOSPatch {
  id: string;
  deviceId: string;
  patchType: 'installed' | 'pending' | 'failed' | 'rejected';
  kbNumber: string | null;
  name: string;
  description: string | null;
  severity: string | null;
  category: string | null;
  installDate: string | null;
  installedOn: string | null;
  sizeBytes: number | null;
  status: string | null;
}

const deviceTypeIcons: Record<string, typeof Monitor> = {
  WINDOWS_WORKSTATION: Monitor,
  WINDOWS_SERVER: Server,
  MAC: Laptop,
  LINUX_WORKSTATION: Monitor,
  LINUX_SERVER: Server,
  VMWARE_VM_HOST: Server,
  CLOUD_MONITOR_TARGET: Globe,
};

const severityColors: Record<string, { bg: string; text: string; icon: string }> = {
  CRITICAL: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', icon: 'text-red-600' },
  MAJOR: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', icon: 'text-orange-600' },
  MODERATE: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', icon: 'text-yellow-600' },
  MINOR: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', icon: 'text-blue-600' },
  NONE: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-400', icon: 'text-gray-600' },
};

export const PortalDevices = ({ contact }: PortalDevicesProps) => {
  const [devices, setDevices] = useState<PortalDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOffline, setShowOffline] = useState(true);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [deviceAlerts, setDeviceAlerts] = useState<Record<string, PortalDeviceAlert[]>>({});
  const [loadingAlerts, setLoadingAlerts] = useState<string | null>(null);

  // View mode: 'grid' or 'table'
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Software state
  const [showSoftware, setShowSoftware] = useState<string | null>(null);
  const [deviceSoftware, setDeviceSoftware] = useState<Record<string, DeviceSoftware[]>>({});
  const [loadingSoftware, setLoadingSoftware] = useState<string | null>(null);
  const [softwareSearch, setSoftwareSearch] = useState('');
  const [softwareSort, setSoftwareSort] = useState<'name' | 'date'>('name');

  // OS Patches state
  const [showPatches, setShowPatches] = useState<string | null>(null);
  const [devicePatches, setDevicePatches] = useState<Record<string, { installed: DeviceOSPatch[]; pending: DeviceOSPatch[] }>>({});
  const [loadingPatches, setLoadingPatches] = useState<string | null>(null);
  const [patchesSearch, setPatchesSearch] = useState('');
  const [patchesTab, setPatchesTab] = useState<'pending' | 'installed'>('pending');

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await customerPortalApi.getDevices();
      setDevices(response.data || []);
    } catch (err: any) {
      console.error('Failed to load devices:', err);
      setError(err.message || 'Fehler beim Laden der Geräte');
    } finally {
      setLoading(false);
    }
  };

  const loadDeviceAlerts = async (deviceId: string) => {
    if (deviceAlerts[deviceId]) return; // Already loaded

    try {
      setLoadingAlerts(deviceId);
      const response = await customerPortalApi.getDeviceAlerts(deviceId);
      setDeviceAlerts(prev => ({ ...prev, [deviceId]: response.data || [] }));
    } catch (err: any) {
      console.error('Failed to load device alerts:', err);
    } finally {
      setLoadingAlerts(null);
    }
  };

  // Load software for a device
  const loadDeviceSoftware = async (deviceId: string, forceRefresh = false) => {
    if (!forceRefresh && deviceSoftware[deviceId]) return;

    try {
      setLoadingSoftware(deviceId);
      const endpoint = forceRefresh
        ? `/customer-portal/devices/${deviceId}/software/refresh`
        : `/customer-portal/devices/${deviceId}/software`;

      const response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
        method: forceRefresh ? 'POST' : 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('portal_auth_token')}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (data.success) {
        setDeviceSoftware(prev => ({ ...prev, [deviceId]: data.data.software || [] }));
      }
    } catch (err: any) {
      console.error('Failed to load device software:', err);
    } finally {
      setLoadingSoftware(null);
    }
  };

  // Toggle software display
  const toggleSoftware = async (deviceId: string) => {
    if (showSoftware === deviceId) {
      setShowSoftware(null);
      setSoftwareSearch('');
    } else {
      setShowSoftware(deviceId);
      await loadDeviceSoftware(deviceId);
    }
  };

  // Load OS patches for a device
  const loadDevicePatches = async (deviceId: string, forceRefresh = false) => {
    if (!forceRefresh && devicePatches[deviceId]) return;

    try {
      setLoadingPatches(deviceId);
      const endpoint = forceRefresh
        ? `/customer-portal/devices/${deviceId}/os-patches/refresh`
        : `/customer-portal/devices/${deviceId}/os-patches`;

      const response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
        method: forceRefresh ? 'POST' : 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('portal_auth_token')}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (data.success) {
        setDevicePatches(prev => ({
          ...prev,
          [deviceId]: {
            installed: data.data.installed || [],
            pending: data.data.pending || [],
          },
        }));
      }
    } catch (err: any) {
      console.error('Failed to load device patches:', err);
    } finally {
      setLoadingPatches(null);
    }
  };

  // Toggle patches display
  const togglePatches = async (deviceId: string) => {
    if (showPatches === deviceId) {
      setShowPatches(null);
      setPatchesSearch('');
    } else {
      setShowPatches(deviceId);
      await loadDevicePatches(deviceId);
    }
  };

  // Filter patches based on search and tab
  const getFilteredPatches = (deviceId: string) => {
    const patches = devicePatches[deviceId];
    if (!patches) return [];

    const list = patchesTab === 'pending' ? patches.pending : patches.installed;

    if (!patchesSearch) return list;

    const search = patchesSearch.toLowerCase();
    return list.filter(patch =>
      patch.name.toLowerCase().includes(search) ||
      patch.kbNumber?.toLowerCase().includes(search) ||
      patch.category?.toLowerCase().includes(search)
    );
  };

  // Get severity color class
  const getPatchSeverityColor = (severity: string | null) => {
    if (!severity) return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
    const sev = severity.toLowerCase();
    if (sev === 'critical') return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
    if (sev === 'important') return 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400';
    if (sev === 'moderate') return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400';
    return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
  };

  // Filter and sort software
  const getFilteredSoftware = (deviceId: string) => {
    let result = deviceSoftware[deviceId] || [];

    // Filter by search
    if (softwareSearch) {
      const search = softwareSearch.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(search) ||
        s.publisher?.toLowerCase().includes(search) ||
        s.version?.toLowerCase().includes(search)
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
  };

  // Format install date for display
  const formatSoftwareDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const toggleExpand = (deviceId: string) => {
    if (expandedDevice === deviceId) {
      setExpandedDevice(null);
    } else {
      setExpandedDevice(deviceId);
      loadDeviceAlerts(deviceId);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatRelativeTime = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `vor ${diffMins} Min.`;
    if (diffHours < 24) return `vor ${diffHours} Std.`;
    if (diffDays < 7) return `vor ${diffDays} Tagen`;
    return formatDate(dateString);
  };

  const getSeverityStyle = (severity: string) => {
    return severityColors[severity] || severityColors.NONE;
  };

  const filteredDevices = devices.filter(device => {
    const matchesSearch = !searchTerm ||
      device.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.systemName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.lastLoggedInUser?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOffline = showOffline || !device.offline;
    return matchesSearch && matchesOffline;
  });

  const onlineCount = devices.filter(d => !d.offline).length;
  const offlineCount = devices.filter(d => d.offline).length;

  const getDeviceIcon = (deviceType: string) => {
    const Icon = deviceTypeIcons[deviceType] || Monitor;
    return Icon;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Meine Geräte</h2>
          <div className="flex items-center gap-4 mt-1">
            <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <Wifi size={14} /> {onlineCount} Online
            </span>
            <span className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
              <WifiOff size={14} /> {offlineCount} Offline
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <IconButton
              icon={<LayoutGrid size={18} />}
              onClick={() => setViewMode('grid')}
              variant={viewMode === 'grid' ? 'primary' : 'default'}
              tooltip="Kachelansicht"
              className={viewMode === 'grid' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' : ''}
            />
            <IconButton
              icon={<List size={18} />}
              onClick={() => setViewMode('table')}
              variant={viewMode === 'table' ? 'primary' : 'default'}
              tooltip="Tabellenansicht"
              className={viewMode === 'table' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' : ''}
            />
          </div>
          <Button
            onClick={loadDevices}
            variant="ghost"
            icon={<RefreshCw size={18} />}
          >
            Aktualisieren
          </Button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Gerät suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg cursor-pointer">
          <input
            type="checkbox"
            checked={showOffline}
            onChange={(e) => setShowOffline(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600 dark:text-gray-300">Offline anzeigen</span>
        </label>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Devices View */}
      {filteredDevices.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Monitor size={48} className="mx-auto mb-4 opacity-50" />
          <p>Keine Geräte gefunden</p>
        </div>
      ) : viewMode === 'table' ? (
        /* Table View */
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Gerät</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">Typ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">Benutzer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">IP</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">Letzter Kontakt</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Alerts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredDevices.map(device => {
                  const DeviceIcon = getDeviceIcon(device.deviceType);
                  return (
                    <tr
                      key={device.id}
                      onClick={() => toggleExpand(device.id)}
                      className={`cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                        device.offline ? 'opacity-60' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        {device.offline ? (
                          <WifiOff size={18} className="text-gray-400" />
                        ) : (
                          <Wifi size={18} className="text-green-500" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <DeviceIcon size={18} className="text-gray-400" />
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {device.displayName || device.systemName}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {device.osVersion || device.osName}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-sm text-gray-600 dark:text-gray-300">
                        {device.deviceType?.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-sm text-gray-600 dark:text-gray-300">
                        {device.lastLoggedInUser || '-'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-sm text-gray-600 dark:text-gray-300 font-mono">
                        {device.privateIp || '-'}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-sm text-gray-500 dark:text-gray-400">
                        {formatRelativeTime(device.lastContact)}
                      </td>
                      <td className="px-4 py-3">
                        {device.openAlerts > 0 ? (
                          <span className="flex items-center gap-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-1 rounded-full">
                            <AlertTriangle size={12} />
                            {device.openAlerts}
                          </span>
                        ) : (
                          <CheckCircle size={16} className="text-green-500" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Grid View */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredDevices.map(device => {
            const DeviceIcon = getDeviceIcon(device.deviceType);
            const isExpanded = expandedDevice === device.id;
            const alerts = deviceAlerts[device.id] || [];
            const isLoadingAlerts = loadingAlerts === device.id;

            return (
              <div
                key={device.id}
                className={`bg-white dark:bg-gray-800 border rounded-lg overflow-hidden transition-all ${
                  device.offline
                    ? 'border-gray-200 dark:border-gray-700 opacity-60'
                    : 'border-green-200 dark:border-green-800'
                }`}
              >
                {/* Main Card Content */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => toggleExpand(device.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${
                      device.offline
                        ? 'bg-gray-100 dark:bg-gray-700'
                        : 'bg-green-100 dark:bg-green-900/30'
                    }`}>
                      <DeviceIcon size={24} className={
                        device.offline
                          ? 'text-gray-500 dark:text-gray-400'
                          : 'text-green-600 dark:text-green-400'
                      } />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                          {device.displayName || device.systemName}
                        </h3>
                        {device.offline ? (
                          <WifiOff size={14} className="text-gray-400 flex-shrink-0" />
                        ) : (
                          <Wifi size={14} className="text-green-500 flex-shrink-0" />
                        )}
                        {device.openAlerts > 0 && (
                          <span className="flex items-center gap-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded-full">
                            <AlertTriangle size={10} />
                            {device.openAlerts}
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {device.osVersion || device.osName}
                      </p>

                      <div className="mt-3 space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
                        {device.lastLoggedInUser && (
                          <div className="flex items-center gap-1.5">
                            <User size={12} />
                            <span className="truncate">{device.lastLoggedInUser}</span>
                          </div>
                        )}
                        {device.lastBoot && (
                          <div className="flex items-center gap-1.5">
                            <Clock size={12} />
                            <span>Neustart: {formatRelativeTime(device.lastBoot)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <RefreshCw size={12} />
                          <span>Online: {formatRelativeTime(device.lastContact)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-gray-400">
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50">
                    {/* System Info */}
                    <div className="grid grid-cols-2 gap-3 text-xs mb-4">
                      {device.manufacturer && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Hersteller</span>
                          <p className="font-medium text-gray-900 dark:text-white">{device.manufacturer}</p>
                        </div>
                      )}
                      {device.model && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Modell</span>
                          <p className="font-medium text-gray-900 dark:text-white">{device.model}</p>
                        </div>
                      )}
                      {device.serialNumber && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Seriennummer</span>
                          <p className="font-medium text-gray-900 dark:text-white font-mono">{device.serialNumber}</p>
                        </div>
                      )}
                      {device.osArchitecture && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Architektur</span>
                          <p className="font-medium text-gray-900 dark:text-white">{device.osArchitecture}</p>
                        </div>
                      )}
                    </div>

                    {/* Hardware Info */}
                    {(device.processorName || device.memoryGb) && (
                      <div className="grid grid-cols-2 gap-3 text-xs mb-4 border-t border-gray-200 dark:border-gray-700 pt-3">
                        {device.processorName && (
                          <div className="col-span-2">
                            <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                              <Cpu size={10} /> Prozessor
                            </span>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {device.processorName}
                              {device.processorCores && ` (${device.processorCores} Kerne)`}
                            </p>
                          </div>
                        )}
                        {device.memoryGb && (
                          <div>
                            <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                              <HardDrive size={10} /> Arbeitsspeicher
                            </span>
                            <p className="font-medium text-gray-900 dark:text-white">{device.memoryGb} GB</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Network Info */}
                    {(device.privateIp || device.publicIp) && (
                      <div className="grid grid-cols-2 gap-3 text-xs mb-4 border-t border-gray-200 dark:border-gray-700 pt-3">
                        {device.privateIp && (
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Lokale IP</span>
                            <p className="font-medium text-gray-900 dark:text-white font-mono">{device.privateIp}</p>
                          </div>
                        )}
                        {device.publicIp && (
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Öffentliche IP</span>
                            <p className="font-medium text-gray-900 dark:text-white font-mono">{device.publicIp}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Last Boot Time */}
                    {device.lastBoot && (
                      <div className="text-xs mb-4 border-t border-gray-200 dark:border-gray-700 pt-3">
                        <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                          <Power size={12} />
                          <span>Letzter Neustart: {formatDate(device.lastBoot)}</span>
                        </div>
                      </div>
                    )}

                    {/* Alerts Section */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                      <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                        <AlertTriangle size={12} />
                        Letzte Meldungen
                      </h4>

                      {isLoadingAlerts ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                        </div>
                      ) : alerts.length === 0 ? (
                        <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 py-2">
                          <CheckCircle size={14} />
                          <span>Keine offenen Meldungen</span>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {alerts.slice(0, 5).map(alert => {
                            const style = getSeverityStyle(alert.severity);
                            return (
                              <div
                                key={alert.id}
                                className={`p-2 rounded-lg text-xs ${style.bg} ${alert.resolved ? 'opacity-60' : ''}`}
                              >
                                <div className="flex items-start gap-2">
                                  <AlertTriangle size={12} className={`mt-0.5 flex-shrink-0 ${style.icon}`} />
                                  <div className="flex-1 min-w-0">
                                    <p className={`font-medium ${style.text}`}>
                                      {alert.message}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1 text-gray-500 dark:text-gray-400">
                                      <Clock size={10} />
                                      <span>{formatRelativeTime(alert.activityTime)}</span>
                                      {alert.resolved && (
                                        <>
                                          <span>•</span>
                                          <span className="text-green-600 dark:text-green-400">Gelöst</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {alerts.length > 5 && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 text-center pt-1">
                              + {alerts.length - 5} weitere Meldungen
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Software Section */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                      <Button
                        onClick={(e) => { e.stopPropagation(); toggleSoftware(device.id); }}
                        variant="ghost"
                        size="sm"
                        className="w-full flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <span className="flex items-center gap-1">
                          <Package size={12} />
                          Installierte Software
                          {deviceSoftware[device.id] && (
                            <span className="ml-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
                              {deviceSoftware[device.id].length}
                            </span>
                          )}
                        </span>
                        {showSoftware === device.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </Button>

                      {showSoftware === device.id && (
                        <div className="mt-3">
                          {loadingSoftware === device.id ? (
                            <div className="flex items-center justify-center py-4">
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                            </div>
                          ) : (
                            <>
                              {/* Search and Controls */}
                              <div className="space-y-2 mb-3">
                                <div className="flex gap-2">
                                  <div className="relative flex-1">
                                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                      type="text"
                                      placeholder="Software suchen..."
                                      value={softwareSearch}
                                      onChange={(e) => setSoftwareSearch(e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                  </div>
                                  <IconButton
                                    icon={<RefreshCw size={12} className={loadingSoftware === device.id ? 'animate-spin' : ''} />}
                                    onClick={(e) => { e.stopPropagation(); loadDeviceSoftware(device.id, true); }}
                                    disabled={loadingSoftware === device.id}
                                    tooltip="Aktualisieren"
                                    size="sm"
                                    className="border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
                                  />
                                </div>

                                {/* Sort Toggle */}
                                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded p-0.5" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    onClick={() => setSoftwareSort('name')}
                                    variant="ghost"
                                    size="sm"
                                    className={`flex-1 px-2 py-1 text-xs rounded ${
                                      softwareSort === 'name'
                                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                        : 'text-gray-500 dark:text-gray-400'
                                    }`}
                                  >
                                    A-Z
                                  </Button>
                                  <Button
                                    onClick={() => setSoftwareSort('date')}
                                    variant="ghost"
                                    size="sm"
                                    className={`flex-1 px-2 py-1 text-xs rounded ${
                                      softwareSort === 'date'
                                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                        : 'text-gray-500 dark:text-gray-400'
                                    }`}
                                  >
                                    Datum
                                  </Button>
                                </div>
                              </div>

                              {getFilteredSoftware(device.id).length === 0 ? (
                                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                                  {deviceSoftware[device.id]?.length === 0 ? 'Keine Software gefunden' : 'Keine Treffer'}
                                </p>
                              ) : (
                                <div className="max-h-48 overflow-y-auto space-y-1.5">
                                  {/* Card view for all screen sizes (better for mobile) */}
                                  {getFilteredSoftware(device.id).map(sw => (
                                    <div key={sw.id} className="p-2 bg-white dark:bg-gray-700/50 rounded border border-gray-100 dark:border-gray-600">
                                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{sw.name}</p>
                                      {sw.publisher && (
                                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{sw.publisher}</p>
                                      )}
                                      <div className="flex items-center justify-between mt-1 text-xs">
                                        <span className="text-gray-500 dark:text-gray-400 font-mono">{sw.version || '-'}</span>
                                        {sw.installDate && (
                                          <span className="text-gray-400 dark:text-gray-500">{formatSoftwareDate(sw.installDate)}</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Windows Updates Section */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                      <Button
                        onClick={(e) => { e.stopPropagation(); togglePatches(device.id); }}
                        variant="ghost"
                        size="sm"
                        className="w-full flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <span className="flex items-center gap-1">
                          <Shield size={12} />
                          Windows Updates
                          {devicePatches[device.id]?.pending?.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full">
                              {devicePatches[device.id].pending.length} ausstehend
                            </span>
                          )}
                        </span>
                        {showPatches === device.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </Button>

                      {showPatches === device.id && (
                        <div className="mt-3">
                          {loadingPatches === device.id ? (
                            <div className="flex items-center justify-center py-4">
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                            </div>
                          ) : (
                            <>
                              {/* Search and Controls */}
                              <div className="space-y-2 mb-3">
                                <div className="flex gap-2">
                                  <div className="relative flex-1">
                                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                      type="text"
                                      placeholder="Update suchen (KB...)"
                                      value={patchesSearch}
                                      onChange={(e) => setPatchesSearch(e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                  </div>
                                  <IconButton
                                    icon={<RefreshCw size={12} className={loadingPatches === device.id ? 'animate-spin' : ''} />}
                                    onClick={(e) => { e.stopPropagation(); loadDevicePatches(device.id, true); }}
                                    disabled={loadingPatches === device.id}
                                    tooltip="Aktualisieren"
                                    size="sm"
                                    className="border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
                                  />
                                </div>

                                {/* Tab Toggle */}
                                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded p-0.5" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    onClick={() => setPatchesTab('pending')}
                                    variant="ghost"
                                    size="sm"
                                    className={`flex-1 px-2 py-1 text-xs rounded ${
                                      patchesTab === 'pending'
                                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                        : 'text-gray-500 dark:text-gray-400'
                                    }`}
                                  >
                                    Ausstehend ({devicePatches[device.id]?.pending?.length || 0})
                                  </Button>
                                  <Button
                                    onClick={() => setPatchesTab('installed')}
                                    variant="ghost"
                                    size="sm"
                                    className={`flex-1 px-2 py-1 text-xs rounded ${
                                      patchesTab === 'installed'
                                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                        : 'text-gray-500 dark:text-gray-400'
                                    }`}
                                  >
                                    Installiert ({devicePatches[device.id]?.installed?.length || 0})
                                  </Button>
                                </div>
                              </div>

                              {getFilteredPatches(device.id).length === 0 ? (
                                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                                  {patchesTab === 'pending'
                                    ? (devicePatches[device.id]?.pending?.length === 0 ? 'Keine ausstehenden Updates' : 'Keine Treffer')
                                    : (devicePatches[device.id]?.installed?.length === 0 ? 'Keine installierten Updates' : 'Keine Treffer')}
                                </p>
                              ) : (
                                <div className="max-h-48 overflow-y-auto space-y-1.5">
                                  {getFilteredPatches(device.id).map(patch => (
                                    <div key={patch.id} className="p-2 bg-white dark:bg-gray-700/50 rounded border border-gray-100 dark:border-gray-600">
                                      <div className="flex items-start justify-between gap-1">
                                        <p className="text-xs font-medium text-gray-900 dark:text-white">{patch.name}</p>
                                        {patch.severity && (
                                          <span className={`px-1.5 py-0.5 text-xs rounded whitespace-nowrap ${getPatchSeverityColor(patch.severity)}`}>
                                            {patch.severity}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 mt-1 text-xs">
                                        {patch.kbNumber && (
                                          <span className="font-mono text-gray-500 dark:text-gray-400">{patch.kbNumber}</span>
                                        )}
                                        {patch.category && (
                                          <span className="text-gray-400 dark:text-gray-500">• {patch.category}</span>
                                        )}
                                      </div>
                                      {patch.installDate && (
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                          Installiert: {formatSoftwareDate(patch.installDate)}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
