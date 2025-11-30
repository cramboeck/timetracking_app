import { useState, useEffect } from 'react';
import { Monitor, Laptop, Server, Smartphone, Wifi, WifiOff, RefreshCw, Search, User, Globe, Network, AlertTriangle, ChevronDown, ChevronUp, Clock, CheckCircle, Info, HardDrive } from 'lucide-react';
import { customerPortalApi, PortalContact, PortalDevice, PortalDeviceAlert } from '../../services/api';

interface PortalDevicesProps {
  contact: PortalContact;
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
        <button
          onClick={loadDevices}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <RefreshCw size={18} />
          Aktualisieren
        </button>
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

      {/* Devices Grid */}
      {filteredDevices.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Monitor size={48} className="mx-auto mb-4 opacity-50" />
          <p>Keine Geräte gefunden</p>
        </div>
      ) : (
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
                        {device.osName} {device.osVersion}
                      </p>

                      <div className="mt-3 space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
                        {device.lastLoggedInUser && (
                          <div className="flex items-center gap-1.5">
                            <User size={12} />
                            <span className="truncate">{device.lastLoggedInUser}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <RefreshCw size={12} />
                          <span>Zuletzt: {formatDate(device.lastContact)}</span>
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
                    {/* Device Details */}
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
