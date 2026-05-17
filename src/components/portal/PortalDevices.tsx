import { useState, useEffect, useMemo } from 'react';
import { Monitor, Laptop, Server, Wifi, WifiOff, RefreshCw, Search, User, Globe, AlertTriangle, Clock, CheckCircle, HardDrive, Cpu, Power, LayoutGrid, List, Package, Shield, X, Info, Activity, Filter, Headphones, ExternalLink } from 'lucide-react';
import { customerPortalApi, PortalContact, PortalDevice, PortalDeviceAlert } from '../../services/api';
import { Button, IconButton } from '../ui/Button';

interface PortalDevicesProps {
  contact: PortalContact;
  teamviewerLink?: string; // Optional TeamViewer QuickSupport link
}

type DeviceTypeFilter = 'all' | 'servers' | 'workstations';
type ProblemFilter = 'all' | 'problems' | 'healthy';

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

type DetailTab = 'overview' | 'software' | 'updates' | 'alerts';

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
  MINOR: { bg: 'bg-accent-lighter dark:bg-accent-primary/30', text: 'text-accent-dark dark:text-accent-primary', icon: 'text-accent-primary' },
  NONE: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-400', icon: 'text-gray-600' },
};

export const PortalDevices = ({ contact, teamviewerLink }: PortalDevicesProps) => {
  const [devices, setDevices] = useState<PortalDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOffline, setShowOffline] = useState(true);

  // Filters
  const [deviceTypeFilter, setDeviceTypeFilter] = useState<DeviceTypeFilter>('all');
  const [problemFilter, setProblemFilter] = useState<ProblemFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Selected device for side panel
  const [selectedDevice, setSelectedDevice] = useState<PortalDevice | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  // Device data
  const [deviceAlerts, setDeviceAlerts] = useState<Record<string, PortalDeviceAlert[]>>({});
  const [loadingAlerts, setLoadingAlerts] = useState<string | null>(null);
  const [deviceSoftware, setDeviceSoftware] = useState<Record<string, DeviceSoftware[]>>({});
  const [loadingSoftware, setLoadingSoftware] = useState<string | null>(null);
  const [devicePatches, setDevicePatches] = useState<Record<string, { installed: DeviceOSPatch[]; pending: DeviceOSPatch[] }>>({});
  const [loadingPatches, setLoadingPatches] = useState<string | null>(null);

  // Search within tabs
  const [softwareSearch, setSoftwareSearch] = useState('');
  const [patchesSearch, setPatchesSearch] = useState('');
  const [patchesTab, setPatchesTab] = useState<'pending' | 'installed'>('pending');

  useEffect(() => {
    loadDevices();
  }, []);

  // Load data when device is selected
  useEffect(() => {
    if (selectedDevice) {
      loadDeviceAlerts(selectedDevice.id);
    }
  }, [selectedDevice]);

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
    if (deviceAlerts[deviceId]) return;
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

  // Load tab data when switching tabs
  const handleTabChange = (tab: DetailTab) => {
    setActiveTab(tab);
    if (selectedDevice) {
      if (tab === 'software' && !deviceSoftware[selectedDevice.id]) {
        loadDeviceSoftware(selectedDevice.id);
      } else if (tab === 'updates' && !devicePatches[selectedDevice.id]) {
        loadDevicePatches(selectedDevice.id);
      }
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

  const getSeverityStyle = (severity: string) => {
    return severityColors[severity] || severityColors.NONE;
  };

  const getDeviceIcon = (deviceType: string) => {
    return deviceTypeIcons[deviceType] || Monitor;
  };

  const isServerType = (deviceType: string) => {
    return deviceType.includes('SERVER') || deviceType === 'VMWARE_VM_HOST';
  };

  const filteredDevices = useMemo(() => {
    return devices.filter(device => {
      // Search filter
      const matchesSearch = !searchTerm ||
        device.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        device.systemName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        device.lastLoggedInUser?.toLowerCase().includes(searchTerm.toLowerCase());

      // Offline filter
      const matchesOffline = showOffline || !device.offline;

      // Device type filter
      const matchesDeviceType = deviceTypeFilter === 'all' ||
        (deviceTypeFilter === 'servers' && isServerType(device.deviceType)) ||
        (deviceTypeFilter === 'workstations' && !isServerType(device.deviceType));

      // Problem filter
      const matchesProblem = problemFilter === 'all' ||
        (problemFilter === 'problems' && (device.openAlerts > 0 || device.offline)) ||
        (problemFilter === 'healthy' && device.openAlerts === 0 && !device.offline);

      return matchesSearch && matchesOffline && matchesDeviceType && matchesProblem;
    });
  }, [devices, searchTerm, showOffline, deviceTypeFilter, problemFilter]);

  // Count stats
  const deviceStats = useMemo(() => {
    const online = devices.filter(d => !d.offline).length;
    const offline = devices.filter(d => d.offline).length;
    const withProblems = devices.filter(d => d.openAlerts > 0 || d.offline).length;
    const servers = devices.filter(d => isServerType(d.deviceType)).length;
    const workstations = devices.filter(d => !isServerType(d.deviceType)).length;
    return { online, offline, withProblems, servers, workstations };
  }, [devices]);

  const activeFiltersCount = [
    deviceTypeFilter !== 'all',
    problemFilter !== 'all',
    !showOffline,
  ].filter(Boolean).length;

  // Filter software
  const filteredSoftware = useMemo(() => {
    if (!selectedDevice) return [];
    const software = deviceSoftware[selectedDevice.id] || [];
    if (!softwareSearch) return software;
    const search = softwareSearch.toLowerCase();
    return software.filter(sw =>
      sw.name.toLowerCase().includes(search) ||
      sw.publisher?.toLowerCase().includes(search)
    );
  }, [selectedDevice, deviceSoftware, softwareSearch]);

  // Filter patches
  const filteredPatches = useMemo(() => {
    if (!selectedDevice) return [];
    const patches = devicePatches[selectedDevice.id];
    if (!patches) return [];
    const list = patchesTab === 'pending' ? patches.pending : patches.installed;
    if (!patchesSearch) return list;
    const search = patchesSearch.toLowerCase();
    return list.filter(p =>
      p.name.toLowerCase().includes(search) ||
      p.kbNumber?.toLowerCase().includes(search)
    );
  }, [selectedDevice, devicePatches, patchesTab, patchesSearch]);

  const resetFilters = () => {
    setDeviceTypeFilter('all');
    setProblemFilter('all');
    setShowOffline(true);
    setSearchTerm('');
  };

  const openDevice = (device: PortalDevice) => {
    setSelectedDevice(device);
    setActiveTab('overview');
    setSoftwareSearch('');
    setPatchesSearch('');
    setPatchesTab('pending');
  };

  const closePanel = () => {
    setSelectedDevice(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Meine Geräte</h2>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <Wifi size={14} /> {deviceStats.online} Online
            </span>
            <span className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
              <WifiOff size={14} /> {deviceStats.offline} Offline
            </span>
            {deviceStats.withProblems > 0 && (
              <span className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                <AlertTriangle size={14} /> {deviceStats.withProblems} mit Meldungen
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {teamviewerLink && (
            <a
              href={teamviewerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 bg-accent-primary hover:bg-accent-primary text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Headphones size={16} />
              <span className="hidden sm:inline">Remote-Support</span>
              <ExternalLink size={14} />
            </a>
          )}
          <Button
            onClick={loadDevices}
            variant="ghost"
            icon={<RefreshCw size={18} />}
          >
            <span className="hidden sm:inline">Aktualisieren</span>
          </Button>
        </div>
      </div>

      {/* Search & Filters Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Gerät, Benutzer suchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary focus:border-transparent text-sm"
            />
          </div>

          {/* Filter Toggle */}
          <Button
            onClick={() => setShowFilters(!showFilters)}
            variant={showFilters || activeFiltersCount > 0 ? 'primary' : 'ghost'}
            icon={<Filter size={16} />}
            className={activeFiltersCount > 0 ? 'bg-accent-lighter dark:bg-accent-primary/30 text-accent-dark dark:text-accent-primary' : ''}
          >
            Filter
            {activeFiltersCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-accent-primary text-white rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </Button>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap gap-3">
              {/* Device Type Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Typ:</span>
                <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                  {[
                    { value: 'all' as DeviceTypeFilter, label: 'Alle', count: devices.length },
                    { value: 'servers' as DeviceTypeFilter, label: 'Server', count: deviceStats.servers },
                    { value: 'workstations' as DeviceTypeFilter, label: 'Clients', count: deviceStats.workstations },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setDeviceTypeFilter(opt.value)}
                      className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                        deviceTypeFilter === opt.value
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                      }`}
                    >
                      {opt.label} ({opt.count})
                    </button>
                  ))}
                </div>
              </div>

              {/* Problem Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Status:</span>
                <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                  {[
                    { value: 'all' as ProblemFilter, label: 'Alle' },
                    { value: 'problems' as ProblemFilter, label: 'Mit Meldungen', icon: AlertTriangle, color: 'text-red-500' },
                    { value: 'healthy' as ProblemFilter, label: 'OK', icon: CheckCircle, color: 'text-green-500' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setProblemFilter(opt.value)}
                      className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors ${
                        problemFilter === opt.value
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                      }`}
                    >
                      {opt.icon && <opt.icon size={12} className={problemFilter === opt.value ? opt.color : ''} />}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Offline Toggle */}
              <label className="flex items-center gap-2 px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOffline}
                  onChange={(e) => setShowOffline(e.target.checked)}
                  className="rounded border-gray-300 text-accent-primary focus:ring-accent-primary w-3.5 h-3.5"
                />
                <span className="text-xs text-gray-600 dark:text-gray-300">Offline zeigen</span>
              </label>

              {/* Reset Filters */}
              {activeFiltersCount > 0 && (
                <button
                  onClick={resetFilters}
                  className="text-xs text-accent-primary dark:text-accent-primary hover:underline"
                >
                  Filter zurücksetzen
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Results Info */}
      {(searchTerm || activeFiltersCount > 0) && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {filteredDevices.length} von {devices.length} Geräten
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {filteredDevices.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <Monitor size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            {searchTerm ? 'Keine Geräte gefunden' : 'Keine Geräte vorhanden'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredDevices.map(device => {
            const DeviceIcon = getDeviceIcon(device.deviceType);
            const isSelected = selectedDevice?.id === device.id;

            return (
              <button
                key={device.id}
                onClick={() => openDevice(device)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                  isSelected
                    ? 'border-accent-primary bg-accent-light dark:bg-accent-primary/20'
                    : device.offline
                    ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 opacity-60'
                    : 'border-green-200 dark:border-green-800 bg-white dark:bg-gray-800 hover:border-green-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-lg ${
                    device.offline
                      ? 'bg-gray-100 dark:bg-gray-700'
                      : 'bg-green-100 dark:bg-green-900/30'
                  }`}>
                    <DeviceIcon size={22} className={
                      device.offline
                        ? 'text-gray-500 dark:text-gray-400'
                        : 'text-green-600 dark:text-green-400'
                    } />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate text-sm">
                        {device.displayName || device.systemName}
                      </h3>
                      {device.openAlerts > 0 && (
                        <span className="flex items-center gap-0.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          <AlertTriangle size={10} />
                          {device.openAlerts}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {device.osVersion || device.osName}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-400 dark:text-gray-500">
                      {device.offline ? (
                        <WifiOff size={12} />
                      ) : (
                        <Wifi size={12} className="text-green-500" />
                      )}
                      <span>{formatRelativeTime(device.lastContact)}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Side Panel / Slide-over */}
      {selectedDevice && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
            onClick={closePanel}
          />

          {/* Panel */}
          <div className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] lg:w-[600px] bg-white dark:bg-gray-800 shadow-2xl transform transition-transform duration-300 ease-out flex flex-col`}>
            {/* Panel Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2 rounded-lg ${
                  selectedDevice.offline
                    ? 'bg-gray-200 dark:bg-gray-700'
                    : 'bg-green-100 dark:bg-green-900/30'
                }`}>
                  {(() => {
                    const DeviceIcon = getDeviceIcon(selectedDevice.deviceType);
                    return <DeviceIcon size={24} className={
                      selectedDevice.offline
                        ? 'text-gray-500'
                        : 'text-green-600 dark:text-green-400'
                    } />;
                  })()}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-900 dark:text-white truncate">
                    {selectedDevice.displayName || selectedDevice.systemName}
                  </h3>
                  <div className="flex items-center gap-2 text-sm">
                    {selectedDevice.offline ? (
                      <span className="flex items-center gap-1 text-gray-500">
                        <WifiOff size={12} /> Offline
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <Wifi size={12} /> Online
                      </span>
                    )}
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-500 dark:text-gray-400">{formatRelativeTime(selectedDevice.lastContact)}</span>
                  </div>
                </div>
              </div>
              <IconButton
                icon={<X size={20} />}
                onClick={closePanel}
                tooltip="Schließen"
                className="flex-shrink-0"
              />
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2">
              {[
                { id: 'overview' as DetailTab, label: 'Übersicht', icon: Info },
                { id: 'software' as DetailTab, label: 'Software', icon: Package },
                { id: 'updates' as DetailTab, label: 'Updates', icon: Shield },
                { id: 'alerts' as DetailTab, label: 'Meldungen', icon: AlertTriangle, count: deviceAlerts[selectedDevice.id]?.filter(a => !a.resolved).length },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-accent-primary text-accent-primary dark:text-accent-primary'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <tab.icon size={16} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* System Info */}
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <Monitor size={16} /> System
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <InfoItem label="Betriebssystem" value={selectedDevice.osVersion || selectedDevice.osName} />
                      <InfoItem label="Architektur" value={selectedDevice.osArchitecture} />
                      <InfoItem label="Hersteller" value={selectedDevice.manufacturer} />
                      <InfoItem label="Modell" value={selectedDevice.model} />
                      {selectedDevice.serialNumber && (
                        <InfoItem label="Seriennummer" value={selectedDevice.serialNumber} mono />
                      )}
                    </div>
                  </div>

                  {/* Hardware Info */}
                  {(selectedDevice.processorName || selectedDevice.memoryGb) && (
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                        <Cpu size={16} /> Hardware
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        {selectedDevice.processorName && (
                          <div className="col-span-2">
                            <InfoItem
                              label="Prozessor"
                              value={`${selectedDevice.processorName}${selectedDevice.processorCores ? ` (${selectedDevice.processorCores} Kerne)` : ''}`}
                            />
                          </div>
                        )}
                        {selectedDevice.memoryGb && (
                          <InfoItem label="Arbeitsspeicher" value={`${selectedDevice.memoryGb} GB`} />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Network Info */}
                  {(selectedDevice.privateIp || selectedDevice.publicIp) && (
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                        <Globe size={16} /> Netzwerk
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        {selectedDevice.privateIp && (
                          <InfoItem label="Lokale IP" value={selectedDevice.privateIp} mono />
                        )}
                        {selectedDevice.publicIp && (
                          <InfoItem label="Öffentliche IP" value={selectedDevice.publicIp} mono />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Activity Info */}
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <Activity size={16} /> Aktivität
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedDevice.lastLoggedInUser && (
                        <InfoItem label="Letzter Benutzer" value={selectedDevice.lastLoggedInUser} />
                      )}
                      <InfoItem label="Zuletzt online" value={formatRelativeTime(selectedDevice.lastContact)} />
                      {selectedDevice.lastBoot && (
                        <InfoItem label="Letzter Neustart" value={formatDate(selectedDevice.lastBoot)} />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Software Tab */}
              {activeTab === 'software' && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Software suchen..."
                        value={softwareSearch}
                        onChange={(e) => setSoftwareSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <IconButton
                      icon={<RefreshCw size={16} className={loadingSoftware === selectedDevice.id ? 'animate-spin' : ''} />}
                      onClick={() => loadDeviceSoftware(selectedDevice.id, true)}
                      disabled={loadingSoftware === selectedDevice.id}
                      tooltip="Aktualisieren"
                    />
                  </div>

                  {loadingSoftware === selectedDevice.id ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
                    </div>
                  ) : filteredSoftware.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <Package size={32} className="mx-auto mb-2 opacity-50" />
                      <p>{softwareSearch ? 'Keine Treffer' : 'Keine Software gefunden'}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        {filteredSoftware.length} Programme
                      </p>
                      {filteredSoftware.map(sw => (
                        <div key={sw.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                          <p className="font-medium text-sm text-gray-900 dark:text-white">{sw.name}</p>
                          <div className="flex items-center justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
                            <span>{sw.publisher || '-'}</span>
                            <div className="flex items-center gap-3">
                              <span className="font-mono">{sw.version || '-'}</span>
                              {sw.installDate && <span>{formatSoftwareDate(sw.installDate)}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Updates Tab */}
              {activeTab === 'updates' && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Update suchen (KB...)..."
                        value={patchesSearch}
                        onChange={(e) => setPatchesSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <IconButton
                      icon={<RefreshCw size={16} className={loadingPatches === selectedDevice.id ? 'animate-spin' : ''} />}
                      onClick={() => loadDevicePatches(selectedDevice.id, true)}
                      disabled={loadingPatches === selectedDevice.id}
                      tooltip="Aktualisieren"
                    />
                  </div>

                  {/* Tabs for pending/installed */}
                  <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                    <button
                      onClick={() => setPatchesTab('pending')}
                      className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
                        patchesTab === 'pending'
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      Ausstehend ({devicePatches[selectedDevice.id]?.pending?.length || 0})
                    </button>
                    <button
                      onClick={() => setPatchesTab('installed')}
                      className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
                        patchesTab === 'installed'
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      Installiert ({devicePatches[selectedDevice.id]?.installed?.length || 0})
                    </button>
                  </div>

                  {loadingPatches === selectedDevice.id ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
                    </div>
                  ) : filteredPatches.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <Shield size={32} className="mx-auto mb-2 opacity-50" />
                      <p>{patchesSearch ? 'Keine Treffer' : patchesTab === 'pending' ? 'Keine ausstehenden Updates' : 'Keine Updates gefunden'}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredPatches.map(patch => (
                        <div key={patch.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-sm text-gray-900 dark:text-white">{patch.name}</p>
                              {patch.kbNumber && (
                                <p className="text-xs font-mono text-accent-primary dark:text-accent-primary mt-0.5">{patch.kbNumber}</p>
                              )}
                            </div>
                            {patch.severity && (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${getSeverityStyle(patch.severity).bg} ${getSeverityStyle(patch.severity).text}`}>
                                {patch.severity}
                              </span>
                            )}
                          </div>
                          {patchesTab === 'installed' && patch.installDate && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1">
                              <CheckCircle size={12} className="text-green-500" />
                              Installiert: {formatSoftwareDate(patch.installDate)}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Alerts Tab */}
              {activeTab === 'alerts' && (
                <div className="space-y-3">
                  {loadingAlerts === selectedDevice.id ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
                    </div>
                  ) : (deviceAlerts[selectedDevice.id] || []).length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle size={48} className="mx-auto text-green-500 mb-3" />
                      <p className="text-green-600 dark:text-green-400 font-medium">Keine Meldungen</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Alles in Ordnung</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {(deviceAlerts[selectedDevice.id] || []).filter(a => !a.resolved).length} offene Meldungen
                      </p>
                      {(deviceAlerts[selectedDevice.id] || []).map(alert => {
                        const style = getSeverityStyle(alert.severity);
                        return (
                          <div
                            key={alert.id}
                            className={`p-3 rounded-lg ${style.bg} ${alert.resolved ? 'opacity-60' : ''}`}
                          >
                            <div className="flex items-start gap-2">
                              <AlertTriangle size={16} className={`mt-0.5 flex-shrink-0 ${style.icon}`} />
                              <div className="flex-1 min-w-0">
                                <p className={`font-medium text-sm ${style.text}`}>
                                  {alert.message}
                                </p>
                                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  <Clock size={12} />
                                  <span>{formatRelativeTime(alert.activityTime)}</span>
                                  {alert.resolved && (
                                    <>
                                      <span>•</span>
                                      <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                                        <CheckCircle size={12} /> Gelöst
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Helper component for info items
const InfoItem = ({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) => {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-sm font-medium text-gray-900 dark:text-white ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
};

export default PortalDevices;
