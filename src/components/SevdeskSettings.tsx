import { useState, useEffect } from 'react';
import {
  Link2,
  Check,
  X,
  Loader2,
  Save,
  TestTube,
  AlertTriangle,
  Info,
  Download,
} from 'lucide-react';
import { Button } from './ui';
import { sevdeskApi, SevdeskConfig } from '../services/api';
import { SevdeskCustomerImport } from './SevdeskCustomerImport';

interface SevdeskSettingsProps {
  onCustomersChanged?: () => void;
}

export const SevdeskSettings = ({ onCustomersChanged }: SevdeskSettingsProps) => {
  const [config, setConfig] = useState<SevdeskConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Form state
  const [apiToken, setApiToken] = useState('');
  const [defaultHourlyRate, setDefaultHourlyRate] = useState(95);
  const [paymentTermsDays, setPaymentTermsDays] = useState(14);
  const [taxRate, setTaxRate] = useState(19);
  const [autoSyncCustomers, setAutoSyncCustomers] = useState(false);
  const [createAsFinal, setCreateAsFinal] = useState(false);

  // Connection status
  const [connectionStatus, setConnectionStatus] = useState<{
    tested: boolean;
    success: boolean;
    companyName?: string;
    error?: string;
  }>({ tested: false, success: false });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await sevdeskApi.getConfig();

      if (response.data) {
        setConfig(response.data);
        setDefaultHourlyRate(response.data.defaultHourlyRate);
        setPaymentTermsDays(response.data.paymentTermsDays);
        setTaxRate(response.data.taxRate);
        setAutoSyncCustomers(response.data.autoSyncCustomers);
        setCreateAsFinal(response.data.createAsFinal);

        if (response.data.hasToken) {
          setConnectionStatus({ tested: true, success: true, companyName: 'Verbunden' });
        }
      }
    } catch (err: any) {
      if (err.message?.includes('FEATURE_NOT_ENABLED')) {
        setError('Das Abrechnungsfeature ist für Ihr Konto nicht aktiviert.');
      } else {
        setError(err.message || 'Fehler beim Laden der Konfiguration');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!apiToken) {
      setError('Bitte geben Sie einen API-Token ein');
      return;
    }

    try {
      setTesting(true);
      setError(null);
      const response = await sevdeskApi.testConnection(apiToken);

      if (response.success) {
        setConnectionStatus({
          tested: true,
          success: true,
          companyName: response.companyName,
        });
        setSuccess(`Verbindung erfolgreich: ${response.companyName}`);
      } else {
        setConnectionStatus({
          tested: true,
          success: false,
          error: response.error,
        });
        setError(response.error || 'Verbindung fehlgeschlagen');
      }
    } catch (err: any) {
      setConnectionStatus({
        tested: true,
        success: false,
        error: err.message,
      });
      setError(err.message || 'Verbindung fehlgeschlagen');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      await sevdeskApi.saveConfig({
        apiToken: apiToken || undefined,
        defaultHourlyRate,
        paymentTermsDays,
        taxRate,
        autoSyncCustomers,
        createAsFinal,
      });

      setSuccess('Einstellungen gespeichert');
      setApiToken(''); // Clear token field after saving

      // Reload config to get updated status
      await loadConfig();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="animate-spin text-accent-primary" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-lg ${
            connectionStatus.success
              ? 'bg-green-100 dark:bg-green-900/30'
              : 'bg-gray-100 dark:bg-dark-200'
          }`}>
            <Link2 className={connectionStatus.success ? 'text-green-600' : 'text-gray-500'} size={20} />
          </div>
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">sevDesk Verbindung</h4>
            <p className="text-sm text-gray-500 dark:text-dark-400">
              {connectionStatus.success
                ? `Verbunden mit ${connectionStatus.companyName}`
                : 'Nicht verbunden'}
            </p>
          </div>
        </div>

        {/* API Token Input */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              API-Token
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder={config?.hasToken ? '••••••••••••••••' : 'API-Token eingeben'}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
              />
              <Button
                onClick={handleTestConnection}
                disabled={testing || !apiToken}
                variant="secondary"
                icon={<TestTube size={18} />}
                loading={testing}
              >
                Testen
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
              Den API-Token finden Sie in sevDesk unter Einstellungen → API
            </p>
          </div>

          {/* Connection Test Result */}
          {connectionStatus.tested && (
            <div className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
              connectionStatus.success
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
            }`}>
              {connectionStatus.success ? <Check size={16} /> : <X size={16} />}
              {connectionStatus.success
                ? `Verbunden: ${connectionStatus.companyName}`
                : connectionStatus.error || 'Verbindung fehlgeschlagen'}
            </div>
          )}
        </div>
      </div>

      {/* Default Settings */}
      <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg p-4">
        <h4 className="font-medium text-gray-900 dark:text-white mb-4">Standardeinstellungen</h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              Standard-Stundensatz (€)
            </label>
            <input
              type="number"
              value={defaultHourlyRate}
              onChange={(e) => setDefaultHourlyRate(parseFloat(e.target.value) || 0)}
              min="0"
              step="0.01"
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              Zahlungsziel (Tage)
            </label>
            <input
              type="number"
              value={paymentTermsDays}
              onChange={(e) => setPaymentTermsDays(parseInt(e.target.value) || 14)}
              min="0"
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              MwSt-Satz (%)
            </label>
            <select
              value={taxRate}
              onChange={(e) => setTaxRate(parseFloat(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
            >
              <option value={19}>19%</option>
              <option value={7}>7%</option>
              <option value={0}>0% (Steuerfrei)</option>
            </select>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSyncCustomers}
              onChange={(e) => setAutoSyncCustomers(e.target.checked)}
              className="w-5 h-5 text-accent-primary rounded focus:ring-2 focus:ring-accent-primary"
            />
            <div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Kunden automatisch synchronisieren
              </span>
              <p className="text-xs text-gray-500 dark:text-dark-400">
                Neue Kunden werden automatisch mit sevDesk abgeglichen
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={createAsFinal}
              onChange={(e) => setCreateAsFinal(e.target.checked)}
              className="w-5 h-5 text-accent-primary rounded focus:ring-2 focus:ring-accent-primary"
            />
            <div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Rechnungen direkt als "Final" erstellen
              </span>
              <p className="text-xs text-gray-500 dark:text-dark-400">
                Deaktiviert = Rechnungen werden als Entwurf erstellt
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Customer Import */}
      {connectionStatus.success && (
        <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">Kunden importieren</h4>
              <p className="text-sm text-gray-500 dark:text-dark-400">
                Importieren Sie Kontakte aus sevDesk als Kunden
              </p>
            </div>
            <Button
              onClick={() => setShowImportDialog(true)}
              variant="primary"
              icon={<Download size={18} />}
            >
              Kunden importieren
            </Button>
          </div>
        </div>
      )}

      {/* Import Dialog */}
      <SevdeskCustomerImport
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImportComplete={() => {
          onCustomersChanged?.();
        }}
      />

      {/* Info Box */}
      <div className="bg-accent-light dark:bg-accent-primary/20 border border-accent-primary/30 dark:border-accent-primary/40 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="text-accent-primary dark:text-accent-primary flex-shrink-0 mt-0.5" size={18} />
          <div className="text-sm text-accent-dark dark:text-accent-primary">
            <p className="font-medium mb-1">So funktioniert die sevDesk-Integration:</p>
            <ol className="list-decimal list-inside space-y-1 text-accent-dark dark:text-accent-primary">
              <li>Verbinden Sie Ihr sevDesk-Konto mit dem API-Token</li>
              <li>Verknüpfen Sie Ihre Kunden mit sevDesk-Kontakten</li>
              <li>Wählen Sie im Bereich "Abrechnung" die zu fakturierenden Zeiten</li>
              <li>Rechnungen werden automatisch in sevDesk erstellt</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
          <AlertTriangle size={18} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-300">
          <Check size={18} />
          <span className="text-sm">{success}</span>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          variant="primary"
          icon={<Save size={18} />}
          loading={saving}
        >
          Speichern
        </Button>
      </div>
    </div>
  );
};

export default SevdeskSettings;
