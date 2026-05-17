import { useState, useEffect, Fragment } from 'react';
import { Settings, Save, CheckCircle, XCircle, AlertTriangle, Cloud, Mail, Shield, Loader2, Eye, EyeOff, ExternalLink, Key, FileText, RefreshCw, Play, Download, Check, Trash2, ChevronDown, ChevronUp, File, Undo2 } from 'lucide-react';
import { Button, IconButton } from './ui';
import { microsoft365Api, Microsoft365Config, ProcessedInvoice, InvoiceDocument } from '../services/api';

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
  const [invoiceMailbox, setInvoiceMailbox] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  // Feature toggles
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [inboxMonitoringEnabled, setInboxMonitoringEnabled] = useState(false);

  // Test result
  const [testResult, setTestResult] = useState<{ success: boolean; displayName?: string; email?: string; error?: string } | null>(null);

  // Invoice processing state
  const [processingInvoices, setProcessingInvoices] = useState(false);
  const [processedInvoices, setProcessedInvoices] = useState<ProcessedInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoiceProcessResult, setInvoiceProcessResult] = useState<{ processedCount: number; skippedCount: number; failedCount: number } | null>(null);

  // Document viewing state
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [invoiceDocuments, setInvoiceDocuments] = useState<Record<string, InvoiceDocument[]>>({});
  const [loadingDocuments, setLoadingDocuments] = useState<string | null>(null);

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
        setInvoiceMailbox(response.data.invoiceMailbox || '');
        setEmailEnabled(response.data.featuresEnabled?.email || false);
        setInboxMonitoringEnabled(response.data.featuresEnabled?.inboxMonitoring || false);

        // Load processed invoices if configured
        if (response.data.invoiceMailbox) {
          loadProcessedInvoices();
        }
      }
    } catch (err) {
      console.error('Failed to load Microsoft 365 config:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadProcessedInvoices = async () => {
    setLoadingInvoices(true);
    try {
      const response = await microsoft365Api.getProcessedInvoices({ limit: 20 });
      if (response.success) {
        setProcessedInvoices(response.data);
      }
    } catch (err) {
      console.error('Failed to load processed invoices:', err);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleProcessInvoices = async (includeRead: boolean = false) => {
    setProcessingInvoices(true);
    setInvoiceProcessResult(null);
    setError('');
    setSuccess('');

    try {
      const response = await microsoft365Api.processInvoices({ includeRead });
      if (response.success && response.data) {
        setInvoiceProcessResult({
          processedCount: response.data.processedCount,
          skippedCount: response.data.skippedCount,
          failedCount: response.data.failedCount,
        });
        if (response.data.processedCount > 0) {
          setSuccess(`${response.data.processedCount} Entwürfe erstellt`);
        } else if (includeRead) {
          setSuccess('Keine neuen E-Mails zum Verarbeiten gefunden');
        } else {
          setSuccess('Keine ungelesenen E-Mails gefunden');
        }
        loadProcessedInvoices();
      } else {
        setError(response.error || 'Verarbeitung fehlgeschlagen');
      }
    } catch (err: any) {
      setError(err.message || 'Verarbeitung fehlgeschlagen');
    } finally {
      setProcessingInvoices(false);
      setTimeout(() => setSuccess(''), 5000);
    }
  };

  const handleApproveDraft = async (invoiceId: string) => {
    try {
      const response = await microsoft365Api.approveInvoiceDraft(invoiceId);
      if (response.success) {
        setSuccess('Entwurf bestätigt');
        loadProcessedInvoices();
      } else {
        setError(response.error || 'Bestätigung fehlgeschlagen');
      }
    } catch (err: any) {
      setError(err.message || 'Bestätigung fehlgeschlagen');
    }
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleRevertToDraft = async (invoiceId: string) => {
    try {
      const response = await microsoft365Api.revertInvoiceToDraft(invoiceId);
      if (response.success) {
        setSuccess('Zurück zu Entwurf');
        loadProcessedInvoices();
      } else {
        setError(response.error || 'Zurücksetzen fehlgeschlagen');
      }
    } catch (err: any) {
      setError(err.message || 'Zurücksetzen fehlgeschlagen');
    }
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDeleteDraft = async (invoiceId: string) => {
    if (!confirm('Entwurf wirklich löschen? Die Dateien werden ebenfalls entfernt.')) {
      return;
    }

    try {
      const response = await microsoft365Api.deleteInvoiceDraft(invoiceId);
      if (response.success) {
        setSuccess('Entwurf gelöscht');
        loadProcessedInvoices();
      } else {
        setError(response.error || 'Löschen fehlgeschlagen');
      }
    } catch (err: any) {
      setError(err.message || 'Löschen fehlgeschlagen');
    }
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleClearFailed = async () => {
    const failedCount = processedInvoices.filter(i => i.status === 'failed').length;
    if (!confirm(`${failedCount} fehlgeschlagene Einträge löschen und neu verarbeiten?`)) {
      return;
    }

    try {
      const response = await microsoft365Api.clearFailedInvoices();
      if (response.success) {
        setSuccess(`${response.deletedCount} fehlgeschlagene Einträge gelöscht`);
        loadProcessedInvoices();
      } else {
        setError(response.error || 'Löschen fehlgeschlagen');
      }
    } catch (err: any) {
      setError(err.message || 'Löschen fehlgeschlagen');
    }
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleClearAll = async () => {
    if (!confirm('ALLE Einträge wirklich löschen? Alle Dokumente und Zuordnungen werden entfernt.')) {
      return;
    }

    try {
      const response = await microsoft365Api.clearAllInvoices();
      if (response.success) {
        setSuccess(`${response.deletedCount} Einträge gelöscht`);
        setInvoiceDocuments({});
        setExpandedInvoiceId(null);
        loadProcessedInvoices();
      } else {
        setError(response.error || 'Löschen fehlgeschlagen');
      }
    } catch (err: any) {
      setError(err.message || 'Löschen fehlgeschlagen');
    }
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleToggleDocuments = async (invoiceId: string) => {
    if (expandedInvoiceId === invoiceId) {
      setExpandedInvoiceId(null);
      return;
    }

    setExpandedInvoiceId(invoiceId);

    // Load documents if not already loaded
    if (!invoiceDocuments[invoiceId]) {
      setLoadingDocuments(invoiceId);
      try {
        const response = await microsoft365Api.getInvoiceDocuments(invoiceId);
        if (response.success) {
          setInvoiceDocuments(prev => ({ ...prev, [invoiceId]: response.data }));
        }
      } catch (err) {
        console.error('Failed to load documents:', err);
      } finally {
        setLoadingDocuments(null);
      }
    }
  };

  const handleDownloadDocument = async (documentId: string, inline?: boolean) => {
    const token = localStorage.getItem('auth_token');

    if (!token) {
      setError('Nicht authentifiziert');
      return;
    }

    // Build URL with token as query parameter
    const baseUrl = import.meta.env.VITE_API_URL || '';
    const params = new URLSearchParams();
    params.set('token', token);
    if (inline) {
      params.set('inline', 'true');
    }

    const url = `${baseUrl}/microsoft365/documents/${documentId}/download?${params.toString()}`;

    // Open directly in browser - avoids HTTP/2 fetch issues
    window.open(url, inline ? '_blank' : '_self');
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
        invoiceMailbox,
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
        <div className="p-2 bg-accent-lighter dark:bg-blue-900/30 rounded-lg">
          <Cloud className="text-accent-primary dark:text-blue-400" size={24} />
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
            className="inline-flex items-center gap-1 text-sm text-accent-primary dark:text-blue-400 hover:underline"
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

          {/* Invoice Mailbox */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Rechnungs-Postfach (fuer automatische Belegverarbeitung)
            </label>
            <input
              type="email"
              value={invoiceMailbox}
              onChange={(e) => setInvoiceMailbox(e.target.value)}
              placeholder="invoice@ihredomain.de"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-dark-200 bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Eingehende E-Mails mit PDF-Anhaengen werden automatisch als Belege gespeichert
            </p>
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
        <Button
          variant="secondary"
          size="md"
          onClick={handleTestConnection}
          disabled={testing || !tenantId || !clientId}
          loading={testing}
          icon={!testing ? <Cloud size={18} /> : undefined}
        >
          Verbindung testen
        </Button>

        <Button
          variant="primary"
          size="md"
          onClick={handleSave}
          disabled={saving}
          loading={saving}
          icon={!saving ? <Save size={18} /> : undefined}
        >
          Speichern
        </Button>
      </div>

      {/* Invoice Processing Section */}
      {invoiceMailbox && config?.configured && (
        <div className="bg-white dark:bg-dark-100 rounded-xl p-6 border border-gray-200 dark:border-dark-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold dark:text-white flex items-center gap-2">
              <FileText size={20} />
              Rechnungsverarbeitung
            </h3>
            <div className="flex gap-2 flex-wrap">
              {processedInvoices.filter(i => i.status === 'failed').length > 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleClearFailed}
                  icon={<Trash2 size={14} />}
                >
                  Fehler löschen
                </Button>
              )}
              {processedInvoices.length > 0 && (
                <Button
                  variant="warning"
                  size="sm"
                  onClick={handleClearAll}
                  icon={<Trash2 size={14} />}
                >
                  Alle löschen
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={loadProcessedInvoices}
                disabled={loadingInvoices}
                icon={<RefreshCw size={14} className={loadingInvoices ? 'animate-spin' : ''} />}
              >
                Aktualisieren
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleProcessInvoices(false)}
                disabled={processingInvoices}
                loading={processingInvoices}
                icon={!processingInvoices ? <Play size={14} /> : undefined}
                title="Nur ungelesene E-Mails verarbeiten"
              >
                Neue Mails
              </Button>
              <Button
                variant="warning"
                size="sm"
                onClick={() => handleProcessInvoices(true)}
                disabled={processingInvoices}
                loading={processingInvoices}
                icon={!processingInvoices ? <RefreshCw size={14} /> : undefined}
                title="Alle E-Mails verarbeiten (inkl. bereits gelesene)"
              >
                Alle erneut
              </Button>
            </div>
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Postfach: <span className="font-medium text-gray-700 dark:text-gray-300">{invoiceMailbox}</span>
          </p>

          {/* Processing Result */}
          {invoiceProcessResult && (
            <div className="mb-4 p-3 bg-accent-light dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex gap-4 text-sm">
                <span className="text-green-600 dark:text-green-400">
                  ✓ {invoiceProcessResult.processedCount} verarbeitet
                </span>
                <span className="text-gray-600 dark:text-gray-400">
                  ○ {invoiceProcessResult.skippedCount} übersprungen
                </span>
                {invoiceProcessResult.failedCount > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    ✗ {invoiceProcessResult.failedCount} fehlgeschlagen
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Processed Invoices Table */}
          {loadingInvoices ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-accent-primary" size={24} />
            </div>
          ) : processedInvoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-dark-300">
                    <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Datum</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Absender</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Betreff</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Anhaenge</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Status</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {processedInvoices.map((invoice) => (
                    <Fragment key={invoice.id}>
                      <tr className="border-b border-gray-100 dark:border-dark-300 hover:bg-gray-50 dark:hover:bg-dark-200">
                        <td className="py-2 px-3 text-gray-900 dark:text-white whitespace-nowrap">
                          {new Date(invoice.receivedAt).toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-2 px-3 text-gray-900 dark:text-white">
                          <div className="truncate max-w-[200px]" title={invoice.senderEmail}>
                            {invoice.senderName || invoice.senderEmail}
                          </div>
                          {invoice.vendorName && (
                            <div className="text-xs text-accent-primary">→ {invoice.vendorName}</div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                          <div className="truncate max-w-[250px]" title={invoice.emailSubject}>
                            {invoice.emailSubject}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center">
                          {invoice.attachmentCount > 0 ? (
                            <button
                              onClick={() => handleToggleDocuments(invoice.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-accent-primary dark:text-blue-400 hover:bg-accent-light dark:hover:bg-blue-900/20 rounded transition-colors"
                              title="Dokumente anzeigen"
                            >
                              {loadingDocuments === invoice.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Download size={14} />
                              )}
                              {invoice.attachmentCount}
                              {expandedInvoiceId === invoice.id ? (
                                <ChevronUp size={14} />
                              ) : (
                                <ChevronDown size={14} />
                              )}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-gray-400">
                              <Download size={14} />
                              0
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            invoice.status === 'processed'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : invoice.status === 'draft'
                              ? 'bg-accent-lighter dark:bg-blue-900/30 text-accent-dark dark:text-blue-400'
                              : invoice.status === 'failed'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                              : invoice.status === 'skipped'
                              ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                          }`}>
                            {invoice.status === 'processed' && <CheckCircle size={12} />}
                            {invoice.status === 'draft' && <FileText size={12} />}
                            {invoice.status === 'failed' && <XCircle size={12} />}
                            {invoice.status === 'processed' ? 'Bestätigt' :
                             invoice.status === 'draft' ? 'Entwurf' :
                             invoice.status === 'failed' ? 'Fehlgeschlagen' :
                             invoice.status === 'skipped' ? 'Übersprungen' : 'Ausstehend'}
                          </span>
                          {invoice.errorMessage && (
                            <div className="text-xs text-red-500 mt-1 truncate max-w-[150px]" title={invoice.errorMessage}>
                              {invoice.errorMessage}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="flex gap-1 justify-end">
                            {invoice.status === 'draft' && (
                              <>
                                <IconButton
                                  variant="success"
                                  size="md"
                                  onClick={() => handleApproveDraft(invoice.id)}
                                  icon={<Check size={16} />}
                                  tooltip="Bestätigen"
                                />
                                <IconButton
                                  variant="danger"
                                  size="md"
                                  onClick={() => handleDeleteDraft(invoice.id)}
                                  icon={<Trash2 size={16} />}
                                  tooltip="Löschen"
                                />
                              </>
                            )}
                            {invoice.status === 'processed' && (
                              <IconButton
                                variant="warning"
                                size="md"
                                onClick={() => handleRevertToDraft(invoice.id)}
                                icon={<Undo2 size={16} />}
                                tooltip="Zurück zu Entwurf"
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Expandable documents row */}
                      {expandedInvoiceId === invoice.id && (
                        <tr className="bg-gray-50 dark:bg-dark-200">
                          <td colSpan={6} className="py-3 px-4">
                            <div className="pl-4 border-l-2 border-blue-300 dark:border-accent-primary">
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Anhänge
                              </div>
                              {loadingDocuments === invoice.id ? (
                                <div className="flex items-center gap-2 text-gray-500">
                                  <Loader2 size={16} className="animate-spin" />
                                  Lade Dokumente...
                                </div>
                              ) : invoiceDocuments[invoice.id]?.length > 0 ? (
                                <div className="space-y-2">
                                  {invoiceDocuments[invoice.id].map((doc) => (
                                    <div
                                      key={doc.id}
                                      className="flex items-center gap-3 p-2 bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-300"
                                    >
                                      <File size={20} className="text-red-500 flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium text-gray-900 dark:text-white truncate">
                                          {doc.originalFilename}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                          {formatFileSize(doc.size)} • {doc.mimeType}
                                        </div>
                                      </div>
                                      <div className="flex gap-1">
                                        <IconButton
                                          variant="primary"
                                          size="md"
                                          onClick={() => handleDownloadDocument(doc.id, true)}
                                          icon={<Eye size={16} />}
                                          tooltip="Ansehen"
                                        />
                                        <IconButton
                                          variant="success"
                                          size="md"
                                          onClick={() => handleDownloadDocument(doc.id)}
                                          icon={<Download size={16} />}
                                          tooltip="Herunterladen"
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  Keine Dokumente gefunden
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              <p>Noch keine Rechnungen verarbeitet</p>
              <p className="text-sm mt-1">Klicken Sie auf "Postfach verarbeiten" um E-Mails abzurufen</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
