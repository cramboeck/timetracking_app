import { useState, useEffect } from 'react';
import {
  Settings, Save, RefreshCw, Link2, Unlink, CheckCircle, XCircle,
  AlertTriangle, Server, Building, Clock, ExternalLink, Shield, Monitor,
  Wifi, WifiOff
} from 'lucide-react';
import { ninjaApi, NinjaRMMConfig, NinjaSyncStatus, NinjaOrganization, NinjaDevice } from '../services/api';
import { customersApi } from '../services/api';
import { Customer } from '../types';

export const NinjaRMMSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<NinjaRMMConfig | null>(null);
  const [syncStatus, setSyncStatus] = useState<NinjaSyncStatus | null>(null);
  const [organizations, setOrganizations] = useState<NinjaOrganization[]>([]);
  const [devices, setDevices] = useState<NinjaDevice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [instanceUrl, setInstanceUrl] = useState('https://eu.ninjarmm.com');
  const [autoSyncDevices, setAutoSyncDevices] = useState(false);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(60);

  // Connection state
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);

  // Active section
  const [activeSection, setActiveSection] = useState<'config' | 'organizations' | 'devices' | 'sync'>('config');

  useEffect(() => {
    loadData();

    // Check for OAuth callback params
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('ninja_connected') === 'true') {
      setSuccess('Erfolgreich mit NinjaRMM verbunden!');
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      loadData();
    } else if (urlParams.get('ninja_error')) {
      setError(`OAuth Fehler: ${urlParams.get('ninja_error')}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [configRes, customersRes] = await Promise.all([
        ninjaApi.getConfig(),
        customersApi.getAll(),
      ]);

      if (configRes.success && configRes.data) {
        setConfig(configRes.data);
        setInstanceUrl(configRes.data.instanceUrl || 'https://eu.ninjarmm.com');
        setAutoSyncDevices(configRes.data.autoSyncDevices);
        setSyncIntervalMinutes(configRes.data.syncIntervalMinutes);

        // Load sync status, organizations and devices if connected
        if (configRes.data.isConnected) {
          const [statusRes, orgsRes, devicesRes] = await Promise.all([
            ninjaApi.getSyncStatus(),
            ninjaApi.getOrganizations(),
            ninjaApi.getDevices(),
          ]);
          if (statusRes.success) setSyncStatus(statusRes.data);
          if (orgsRes.success) setOrganizations(orgsRes.data);
          if (devicesRes.success) setDevices(devicesRes.data);
        }
      }

      if (customersRes.success) {
        setCustomers(customersRes.data);
      }
    } catch (err: any) {
      setError('Fehler beim Laden der Konfiguration');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const result = await ninjaApi.saveConfig({
        clientId: clientId || undefined,
        clientSecret: clientSecret || undefined,
        instanceUrl,
        autoSyncDevices,
        syncIntervalMinutes,
      });

      if (result.success) {
        setConfig(result.data);
        setClientId('');
        setClientSecret('');
        setSuccess('Konfiguration gespeichert');
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    try {
      setConnecting(true);
      setError('');

      const result = await ninjaApi.getAuthUrl();
      if (result.success) {
        // Redirect to NinjaRMM OAuth
        window.location.href = result.data.authUrl;
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Verbinden');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Möchtest du die Verbindung zu NinjaRMM wirklich trennen?')) return;

    try {
      setError('');
      await ninjaApi.disconnect();
      setConfig(prev => prev ? { ...prev, isConnected: false } : null);
      setSyncStatus(null);
      setOrganizations([]);
      setSuccess('Verbindung getrennt');
    } catch (err: any) {
      setError(err.message || 'Fehler beim Trennen');
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setError('');
      setSuccess('');

      const result = await ninjaApi.testConnection();
      if (result.success) {
        setSuccess(`Verbindung OK! ${result.data?.organizationCount} Organisationen, ${result.data?.deviceCount} Geräte gefunden.`);
      } else {
        setError(result.error || 'Verbindung fehlgeschlagen');
      }
    } catch (err: any) {
      setError(err.message || 'Verbindungstest fehlgeschlagen');
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setError('');
      setSuccess('');

      const result = await ninjaApi.syncAll();
      if (result.success) {
        const { organizations: orgs, devices, alerts } = result.data;
        setSuccess(`Sync abgeschlossen: ${orgs.synced} Orgs, ${devices.synced} Geräte, ${alerts.synced} Alerts`);

        // Reload data
        const [statusRes, orgsRes, devicesRes] = await Promise.all([
          ninjaApi.getSyncStatus(),
          ninjaApi.getOrganizations(),
          ninjaApi.getDevices(),
        ]);
        if (statusRes.success) setSyncStatus(statusRes.data);
        if (orgsRes.success) setOrganizations(orgsRes.data);
        if (devicesRes.success) setDevices(devicesRes.data);
      }
    } catch (err: any) {
      setError(err.message || 'Sync fehlgeschlagen');
    } finally {
      setSyncing(false);
    }
  };

  const handleLinkOrganization = async (orgId: string, customerId: string | null) => {
    try {
      await ninjaApi.linkOrganization(orgId, customerId);
      // Update local state
      setOrganizations(prev => prev.map(org =>
        org.id === orgId
          ? { ...org, customerId, customerName: customers.find(c => c.id === customerId)?.name || null }
          : org
      ));
    } catch (err: any) {
      setError(err.message || 'Fehler beim Verknüpfen');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">NinjaRMM Integration</h2>
          <p className="text-sm text-gray-500 dark:text-dark-400">Geräte und Alerts aus NinjaRMM synchronisieren</p>
        </div>
        {config?.isConnected && (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle size={20} />
            <span className="text-sm font-medium">Verbunden</span>
          </div>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
          <XCircle className="text-red-500 flex-shrink-0" size={20} />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3">
          <CheckCircle className="text-green-500 flex-shrink-0" size={20} />
          <p className="text-sm text-green-700 dark:text-green-300">{success}</p>
        </div>
      )}

      {/* Section Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-dark-200 overflow-x-auto">
        {[
          { id: 'config', label: 'Konfiguration', icon: Settings },
          { id: 'organizations', label: 'Organisationen', icon: Building },
          { id: 'devices', label: 'Geräte', icon: Monitor },
          { id: 'sync', label: 'Synchronisation', icon: RefreshCw },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeSection === tab.id
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-dark-400 dark:hover:text-dark-200'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Configuration Section */}
      {activeSection === 'config' && (
        <div className="space-y-6">
          {/* API Credentials */}
          <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Shield className="text-blue-600 dark:text-blue-400" size={20} />
              </div>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">API Zugangsdaten</h3>
                <p className="text-sm text-gray-500 dark:text-dark-400">Client ID und Secret aus NinjaRMM</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
                  Instance URL
                </label>
                <select
                  value={instanceUrl}
                  onChange={(e) => setInstanceUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                >
                  <option value="https://eu.ninjarmm.com">EU (eu.ninjarmm.com)</option>
                  <option value="https://app.ninjarmm.com">US (app.ninjarmm.com)</option>
                  <option value="https://oc.ninjarmm.com">Oceania (oc.ninjarmm.com)</option>
                  <option value="https://ca.ninjarmm.com">Canada (ca.ninjarmm.com)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
                  Client ID {config?.hasClientId && <span className="text-green-500">(gespeichert)</span>}
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder={config?.hasClientId ? '••••••••' : 'Client ID eingeben'}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
                  Client Secret {config?.hasClientSecret && <span className="text-green-500">(gespeichert)</span>}
                </label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder={config?.hasClientSecret ? '••••••••' : 'Client Secret eingeben'}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSaveConfig}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-dark disabled:opacity-50"
                >
                  <Save size={16} />
                  {saving ? 'Speichern...' : 'Speichern'}
                </button>

                {config?.hasClientId && config?.hasClientSecret && !config?.isConnected && (
                  <button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    <Link2 size={16} />
                    {connecting ? 'Verbinden...' : 'Mit NinjaRMM verbinden'}
                  </button>
                )}

                {config?.isConnected && (
                  <>
                    <button
                      onClick={handleTestConnection}
                      disabled={testing}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      <RefreshCw size={16} className={testing ? 'animate-spin' : ''} />
                      Testen
                    </button>
                    <button
                      onClick={handleDisconnect}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      <Unlink size={16} />
                      Trennen
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Sync Settings */}
          <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Clock className="text-purple-600 dark:text-purple-400" size={20} />
              </div>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">Synchronisations-Einstellungen</h3>
                <p className="text-sm text-gray-500 dark:text-dark-400">Automatische Gerätesynchronisation</p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSyncDevices}
                  onChange={(e) => setAutoSyncDevices(e.target.checked)}
                  className="w-5 h-5 text-accent-primary rounded border-gray-300 focus:ring-accent-primary"
                />
                <span className="text-gray-700 dark:text-dark-300">Automatische Synchronisation aktivieren</span>
              </label>

              {autoSyncDevices && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
                    Sync-Intervall (Minuten)
                  </label>
                  <input
                    type="number"
                    min="15"
                    max="1440"
                    value={syncIntervalMinutes}
                    onChange={(e) => setSyncIntervalMinutes(parseInt(e.target.value) || 60)}
                    className="w-32 px-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Help */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
            <h3 className="font-medium text-blue-900 dark:text-blue-200 mb-2">Einrichtung</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800 dark:text-blue-300">
              <li>Erstelle eine API Application in NinjaRMM unter Administration &gt; Apps &gt; API</li>
              <li>Wähle "Authorization Code" als Grant Type</li>
              <li>Füge diese Redirect URI hinzu: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{window.location.origin}/api/ninjarmm/callback</code></li>
              <li>Kopiere Client ID und Client Secret hierher</li>
              <li>Klicke auf "Mit NinjaRMM verbinden" um die OAuth-Autorisierung durchzuführen</li>
            </ol>
            <a
              href="https://eu.ninjarmm.com/#/administration/apps/api"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              NinjaRMM API Apps öffnen <ExternalLink size={14} />
            </a>
          </div>
        </div>
      )}

      {/* Organizations Section */}
      {activeSection === 'organizations' && (
        <div className="space-y-4">
          {!config?.isConnected ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-400">
              <Building size={48} className="mx-auto mb-3 opacity-50" />
              <p>Verbinde zuerst mit NinjaRMM um Organisationen zu sehen</p>
            </div>
          ) : organizations.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-400">
              <Building size={48} className="mx-auto mb-3 opacity-50" />
              <p>Keine Organisationen gefunden. Führe eine Synchronisation durch.</p>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-dark mx-auto"
              >
                <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Synchronisiere...' : 'Jetzt synchronisieren'}
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-dark-200">
                <h3 className="font-medium text-gray-900 dark:text-white">Organisationen mit Kunden verknüpfen</h3>
                <p className="text-sm text-gray-500 dark:text-dark-400">Verknüpfe NinjaRMM Organisationen mit deinen Kunden</p>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-dark-200">
                {organizations.map(org => (
                  <div key={org.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">{org.name}</p>
                      <p className="text-sm text-gray-500 dark:text-dark-400">
                        {org.deviceCount} Geräte
                        {org.description && ` • ${org.description}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <select
                        value={org.customerId || ''}
                        onChange={(e) => handleLinkOrganization(org.id, e.target.value || null)}
                        className="px-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm"
                      >
                        <option value="">-- Kein Kunde --</option>
                        {customers.map(customer => (
                          <option key={customer.id} value={customer.id}>{customer.name}</option>
                        ))}
                      </select>
                      {org.customerId && (
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <Link2 size={16} />
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Devices Section */}
      {activeSection === 'devices' && (
        <div className="space-y-4">
          {!config?.isConnected ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-400">
              <Monitor size={48} className="mx-auto mb-3 opacity-50" />
              <p>Verbinde zuerst mit NinjaRMM um Geräte zu sehen</p>
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-400">
              <Monitor size={48} className="mx-auto mb-3 opacity-50" />
              <p>Keine Geräte gefunden. Führe eine Synchronisation durch.</p>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-dark mx-auto"
              >
                <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Synchronisiere...' : 'Jetzt synchronisieren'}
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-dark-200 flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">Geräte ({devices.length})</h3>
                  <p className="text-sm text-gray-500 dark:text-dark-400">Synchronisierte Geräte aus NinjaRMM</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <Wifi size={14} />
                    {devices.filter(d => !d.offline).length} Online
                  </span>
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <WifiOff size={14} />
                    {devices.filter(d => d.offline).length} Offline
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-dark-50 text-left text-sm text-gray-500 dark:text-dark-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Gerät</th>
                      <th className="px-4 py-3 font-medium">Organisation</th>
                      <th className="px-4 py-3 font-medium">Typ</th>
                      <th className="px-4 py-3 font-medium">Betriebssystem</th>
                      <th className="px-4 py-3 font-medium">Letzter Kontakt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-dark-200">
                    {devices.map(device => (
                      <tr key={device.id} className="hover:bg-gray-50 dark:hover:bg-dark-50">
                        <td className="px-4 py-3">
                          {device.offline ? (
                            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                              <WifiOff size={16} />
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <Wifi size={16} />
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {device.displayName || device.systemName}
                          </p>
                          {device.displayName && device.systemName !== device.displayName && (
                            <p className="text-sm text-gray-500 dark:text-dark-400">{device.systemName}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-dark-300">
                          {device.organizationName}
                          {device.customerName && (
                            <span className="text-sm text-gray-500 dark:text-dark-400 ml-1">
                              ({device.customerName})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-300">
                            {device.nodeClass?.replace(/_/g, ' ') || 'Unbekannt'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-dark-300">
                          {device.osName || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-dark-400">
                          {device.lastContact
                            ? new Date(device.lastContact).toLocaleString('de-DE')
                            : '-'
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sync Section */}
      {activeSection === 'sync' && (
        <div className="space-y-6">
          {!config?.isConnected ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-400">
              <RefreshCw size={48} className="mx-auto mb-3 opacity-50" />
              <p>Verbinde zuerst mit NinjaRMM</p>
            </div>
          ) : (
            <>
              {/* Sync Status */}
              <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-medium text-gray-900 dark:text-white">Sync Status</h3>
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-dark disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                    {syncing ? 'Synchronisiere...' : 'Jetzt synchronisieren'}
                  </button>
                </div>

                {syncStatus && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 dark:bg-dark-50 rounded-lg p-4">
                      <p className="text-sm text-gray-500 dark:text-dark-400">Organisationen</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{syncStatus.organizationCount}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-dark-50 rounded-lg p-4">
                      <p className="text-sm text-gray-500 dark:text-dark-400">Geräte</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{syncStatus.deviceCount}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-dark-50 rounded-lg p-4">
                      <p className="text-sm text-gray-500 dark:text-dark-400">Alerts</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{syncStatus.alertCount}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-dark-50 rounded-lg p-4">
                      <p className="text-sm text-gray-500 dark:text-dark-400">Offene Alerts</p>
                      <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{syncStatus.unresolvedAlertCount}</p>
                    </div>
                  </div>
                )}

                {syncStatus?.lastSync && (
                  <p className="text-sm text-gray-500 dark:text-dark-400 mt-4">
                    Letzte Synchronisation: {new Date(syncStatus.lastSync).toLocaleString('de-DE')}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
