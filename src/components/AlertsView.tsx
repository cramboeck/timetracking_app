import { useState, useEffect, useMemo } from 'react';
import {
  Bell, AlertTriangle, CheckCircle, Search, RefreshCw,
  X, Ticket, Monitor, Clock
} from 'lucide-react';
import { ninjaApi, NinjaAlert, NinjaRMMConfig } from '../services/api';

export const AlertsView = () => {
  const [alerts, setAlerts] = useState<NinjaAlert[]>([]);
  const [config, setConfig] = useState<NinjaRMMConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedAlert, setSelectedAlert] = useState<NinjaAlert | null>(null);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [resolvingAlert, setResolvingAlert] = useState(false);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [configRes, alertsRes] = await Promise.all([
        ninjaApi.getConfig(),
        ninjaApi.getAlerts(),
      ]);
      if (configRes.success) setConfig(configRes.data);
      if (alertsRes.success) setAlerts(alertsRes.data);
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
      await ninjaApi.sync();
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateTicket = async (alertId: string) => {
    try {
      setCreatingTicket(true);
      setError('');
      const result = await ninjaApi.createTicketFromAlert(alertId);
      if (result.success) {
        setSuccess('Ticket erstellt');
        setAlerts(prev => prev.map(a =>
          a.id === alertId ? { ...a, ticketId: result.data.ticketId } : a
        ));
        if (selectedAlert?.id === alertId) {
          setSelectedAlert(prev => prev ? { ...prev, ticketId: result.data.ticketId } : null);
        }
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleResolve = async (alertId: string) => {
    try {
      setResolvingAlert(true);
      setError('');
      const result = await ninjaApi.resolveAlert(alertId);
      if (result.success) {
        setSuccess('Alert als gelöst markiert');
        setAlerts(prev => prev.map(a =>
          a.id === alertId ? { ...a, resolved: true, resolvedAt: new Date().toISOString() } : a
        ));
        if (selectedAlert?.id === alertId) {
          setSelectedAlert(prev => prev ? { ...prev, resolved: true, resolvedAt: new Date().toISOString() } : null);
        }
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResolvingAlert(false);
    }
  };

  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      const matchesSearch = search === '' ||
        alert.message.toLowerCase().includes(search.toLowerCase()) ||
        alert.deviceName?.toLowerCase().includes(search.toLowerCase()) ||
        alert.organizationName?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'open' && !alert.resolved) ||
        (statusFilter === 'resolved' && alert.resolved);

      return matchesSearch && matchesStatus;
    });
  }, [alerts, search, statusFilter]);

  const openCount = alerts.filter(a => !a.resolved).length;
  const resolvedCount = alerts.filter(a => a.resolved).length;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
      case 'MAJOR': return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300';
      case 'MODERATE': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300';
      case 'MINOR': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      default: return 'bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-300';
    }
  };

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
          <Bell size={48} className="mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            NinjaRMM nicht verbunden
          </h3>
          <p className="text-gray-500 dark:text-dark-400 mb-4">
            Verbinde NinjaRMM in den Einstellungen um Alerts zu sehen.
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
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Alerts</h2>
          <p className="text-sm text-gray-500 dark:text-dark-400">
            {alerts.length} Alerts synchronisiert
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

      {success && (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-300 text-sm">
          {success}
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-4">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertTriangle size={18} />
          <span className="font-medium">{openCount} Offen</span>
        </div>
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <CheckCircle size={18} />
          <span className="font-medium">{resolvedCount} Gelöst</span>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Alert suchen..."
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
          <option value="open">Offen</option>
          <option value="resolved">Gelöst</option>
        </select>
      </div>

      {/* Alert List */}
      <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-dark-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase">Severity</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase">Gerät</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase hidden md:table-cell">Nachricht</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase hidden lg:table-cell">Zeit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-dark-200">
            {filteredAlerts.map(alert => (
              <tr
                key={alert.id}
                onClick={() => setSelectedAlert(alert)}
                className="hover:bg-gray-50 dark:hover:bg-dark-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  {alert.resolved ? (
                    <CheckCircle size={18} className="text-green-500" />
                  ) : (
                    <AlertTriangle size={18} className="text-red-500" />
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                    {alert.severity || 'INFO'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {alert.deviceName || 'Unbekannt'}
                  </p>
                  {alert.organizationName && (
                    <p className="text-sm text-gray-500 dark:text-dark-400">{alert.organizationName}</p>
                  )}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <p className="text-gray-700 dark:text-dark-300 max-w-md truncate" title={alert.message}>
                    {alert.message}
                  </p>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-gray-500 dark:text-dark-400 text-sm">
                  {alert.activityTime ? new Date(alert.activityTime).toLocaleString('de-DE') : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredAlerts.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-dark-400">
            Keine Alerts gefunden
          </div>
        )}
      </div>

      {/* Alert Detail Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-100 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-200">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${selectedAlert.resolved ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                  {selectedAlert.resolved ? (
                    <CheckCircle className="text-green-600 dark:text-green-400" size={20} />
                  ) : (
                    <AlertTriangle className="text-red-600 dark:text-red-400" size={20} />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {selectedAlert.deviceName || 'Unbekanntes Gerät'}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-dark-400">
                    {selectedAlert.resolved ? 'Gelöst' : 'Offen'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh-200px)]">
              {/* Message */}
              <div className="bg-gray-50 dark:bg-dark-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">Nachricht</h4>
                <p className="text-gray-700 dark:text-dark-300 whitespace-pre-wrap">{selectedAlert.message}</p>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-dark-50 rounded-lg p-4">
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Severity</dt>
                      <dd><span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(selectedAlert.severity)}`}>{selectedAlert.severity || 'INFO'}</span></dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Priorität</dt>
                      <dd className="text-gray-900 dark:text-white">{selectedAlert.priority || 'NORMAL'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Quelle</dt>
                      <dd className="text-gray-900 dark:text-white">{selectedAlert.sourceName || 'N/A'}</dd>
                    </div>
                  </dl>
                </div>
                <div className="bg-gray-50 dark:bg-dark-50 rounded-lg p-4">
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Organisation</dt>
                      <dd className="text-gray-900 dark:text-white">{selectedAlert.organizationName || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Zeit</dt>
                      <dd className="text-gray-900 dark:text-white">
                        {selectedAlert.activityTime ? new Date(selectedAlert.activityTime).toLocaleString('de-DE') : '-'}
                      </dd>
                    </div>
                    {selectedAlert.ticketId && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500 dark:text-dark-400">Ticket</dt>
                        <dd className="text-accent-primary font-medium">Verknüpft</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between gap-3 p-4 border-t border-gray-200 dark:border-dark-200">
              <div className="flex gap-2">
                {!selectedAlert.ticketId && (
                  <button
                    onClick={() => handleCreateTicket(selectedAlert.id)}
                    disabled={creatingTicket}
                    className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-dark disabled:opacity-50"
                  >
                    <Ticket size={16} />
                    {creatingTicket ? 'Erstelle...' : 'Ticket erstellen'}
                  </button>
                )}
                {!selectedAlert.resolved && (
                  <button
                    onClick={() => handleResolve(selectedAlert.id)}
                    disabled={resolvingAlert}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle size={16} />
                    {resolvingAlert ? 'Markiere...' : 'Als gelöst markieren'}
                  </button>
                )}
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
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
