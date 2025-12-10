import { useState, useEffect, useMemo } from 'react';
import {
  Settings, Save, RefreshCw, Link2, Unlink, CheckCircle, XCircle,
  AlertTriangle, Server, Building, Clock, ExternalLink, Shield, Monitor,
  Wifi, WifiOff, Bell, Ticket, X, Cpu, HardDrive, Globe, User, Search,
  Webhook, Copy, Key, Eye, EyeOff, Zap
} from 'lucide-react';
import { ninjaApi, NinjaRMMConfig, NinjaSyncStatus, NinjaOrganization, NinjaDevice, NinjaAlert } from '../services/api';
import { customersApi } from '../services/api';
import { Customer } from '../types';

export const NinjaRMMSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<NinjaRMMConfig | null>(null);
  const [syncStatus, setSyncStatus] = useState<NinjaSyncStatus | null>(null);
  const [organizations, setOrganizations] = useState<NinjaOrganization[]>([]);
  const [devices, setDevices] = useState<NinjaDevice[]>([]);
  const [alerts, setAlerts] = useState<NinjaAlert[]>([]);
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
  const [activeSection, setActiveSection] = useState<'config' | 'organizations' | 'devices' | 'alerts' | 'sync' | 'webhook'>('config');

  // Webhook state
  const [webhookConfig, setWebhookConfig] = useState<{
    webhookUrl: string;
    webhookEnabled: boolean;
    webhookSecret: string | null;
    hasSecret: boolean;
    autoCreateTickets: boolean;
    minSeverity: string;
    autoResolveTickets: boolean;
  } | null>(null);
  const [webhookEvents, setWebhookEvents] = useState<any[]>([]);
  const [loadingWebhook, setLoadingWebhook] = useState(false);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [generatingSecret, setGeneratingSecret] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [selectedPayload, setSelectedPayload] = useState<{ id: string; eventType: string; payload: any; createdAt: string } | null>(null);
  const [loadingPayload, setLoadingPayload] = useState(false);
  const [backfillingDeviceNames, setBackfillingDeviceNames] = useState(false);

  // Modal state
  const [selectedDevice, setSelectedDevice] = useState<NinjaDevice | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<NinjaAlert | null>(null);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [resolvingAlert, setResolvingAlert] = useState(false);
  const [refreshingDevice, setRefreshingDevice] = useState(false);

  // Search/Filter state
  const [deviceSearch, setDeviceSearch] = useState('');
  const [deviceStatusFilter, setDeviceStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [alertSearch, setAlertSearch] = useState('');
  const [alertStatusFilter, setAlertStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');

  // Filtered data
  const filteredDevices = useMemo(() => {
    return devices.filter(device => {
      const matchesSearch = deviceSearch === '' ||
        device.systemName.toLowerCase().includes(deviceSearch.toLowerCase()) ||
        device.displayName?.toLowerCase().includes(deviceSearch.toLowerCase()) ||
        device.organizationName.toLowerCase().includes(deviceSearch.toLowerCase()) ||
        device.customerName?.toLowerCase().includes(deviceSearch.toLowerCase());

      const matchesStatus = deviceStatusFilter === 'all' ||
        (deviceStatusFilter === 'online' && !device.offline) ||
        (deviceStatusFilter === 'offline' && device.offline);

      return matchesSearch && matchesStatus;
    });
  }, [devices, deviceSearch, deviceStatusFilter]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      const matchesSearch = alertSearch === '' ||
        alert.message.toLowerCase().includes(alertSearch.toLowerCase()) ||
        alert.deviceName?.toLowerCase().includes(alertSearch.toLowerCase()) ||
        alert.organizationName?.toLowerCase().includes(alertSearch.toLowerCase()) ||
        alert.sourceName?.toLowerCase().includes(alertSearch.toLowerCase());

      const matchesStatus = alertStatusFilter === 'all' ||
        (alertStatusFilter === 'open' && !alert.resolved) ||
        (alertStatusFilter === 'resolved' && alert.resolved);

      return matchesSearch && matchesStatus;
    });
  }, [alerts, alertSearch, alertStatusFilter]);

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

        // Load sync status, organizations, devices and alerts if connected
        if (configRes.data.isConnected) {
          const [statusRes, orgsRes, devicesRes, alertsRes] = await Promise.all([
            ninjaApi.getSyncStatus(),
            ninjaApi.getOrganizations(),
            ninjaApi.getDevices(),
            ninjaApi.getAlerts(),
          ]);
          if (statusRes.success) setSyncStatus(statusRes.data);
          if (orgsRes.success) setOrganizations(orgsRes.data);
          if (devicesRes.success) setDevices(devicesRes.data);
          if (alertsRes.success) setAlerts(alertsRes.data);
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
        const [statusRes, orgsRes, devicesRes, alertsRes] = await Promise.all([
          ninjaApi.getSyncStatus(),
          ninjaApi.getOrganizations(),
          ninjaApi.getDevices(),
          ninjaApi.getAlerts(),
        ]);
        if (statusRes.success) setSyncStatus(statusRes.data);
        if (orgsRes.success) setOrganizations(orgsRes.data);
        if (devicesRes.success) setDevices(devicesRes.data);
        if (alertsRes.success) setAlerts(alertsRes.data);
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

  const handleCreateTicketFromAlert = async (alertId: string) => {
    try {
      setCreatingTicket(true);
      setError('');
      const result = await ninjaApi.createTicketFromAlert(alertId);
      if (result.success) {
        setSuccess('Ticket erstellt');
        // Update alert in local state
        setAlerts(prev => prev.map(a =>
          a.id === alertId ? { ...a, ticketId: result.data.ticketId } : a
        ));
        if (selectedAlert?.id === alertId) {
          setSelectedAlert(prev => prev ? { ...prev, ticketId: result.data.ticketId } : null);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Erstellen des Tickets');
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      setResolvingAlert(true);
      setError('');
      const result = await ninjaApi.resolveAlert(alertId);
      if (result.success) {
        setSuccess('Alert als gelöst markiert');
        // Update alert in local state
        setAlerts(prev => prev.map(a =>
          a.id === alertId ? { ...a, resolved: true, resolvedAt: new Date().toISOString() } : a
        ));
        if (selectedAlert?.id === alertId) {
          setSelectedAlert(prev => prev ? { ...prev, resolved: true, resolvedAt: new Date().toISOString() } : null);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Markieren als gelöst');
    } finally {
      setResolvingAlert(false);
    }
  };

  const handleRefreshDeviceDetails = async (deviceId: string) => {
    try {
      setRefreshingDevice(true);
      setError('');
      const result = await ninjaApi.refreshDeviceDetails(deviceId);
      if (result.success) {
        setSuccess('Gerätedetails aktualisiert');
        // Update device in local state
        setDevices(prev => prev.map(d =>
          d.id === deviceId ? result.data : d
        ));
        // Update selected device
        if (selectedDevice?.id === deviceId) {
          setSelectedDevice(result.data);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Details');
    } finally {
      setRefreshingDevice(false);
    }
  };

  // Webhook functions
  const loadWebhookData = async () => {
    try {
      setLoadingWebhook(true);
      const [configRes, eventsRes] = await Promise.all([
        ninjaApi.getWebhookConfig(),
        ninjaApi.getWebhookEvents({ limit: 50 }),
      ]);
      if (configRes.success) {
        setWebhookConfig(configRes.data);
      }
      if (eventsRes.success) {
        setWebhookEvents(eventsRes.data);
      }
    } catch (err: any) {
      console.error('Fehler beim Laden der Webhook-Daten:', err);
    } finally {
      setLoadingWebhook(false);
    }
  };

  const loadWebhookPayload = async (eventId: string) => {
    try {
      setLoadingPayload(true);
      const result = await ninjaApi.getWebhookEventPayload(eventId);
      if (result.success) {
        setSelectedPayload(result.data);
      }
    } catch (err: any) {
      console.error('Fehler beim Laden des Payloads:', err);
    } finally {
      setLoadingPayload(false);
    }
  };

  const handleSaveWebhookConfig = async () => {
    if (!webhookConfig) return;
    try {
      setSavingWebhook(true);
      setError('');
      setSuccess('');
      const result = await ninjaApi.updateWebhookConfig({
        webhookEnabled: webhookConfig.webhookEnabled,
        autoCreateTickets: webhookConfig.autoCreateTickets,
        minSeverity: webhookConfig.minSeverity,
        autoResolveTickets: webhookConfig.autoResolveTickets,
      });
      if (result.success) {
        setSuccess('Webhook-Einstellungen gespeichert');
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern der Webhook-Einstellungen');
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleGenerateWebhookSecret = async () => {
    try {
      setGeneratingSecret(true);
      setError('');
      const result = await ninjaApi.generateWebhookSecret();
      if (result.success) {
        setWebhookConfig(prev => prev ? {
          ...prev,
          webhookUrl: result.data.webhookUrl, // Update URL with new secret
          hasSecret: true,
        } : null);
        setSuccess('Neues Webhook-Secret generiert. Kopiere jetzt die aktualisierte URL!');
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Generieren des Secrets');
    } finally {
      setGeneratingSecret(false);
    }
  };

  const handleBackfillDeviceNames = async () => {
    try {
      setBackfillingDeviceNames(true);
      setError('');
      setSuccess('');
      const result = await ninjaApi.backfillWebhookDeviceNames();
      if (result.success) {
        setSuccess(result.message || `${result.data.updatedCount} Gerätenamen nachgetragen`);
        // Reload webhook events to show updated device names
        loadWebhookData();
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Aktualisieren der Gerätenamen');
    } finally {
      setBackfillingDeviceNames(false);
    }
  };

  const copyWebhookUrl = async () => {
    if (!webhookConfig?.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookConfig.webhookUrl);
      setWebhookCopied(true);
      setTimeout(() => setWebhookCopied(false), 2000);
    } catch (err) {
      console.error('Kopieren fehlgeschlagen:', err);
    }
  };

  // Load webhook data when switching to webhook section
  useEffect(() => {
    if (activeSection === 'webhook' && config?.isConnected) {
      loadWebhookData();
    }
  }, [activeSection, config?.isConnected]);

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
          { id: 'alerts', label: 'Alerts', icon: Bell, badge: alerts.filter(a => !a.resolved).length },
          { id: 'webhook', label: 'Webhook', icon: Webhook },
          { id: 'sync', label: 'Synchronisation', icon: RefreshCw },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              activeSection === tab.id
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-dark-400 dark:hover:text-dark-200'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
            {'badge' in tab && tab.badge > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                {tab.badge}
              </span>
            )}
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

              {/* Honeypot fields to confuse browser autofill */}
              <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
                <input type="text" name="username" tabIndex={-1} autoComplete="username" />
                <input type="password" name="password" tabIndex={-1} autoComplete="current-password" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
                  Client ID {config?.hasClientId && <span className="text-green-500">(gespeichert)</span>}
                </label>
                <input
                  type="text"
                  id={`ninja_cid_${Date.now()}`}
                  name={`ninja_cid_${Date.now()}`}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  data-lpignore="true"
                  data-form-type="other"
                  data-1p-ignore="true"
                  readOnly
                  onFocus={(e) => e.target.removeAttribute('readOnly')}
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
                  type="text"
                  id={`ninja_sec_${Date.now()}`}
                  name={`ninja_sec_${Date.now()}`}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  data-lpignore="true"
                  data-form-type="other"
                  data-1p-ignore="true"
                  readOnly
                  onFocus={(e) => e.target.removeAttribute('readOnly')}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder={config?.hasClientSecret ? '••••••••' : 'Client Secret eingeben'}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                  style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties}
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
              <div className="p-4 border-b border-gray-200 dark:border-dark-200">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">Geräte ({filteredDevices.length}/{devices.length})</h3>
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
                {/* Search and Filter */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Suchen nach Name, Organisation, Kunde..."
                      value={deviceSearch}
                      onChange={(e) => setDeviceSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <select
                    value={deviceStatusFilter}
                    onChange={(e) => setDeviceStatusFilter(e.target.value as any)}
                    className="px-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="all">Alle Status</option>
                    <option value="online">Nur Online</option>
                    <option value="offline">Nur Offline</option>
                  </select>
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
                    {filteredDevices.map(device => (
                      <tr
                        key={device.id}
                        className="hover:bg-gray-50 dark:hover:bg-dark-50 cursor-pointer"
                        onClick={() => setSelectedDevice(device)}
                      >
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

      {/* Alerts Section */}
      {activeSection === 'alerts' && (
        <div className="space-y-4">
          {!config?.isConnected ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-400">
              <Bell size={48} className="mx-auto mb-3 opacity-50" />
              <p>Verbinde zuerst mit NinjaRMM um Alerts zu sehen</p>
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-400">
              <Bell size={48} className="mx-auto mb-3 opacity-50" />
              <p>Keine Alerts gefunden. Führe eine Synchronisation durch.</p>
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
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">Alerts ({filteredAlerts.length}/{alerts.length})</h3>
                    <p className="text-sm text-gray-500 dark:text-dark-400">Synchronisierte Alerts aus NinjaRMM</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                      <AlertTriangle size={14} />
                      {alerts.filter(a => !a.resolved).length} Offen
                    </span>
                    <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                      <CheckCircle size={14} />
                      {alerts.filter(a => a.resolved).length} Gelöst
                    </span>
                  </div>
                </div>
                {/* Search and Filter */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Suchen nach Nachricht, Gerät, Organisation..."
                      value={alertSearch}
                      onChange={(e) => setAlertSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <select
                    value={alertStatusFilter}
                    onChange={(e) => setAlertStatusFilter(e.target.value as any)}
                    className="px-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="all">Alle Status</option>
                    <option value="open">Nur Offen</option>
                    <option value="resolved">Nur Gelöst</option>
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-dark-50 text-left text-sm text-gray-500 dark:text-dark-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Schweregrad</th>
                      <th className="px-4 py-3 font-medium">Gerät</th>
                      <th className="px-4 py-3 font-medium">Nachricht</th>
                      <th className="px-4 py-3 font-medium">Zeitpunkt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-dark-200">
                    {filteredAlerts.map(alert => (
                      <tr
                        key={alert.id}
                        className="hover:bg-gray-50 dark:hover:bg-dark-50 cursor-pointer"
                        onClick={() => setSelectedAlert(alert)}
                      >
                        <td className="px-4 py-3">
                          {alert.resolved ? (
                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <CheckCircle size={16} />
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                              <AlertTriangle size={16} />
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            alert.severity === 'CRITICAL' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                            alert.severity === 'MAJOR' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' :
                            alert.severity === 'MODERATE' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' :
                            alert.severity === 'MINOR' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                            'bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-300'
                          }`}>
                            {alert.severity}
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
                        <td className="px-4 py-3">
                          <p className="text-gray-700 dark:text-dark-300 max-w-md truncate" title={alert.message}>
                            {alert.message}
                          </p>
                          {alert.sourceName && (
                            <p className="text-sm text-gray-500 dark:text-dark-400">{alert.sourceName}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-dark-400 whitespace-nowrap">
                          {alert.activityTime
                            ? new Date(alert.activityTime).toLocaleString('de-DE')
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

      {/* Webhook Section */}
      {activeSection === 'webhook' && (
        <div className="space-y-6">
          {!config?.isConnected ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-400">
              <Webhook size={48} className="mx-auto mb-3 opacity-50" />
              <p>Verbinde zuerst mit NinjaRMM um Webhooks zu konfigurieren</p>
            </div>
          ) : loadingWebhook ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="animate-spin text-gray-400" size={24} />
            </div>
          ) : (
            <>
              {/* Webhook URL & Secret */}
              <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <Webhook className="text-purple-600 dark:text-purple-400" size={20} />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">Webhook-Endpunkt</h3>
                    <p className="text-sm text-gray-500 dark:text-dark-400">NinjaRMM sendet Alerts an diese URL</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Webhook URL */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
                      Webhook URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={webhookConfig?.webhookUrl || ''}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-gray-50 dark:bg-dark-50 text-gray-900 dark:text-white font-mono text-sm"
                      />
                      <button
                        onClick={copyWebhookUrl}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-300 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300 transition-colors"
                      >
                        {webhookCopied ? (
                          <>
                            <CheckCircle size={16} className="text-green-500" />
                            Kopiert!
                          </>
                        ) : (
                          <>
                            <Copy size={16} />
                            Kopieren
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Webhook Secret */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
                      Sicherheit {webhookConfig?.hasSecret && <span className="text-green-500">(Secret aktiv)</span>}
                    </label>
                    <div className="flex items-center gap-3">
                      {webhookConfig?.hasSecret ? (
                        <div className="flex-1 flex items-center gap-2 px-3 py-2 border border-green-300 dark:border-green-700 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm">
                          <CheckCircle size={16} />
                          <span>Secret ist in der URL enthalten - nur wer die URL kennt, kann Webhooks senden</span>
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center gap-2 px-3 py-2 border border-yellow-300 dark:border-yellow-700 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 text-sm">
                          <AlertTriangle size={16} />
                          <span>Kein Secret - jeder mit der URL kann Webhooks senden</span>
                        </div>
                      )}
                      <button
                        onClick={handleGenerateWebhookSecret}
                        disabled={generatingSecret}
                        className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-dark disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        <Key size={16} className={generatingSecret ? 'animate-spin' : ''} />
                        {generatingSecret ? 'Generiere...' : webhookConfig?.hasSecret ? 'Neues Secret' : 'Secret generieren'}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
                      Nach dem Generieren wird das Secret automatisch an die URL angehängt. Kopiere dann die neue URL nach NinjaRMM.
                    </p>
                  </div>
                </div>
              </div>

              {/* Webhook Settings */}
              <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Settings className="text-blue-600 dark:text-blue-400" size={20} />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">Webhook-Einstellungen</h3>
                    <p className="text-sm text-gray-500 dark:text-dark-400">Automatische Ticket-Erstellung konfigurieren</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Enable Webhook */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={webhookConfig?.webhookEnabled || false}
                      onChange={(e) => setWebhookConfig(prev => prev ? { ...prev, webhookEnabled: e.target.checked } : null)}
                      className="w-5 h-5 text-accent-primary rounded border-gray-300 focus:ring-accent-primary"
                    />
                    <div>
                      <span className="text-gray-700 dark:text-dark-300 font-medium">Webhook aktivieren</span>
                      <p className="text-sm text-gray-500 dark:text-dark-400">Eingehende Webhook-Events verarbeiten</p>
                    </div>
                  </label>

                  {/* Auto Create Tickets */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={webhookConfig?.autoCreateTickets || false}
                      onChange={(e) => setWebhookConfig(prev => prev ? { ...prev, autoCreateTickets: e.target.checked } : null)}
                      className="w-5 h-5 text-accent-primary rounded border-gray-300 focus:ring-accent-primary"
                    />
                    <div>
                      <span className="text-gray-700 dark:text-dark-300 font-medium">Automatische Ticket-Erstellung</span>
                      <p className="text-sm text-gray-500 dark:text-dark-400">Erstelle automatisch Tickets für eingehende Alerts</p>
                    </div>
                  </label>

                  {/* Min Severity */}
                  {webhookConfig?.autoCreateTickets && (
                    <div className="ml-8">
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
                        Mindest-Schweregrad für Ticket-Erstellung
                      </label>
                      <select
                        value={webhookConfig?.minSeverity || 'MAJOR'}
                        onChange={(e) => setWebhookConfig(prev => prev ? { ...prev, minSeverity: e.target.value } : null)}
                        className="px-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                      >
                        <option value="NONE">Alle Alerts</option>
                        <option value="MINOR">MINOR und höher</option>
                        <option value="MODERATE">MODERATE und höher</option>
                        <option value="MAJOR">MAJOR und höher</option>
                        <option value="CRITICAL">Nur CRITICAL</option>
                      </select>
                    </div>
                  )}

                  {/* Auto Resolve Tickets */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={webhookConfig?.autoResolveTickets || false}
                      onChange={(e) => setWebhookConfig(prev => prev ? { ...prev, autoResolveTickets: e.target.checked } : null)}
                      className="w-5 h-5 text-accent-primary rounded border-gray-300 focus:ring-accent-primary"
                    />
                    <div>
                      <span className="text-gray-700 dark:text-dark-300 font-medium">Automatisches Ticket-Schließen</span>
                      <p className="text-sm text-gray-500 dark:text-dark-400">Schließe Tickets automatisch wenn der Alert in NinjaRMM gelöst wird</p>
                    </div>
                  </label>

                  {/* Save Button */}
                  <div className="pt-4">
                    <button
                      onClick={handleSaveWebhookConfig}
                      disabled={savingWebhook}
                      className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-dark disabled:opacity-50"
                    >
                      <Save size={16} />
                      {savingWebhook ? 'Speichern...' : 'Einstellungen speichern'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Webhook Events Log */}
              <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-dark-200 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">Webhook-Events</h3>
                    <p className="text-sm text-gray-500 dark:text-dark-400">Letzte eingehende Events</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleBackfillDeviceNames}
                      disabled={backfillingDeviceNames}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-50"
                      title="Gerätenamen für bestehende Events aus synchronisierten Geräten nachtragen"
                    >
                      <Monitor size={14} />
                      {backfillingDeviceNames ? 'Aktualisiere...' : 'Gerätenamen nachtragen'}
                    </button>
                    <button
                      onClick={loadWebhookData}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-300 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300"
                    >
                      <RefreshCw size={14} />
                      Aktualisieren
                    </button>
                  </div>
                </div>
                {webhookEvents.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-dark-400">
                    <Zap size={32} className="mx-auto mb-2 opacity-50" />
                    <p>Noch keine Webhook-Events empfangen</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-dark-50 text-left text-sm text-gray-500 dark:text-dark-400">
                        <tr>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Event / Nachricht</th>
                          <th className="px-4 py-3 font-medium">Gerät</th>
                          <th className="px-4 py-3 font-medium">Schweregrad</th>
                          <th className="px-4 py-3 font-medium">Ticket</th>
                          <th className="px-4 py-3 font-medium">Zeit</th>
                          <th className="px-4 py-3 font-medium">Aktion</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-dark-200">
                        {webhookEvents.map(event => (
                          <tr key={event.id} className="hover:bg-gray-50 dark:hover:bg-dark-50">
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                event.status === 'processed' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                                event.status === 'failed' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                                event.status === 'ignored' ? 'bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-300' :
                                'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                              }`}>
                                {event.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-gray-900 dark:text-white font-medium">
                                {event.message || event.eventType}
                              </div>
                              {event.message && (
                                <div className="text-xs text-gray-500 dark:text-dark-400">
                                  {event.eventType}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-dark-300">
                              {event.deviceName || '-'}
                            </td>
                            <td className="px-4 py-3">
                              {event.severity && (
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  event.severity === 'CRITICAL' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                                  event.severity === 'MAJOR' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' :
                                  event.severity === 'MODERATE' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' :
                                  'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                }`}>
                                  {event.severity}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-700 dark:text-dark-300">
                              {event.ticketId ? (
                                <span className="flex items-center gap-1 text-accent-primary">
                                  <Ticket size={14} />
                                  Erstellt
                                </span>
                              ) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-dark-400 whitespace-nowrap">
                              {new Date(event.createdAt).toLocaleString('de-DE')}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => loadWebhookPayload(event.id)}
                                disabled={loadingPayload}
                                className="px-2 py-1 text-xs bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-300 rounded hover:bg-gray-200 dark:hover:bg-dark-300 disabled:opacity-50"
                                title="Raw Payload anzeigen"
                              >
                                {loadingPayload ? '...' : 'Payload'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Help */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
                <h3 className="font-medium text-blue-900 dark:text-blue-200 mb-2">NinjaRMM Webhook einrichten</h3>
                <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800 dark:text-blue-300">
                  <li><strong>Secret generieren</strong> (oben) - das Secret wird automatisch in die URL eingebettet</li>
                  <li><strong>URL kopieren</strong> - die vollständige URL inkl. Secret</li>
                  <li>In NinjaRMM: <strong>Administration → Benachrichtigungen → Kanäle</strong></li>
                  <li>Klicke auf <strong>"Hinzufügen"</strong> und wähle <strong>"Webhook"</strong></li>
                  <li>Gib einen Namen ein und füge die <strong>Webhook-URL</strong> ein</li>
                  <li>Speichere den Webhook</li>
                  <li>Weise den Webhook in deinen <strong>Policies</strong> den gewünschten Conditions zu</li>
                </ol>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-3">
                  <strong>Tipp:</strong> Aktiviere bei den Conditions auch "Notify on Reset", damit Tickets automatisch geschlossen werden, wenn der Alert sich auflöst.
                </p>
              </div>
            </>
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
                    {selectedDevice.displayName && selectedDevice.displayName !== selectedDevice.systemName && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500 dark:text-dark-400">Anzeigename</dt>
                        <dd className="text-gray-900 dark:text-white font-medium">{selectedDevice.displayName}</dd>
                      </div>
                    )}
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

                {/* Network Info */}
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
                        {selectedDevice.lastContact
                          ? new Date(selectedDevice.lastContact).toLocaleString('de-DE')
                          : '-'
                        }
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Letzter Benutzer</dt>
                      <dd className="text-gray-900 dark:text-white">{selectedDevice.lastLoggedInUser || '-'}</dd>
                    </div>
                  </dl>
                </div>

                {/* Organization Info */}
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
                        {selectedDevice.syncedAt
                          ? new Date(selectedDevice.syncedAt).toLocaleString('de-DE')
                          : '-'
                        }
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
                  onClick={() => handleRefreshDeviceDetails(selectedDevice.id)}
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

      {/* Alert Detail Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-100 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-200">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  selectedAlert.resolved
                    ? 'bg-green-100 dark:bg-green-900/30'
                    : selectedAlert.severity === 'CRITICAL'
                      ? 'bg-red-100 dark:bg-red-900/30'
                      : selectedAlert.severity === 'MAJOR'
                        ? 'bg-orange-100 dark:bg-orange-900/30'
                        : 'bg-yellow-100 dark:bg-yellow-900/30'
                }`}>
                  {selectedAlert.resolved ? (
                    <CheckCircle className="text-green-600 dark:text-green-400" size={20} />
                  ) : (
                    <AlertTriangle className={`${
                      selectedAlert.severity === 'CRITICAL' ? 'text-red-600 dark:text-red-400' :
                      selectedAlert.severity === 'MAJOR' ? 'text-orange-600 dark:text-orange-400' :
                      'text-yellow-600 dark:text-yellow-400'
                    }`} size={20} />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {selectedAlert.severity} Alert
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-dark-400">
                    {selectedAlert.resolved ? 'Gelöst' : 'Offen'}
                    {selectedAlert.ticketId && ' • Ticket erstellt'}
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
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-200px)]">
              {/* Alert Message */}
              <div className="bg-gray-50 dark:bg-dark-50 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">Nachricht</h4>
                <p className="text-gray-700 dark:text-dark-300 whitespace-pre-wrap">{selectedAlert.message}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Alert Info */}
                <div className="bg-gray-50 dark:bg-dark-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Bell size={16} className="text-gray-500" />
                    <h4 className="font-medium text-gray-900 dark:text-white">Alert-Details</h4>
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Schweregrad</dt>
                      <dd>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          selectedAlert.severity === 'CRITICAL' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                          selectedAlert.severity === 'MAJOR' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' :
                          selectedAlert.severity === 'MODERATE' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' :
                          selectedAlert.severity === 'MINOR' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                          'bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-300'
                        }`}>
                          {selectedAlert.severity}
                        </span>
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Priorität</dt>
                      <dd className="text-gray-900 dark:text-white">{selectedAlert.priority}</dd>
                    </div>
                    {selectedAlert.sourceType && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500 dark:text-dark-400">Quelle</dt>
                        <dd className="text-gray-900 dark:text-white">{selectedAlert.sourceType}</dd>
                      </div>
                    )}
                    {selectedAlert.sourceName && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500 dark:text-dark-400">Quellenname</dt>
                        <dd className="text-gray-900 dark:text-white">{selectedAlert.sourceName}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                {/* Device & Time Info */}
                <div className="bg-gray-50 dark:bg-dark-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Monitor size={16} className="text-gray-500" />
                    <h4 className="font-medium text-gray-900 dark:text-white">Gerät & Zeit</h4>
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Gerät</dt>
                      <dd className="text-gray-900 dark:text-white">{selectedAlert.deviceName || '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Organisation</dt>
                      <dd className="text-gray-900 dark:text-white">{selectedAlert.organizationName || '-'}</dd>
                    </div>
                    {selectedAlert.customerName && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500 dark:text-dark-400">Kunde</dt>
                        <dd className="text-gray-900 dark:text-white font-medium">{selectedAlert.customerName}</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-dark-400">Zeitpunkt</dt>
                      <dd className="text-gray-900 dark:text-white">
                        {selectedAlert.activityTime
                          ? new Date(selectedAlert.activityTime).toLocaleString('de-DE')
                          : '-'
                        }
                      </dd>
                    </div>
                    {selectedAlert.resolvedAt && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500 dark:text-dark-400">Gelöst am</dt>
                        <dd className="text-gray-900 dark:text-white">
                          {new Date(selectedAlert.resolvedAt).toLocaleString('de-DE')}
                        </dd>
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
                    onClick={() => handleCreateTicketFromAlert(selectedAlert.id)}
                    disabled={creatingTicket}
                    className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-dark disabled:opacity-50"
                  >
                    <Ticket size={16} />
                    {creatingTicket ? 'Erstelle...' : 'Ticket erstellen'}
                  </button>
                )}
                {!selectedAlert.resolved && (
                  <button
                    onClick={() => handleResolveAlert(selectedAlert.id)}
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

      {/* Payload Modal */}
      {selectedPayload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-100 rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-dark-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Webhook Payload
                </h3>
                <p className="text-sm text-gray-500 dark:text-dark-400">
                  Event: {selectedPayload.eventType} - {new Date(selectedPayload.createdAt).toLocaleString('de-DE')}
                </p>
              </div>
              <button
                onClick={() => setSelectedPayload(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg text-gray-500"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <pre className="bg-gray-50 dark:bg-dark-50 rounded-lg p-4 text-xs font-mono overflow-x-auto text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                {JSON.stringify(selectedPayload.payload, null, 2)}
              </pre>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-dark-200 flex justify-end">
              <button
                onClick={() => setSelectedPayload(null)}
                className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-300 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300"
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
