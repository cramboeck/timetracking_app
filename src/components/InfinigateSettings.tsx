import { useState, useEffect } from 'react';
import { Link2, Check, X, Loader2, Save, TestTube, RefreshCw, Info } from 'lucide-react';
import { Button } from './ui';
import { infinigateApi, InfinigateConfigStatus } from '../services/api';

/**
 * Einstellungen für die Infinigate Reseller-API (Distributor-Integration).
 * Credentials (Client-ID/Secret + API-Key) kommen aus dem Infinigate-Portal
 * („API-Anbindung"). Der Sync importiert Eingangsrechnungen inkl. Lizenzdaten
 * und Endkunden in die Belege-Positionen (Epic-G-Pipeline).
 */
export const InfinigateSettings = () => {
  const [status, setStatus] = useState<InfinigateConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state — leere Felder bedeuten „unverändert lassen"
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [environment, setEnvironment] = useState<'production' | 'test'>('production');
  const [autoSync, setAutoSync] = useState(false);

  const loadConfig = async () => {
    try {
      const res = await infinigateApi.getConfig();
      setStatus(res.data);
      setEnvironment(res.data.environment);
      setAutoSync(res.data.autoSync);
    } catch (err: any) {
      setError(err?.message || 'Konfiguration konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      await infinigateApi.saveConfig({
        clientId: clientId || undefined,
        clientSecret: clientSecret || undefined,
        apiKey: apiKey || undefined,
        environment,
        autoSync,
      });
      setSuccess('Einstellungen gespeichert');
      setClientId('');
      setClientSecret('');
      setApiKey('');
      await loadConfig();
    } catch (err: any) {
      setError(err?.message || 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      setError(null);
      setSuccess(null);
      const res = await infinigateApi.testConnection();
      if (res.success) {
        setSuccess(res.message);
      } else {
        setError(res.message || 'Verbindungstest fehlgeschlagen');
      }
    } catch (err: any) {
      setError(err?.message || 'Verbindungstest fehlgeschlagen');
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setError(null);
      setSuccess(null);
      const res = await infinigateApi.syncNow();
      const d = res.data;
      let msg = `${d.invoicesImported} neue Rechnung${d.invoicesImported === 1 ? '' : 'en'} importiert, ` +
        `${d.lineItemsCreated} Positionen, ${d.matchesApplied} Kunden automatisch zugeordnet.`;
      if (d.errors.length > 0) {
        msg += ` ${d.errors.length} Fehler (siehe Server-Log).`;
      }
      setSuccess(msg);
      await loadConfig();
    } catch (err: any) {
      setError(err?.message || 'Synchronisierung fehlgeschlagen');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="animate-spin text-accent-primary" size={24} />
      </div>
    );
  }

  const secretPlaceholder = (has: boolean) => (has ? '••••••••  (gespeichert — leer lassen zum Behalten)' : '');

  return (
    <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent-primary/10 rounded-lg">
            <Link2 className="text-accent-primary" size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Infinigate</h3>
            <p className="text-sm text-gray-500 dark:text-dark-400">
              Distributor-API: Rechnungen mit Lizenzdaten &amp; Endkunden automatisch importieren
            </p>
          </div>
        </div>
        {status?.configured ? (
          <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <Check size={16} /> Konfiguriert
          </span>
        ) : (
          <span className="flex items-center gap-1 text-sm text-gray-400">
            <X size={16} /> Nicht konfiguriert
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-sm">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Client-ID</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={secretPlaceholder(!!status?.hasClientId)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Client-Secret</label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={secretPlaceholder(!!status?.hasClientSecret)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">API-Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={secretPlaceholder(!!status?.hasApiKey)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Umgebung</label>
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as 'production' | 'test')}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
          >
            <option value="production">Produktion (api.infinigate.com)</option>
            <option value="test">Test (infapi-test.azure-api.net)</option>
          </select>
        </div>
      </div>

      <label className="mt-4 flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={autoSync}
          onChange={(e) => setAutoSync(e.target.checked)}
          className="w-5 h-5 text-accent-primary rounded focus:ring-2 focus:ring-accent-primary"
        />
        <div>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Rechnungen automatisch synchronisieren
          </span>
          <p className="text-xs text-gray-500 dark:text-dark-400">
            Täglich um 06:45 Uhr werden neue Infinigate-Rechnungen inkl. Lizenzen und Endkunden importiert
          </p>
        </div>
      </label>

      {status?.lastSyncAt && (
        <p className="mt-2 text-xs text-gray-500 dark:text-dark-400 flex items-center gap-1">
          <Info size={12} /> Letzter Sync: {new Date(status.lastSyncAt).toLocaleString('de-DE')}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={handleSave} disabled={saving} icon={saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}>
          Speichern
        </Button>
        <Button
          onClick={handleTest}
          variant="secondary"
          disabled={testing || !status?.configured}
          icon={testing ? <Loader2 size={16} className="animate-spin" /> : <TestTube size={16} />}
        >
          Verbindung testen
        </Button>
        <Button
          onClick={handleSync}
          variant="secondary"
          disabled={syncing || !status?.configured}
          icon={<RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />}
        >
          {syncing ? 'Synchronisiere…' : 'Jetzt synchronisieren'}
        </Button>
      </div>
    </div>
  );
};
