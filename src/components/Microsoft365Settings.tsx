import { useState, useEffect } from 'react';
import { Settings, Save, CheckCircle, XCircle, AlertTriangle, Cloud, Mail, Shield, Loader2, Eye, EyeOff, ExternalLink, Key } from 'lucide-react';
import { microsoft365Api, Microsoft365Config } from '../services/api';

export const Microsoft365Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState<Microsoft365Config | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [mailFrom, setMailFrom] = useState('');
  const [supportMailbox, setSupportMailbox] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  // Feature toggles
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [inboxMonitoringEnabled, setInboxMonitoringEnabled] = useState(false);

  // Test result
  const [testResult, setTestResult] = useState<{ success: boolean; displayName?: string; email?: string; error?: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await microsoft365Api.getConfig();
      if (response.success && response.data) {
        setConfig(response.data);
        setTenantId(response.data.tenantId || '');
        setClientId(response.data.clientId || '');
        setMailFrom(response.data.mailFrom || '');
        setSupportMailbox(response.data.supportMailbox || '');
        setEmailEnabled(response.data.featuresEnabled?.email || false);
        setInboxMonitoringEnabled(response.data.featuresEnabled?.inboxMonitoring || false);
      }
    } catch (err) {
      console.error('Failed to load Microsoft 365 config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await microsoft365Api.saveConfig({
        tenantId,
        clientId,
        clientSecret: clientSecret || undefined, // Only send if changed
        mailFrom,
        supportMailbox,
        featuresEnabled: {
          email: emailEnabled,
          inboxMonitoring: inboxMonitoringEnabled,
        },
      });

      if (response.success) {
        setConfig(response.data);
        setClientSecret(''); // Clear after save
        setSuccess('Konfiguration gespeichert');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!tenantId || !clientId) {
      setError('Tenant ID und Client ID sind erforderlich');
      return;
    }

    // Need either existing secret or new one
    if (!clientSecret && !config?.hasClientSecret) {
      setError('Client Secret ist erforderlich');
      return;
    }

    setTesting(true);
    setError('');
    setTestResult(null);

    try {
      // If we have a new secret, use it; otherwise we need to tell the backend to use stored one
      const response = await microsoft365Api.testConnection({
        tenantId,
        clientId,
        clientSecret: clientSecret || '__USE_STORED__', // Backend should check for this
        mailFrom: mailFrom || undefined,
      });

      if (response.success) {
        setTestResult({
          success: true,
          displayName: response.data?.displayName,
          email: response.data?.email,
        });
      } else {
        setTestResult({
          success: false,
          error: response.error,
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || 'Verbindungstest fehlgeschlagen',
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-accent-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <Cloud className="text-blue-600 dark:text-blue-400" size={24} />
        </div>
        <div>
          <h2 className="text-xl font-semibold dark:text-white">Microsoft 365</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Azure AD Integration fuer E-Mail und weitere Dienste
          </p>
        </div>
      </div>

      {/* Status */}
      <div className={`p-4 rounded-lg ${
        config?.configured && config.lastConnectionStatus === 'success'
          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
          : config?.configured
          ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
          : 'bg-gray-50 dark:bg-dark-200 border border-gray-200 dark:border-dark-300'
      }`}>
        <div className="flex items-center gap-3">
          {config?.configured && config.lastConnectionStatus === 'success' ? (
            <CheckCircle className="text-green-600 dark:text-green-400" size={20} />
          ) : config?.configured ? (
            <AlertTriangle className="text-amber-600 dark:text-amber-400" size={20} />
          ) : (
            <XCircle className="text-gray-400" size={20} />
          )}
          <div>
            <div className="font-medium dark:text-white">
              {config?.configured && config.lastConnectionStatus === 'success'
                ? 'Verbunden'
                : config?.configured
                ? 'Konfiguriert (nicht getestet)'
                : 'Nicht konfiguriert'}
            </div>
            {config?.lastConnectionTest && (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Letzter Test: {new Date(config.lastConnectionTest).toLocaleString('de-DE')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400">
          <XCircle size={18} />
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2 text-green-700 dark:text-green-400">
          <CheckCircle size={18} />
          {success}
        </div>
      )}

      {/* Configuration Form */}
      <div className="bg-white dark:bg-dark-100 rounded-xl p-6 border border-gray-200 dark:border-dark-200">
        <h3 className="text-lg font-semibold mb-4 dark:text-white flex items-center gap-2">
          <Settings size={20} />
          Azure AD Konfiguration
        </h3>

        <div className="space-y-4">
          {/* Tenant ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tenant ID (Directory ID)
            </label>
            <input
              type="text"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-dark-200 bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
            />
          </div>

          {/* Client ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Application (Client) ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-dark-200 bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
            />
          </div>

          {/* Client Secret */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Client Secret {config?.hasClientSecret && <span className="text-green-600 dark:text-green-400">(gespeichert)</span>}
            </label>
            <div className="relative">
              <Key size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showSecret ? 'text' : 'password'}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={config?.hasClientSecret ? 'Leer lassen um bestehenden Secret zu behalten' : 'Client Secret eingeben'}
                className="w-full pl-10 pr-10 py-2 rounded-lg border border-gray-300 dark:border-dark-200 bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showSecret ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Help Link */}
          <a
            href="/docs/azure-setup"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            <ExternalLink size={14} />
            Azure App Registration Anleitung
          </a>
        </div>
      </div>

      {/* Email Configuration */}
      <div className="bg-white dark:bg-dark-100 rounded-xl p-6 border border-gray-200 dark:border-dark-200">
        <h3 className="text-lg font-semibold mb-4 dark:text-white flex items-center gap-2">
          <Mail size={20} />
          E-Mail Konfiguration
        </h3>

        <div className="space-y-4">
          {/* Mail From */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Absender E-Mail (Mail From)
            </label>
            <input
              type="email"
              value={mailFrom}
              onChange={(e) => setMailFrom(e.target.value)}
              placeholder="noreply@ihredomain.de"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-dark-200 bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Muss ein existierendes M365 Postfach sein (auch Shared Mailbox moeglich)
            </p>
          </div>

          {/* Support Mailbox */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Support Postfach (fuer Inbox-Ueberwachung)
            </label>
            <input
              type="email"
              value={supportMailbox}
              onChange={(e) => setSupportMailbox(e.target.value)}
              placeholder="support@ihredomain.de"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-dark-200 bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="bg-white dark:bg-dark-100 rounded-xl p-6 border border-gray-200 dark:border-dark-200">
        <h3 className="text-lg font-semibold mb-4 dark:text-white flex items-center gap-2">
          <Shield size={20} />
          Funktionen
        </h3>

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-accent-primary focus:ring-accent-primary"
            />
            <div>
              <span className="font-medium dark:text-white">E-Mail Versand</span>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                System-E-Mails ueber Microsoft Graph API senden
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={inboxMonitoringEnabled}
              onChange={(e) => setInboxMonitoringEnabled(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-accent-primary focus:ring-accent-primary"
            />
            <div>
              <span className="font-medium dark:text-white">Inbox-Ueberwachung</span>
              <span className="ml-2 text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded">
                Bald verfuegbar
              </span>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Eingehende E-Mails automatisch in Tickets umwandeln
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className={`p-4 rounded-lg ${
          testResult.success
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
        }`}>
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <>
                <CheckCircle className="text-green-600 dark:text-green-400" size={18} />
                <span className="font-medium text-green-700 dark:text-green-400">
                  Verbindung erfolgreich
                </span>
              </>
            ) : (
              <>
                <XCircle className="text-red-600 dark:text-red-400" size={18} />
                <span className="font-medium text-red-700 dark:text-red-400">
                  Verbindung fehlgeschlagen
                </span>
              </>
            )}
          </div>
          {testResult.success && testResult.displayName && (
            <p className="mt-1 text-sm text-green-600 dark:text-green-400">
              Verbunden als: {testResult.displayName} {testResult.email && `(${testResult.email})`}
            </p>
          )}
          {testResult.error && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {testResult.error}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleTestConnection}
          disabled={testing || !tenantId || !clientId}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300 disabled:opacity-50 transition-colors"
        >
          {testing ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Cloud size={18} />
          )}
          Verbindung testen
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 btn-accent"
        >
          {saving ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Save size={18} />
          )}
          Speichern
        </button>
      </div>
    </div>
  );
};
