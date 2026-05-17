import { useState, useRef, useEffect } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Loader2, X, ArrowRight, HelpCircle, ChevronDown, ChevronUp, Cloud, Key, Calendar } from 'lucide-react';
import { importApi } from '../services/api';
import { Button, IconButton } from './ui/Button';

interface ClockodoImportProps {
  onImportComplete?: () => void;
}

type ImportMode = 'csv' | 'api';

interface PreviewData {
  rowCount: number;
  skippedCount: number;
  skippedRows?: Array<{ line: number; reason: string; data: string }>;
  totalDuration: number;
  totalHours: string;
  dateRange?: { from: string; to: string };
  customers: Array<{
    name: string;
    nummer: string | null;
    clockodoId?: number;
    matchedId?: string;
    matchedName?: string;
    matchedBy?: string
  }>;
  projects: Array<{
    name: string;
    customerName: string;
    clockodoId?: number;
    matchedId?: string
  }>;
  sampleRows: Array<any>;
  existingCustomers: Array<{ id: string; name: string; customerNumber?: string; importAliases?: string[] }>;
  existingProjects: Array<{ id: string; name: string; customerName: string; customerId: string }>;
}

interface ImportResult {
  importedCount: number;
  skippedCount: number;
  duplicateCount: number;
  totalRows: number;
  createdCustomers: number;
  createdProjects: number;
  errors: string[];
}

export const ClockodoImport = ({ onImportComplete }: ClockodoImportProps) => {
  // Import mode
  const [importMode, setImportMode] = useState<ImportMode>('api');

  // Common state
  const [step, setStep] = useState<'upload' | 'preview' | 'mapping' | 'importing' | 'done'>('upload');
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // CSV-specific state
  const [csvContent, setCsvContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');

  // API-specific state
  const [apiEmail, setApiEmail] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [apiConfigured, setApiConfigured] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<{ userName?: string; companyName?: string } | null>(null);
  const [timeSince, setTimeSince] = useState<string>('');
  const [timeUntil, setTimeUntil] = useState<string>('');

  // Mapping states
  const [projectMapping, setProjectMapping] = useState<Record<string, string>>({});
  const [defaultProjectId, setDefaultProjectId] = useState<string>('');
  const [createMissingProjects, setCreateMissingProjects] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // Help panel state
  const [showHelp, setShowHelp] = useState(false);

  // Default projects state
  const [creatingDefaultProjects, setCreatingDefaultProjects] = useState(false);
  const [defaultProjectsResult, setDefaultProjectsResult] = useState<{ created: number; updated: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load API config on mount
  useEffect(() => {
    loadApiConfig();
    // Set default date range (last 3 years)
    const now = new Date();
    const threeYearsAgo = new Date(now.getFullYear() - 3, 0, 1);
    setTimeSince(threeYearsAgo.toISOString().split('T')[0]);
    setTimeUntil(now.toISOString().split('T')[0]);
  }, []);

  const loadApiConfig = async () => {
    try {
      const response = await importApi.getClockodoApiConfig();
      if (response.success && response.data.configured) {
        setApiConfigured(true);
        setApiEmail(response.data.apiEmail || '');
      }
    } catch (err) {
      // Config not found, that's okay
    }
  };

  // Create default projects for all customers
  const handleCreateDefaultProjects = async () => {
    setCreatingDefaultProjects(true);
    setError('');
    setDefaultProjectsResult(null);

    try {
      const response = await importApi.createDefaultProjects();
      if (response.success) {
        setDefaultProjectsResult({
          created: response.created,
          updated: response.updated
        });
      } else {
        setError('Fehler beim Erstellen der Standard-Projekte');
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Erstellen der Standard-Projekte');
    } finally {
      setCreatingDefaultProjects(false);
    }
  };

  // CSV Import handlers
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      setCsvContent(content);
      await previewCsvImport(content);
    };
    reader.onerror = () => {
      setError('Fehler beim Lesen der Datei');
    };
    reader.readAsText(file, 'UTF-8');
  };

  const previewCsvImport = async (content: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await importApi.previewClockodo(content);
      if (response.success && response.data) {
        setPreviewData(response.data as PreviewData);
        setStep('preview');
      } else {
        setError('Ungültiges CSV-Format');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Analysieren der CSV');
    } finally {
      setLoading(false);
    }
  };

  // API Import handlers
  const testApiConnection = async () => {
    if (!apiEmail || !apiKey) {
      setError('API E-Mail und Key sind erforderlich');
      return;
    }

    setLoading(true);
    setError('');
    setConnectionTested(false);
    setConnectionInfo(null);

    try {
      const response = await importApi.testClockodoApiConnection({ apiEmail, apiKey });
      if (response.success && response.data) {
        setConnectionTested(true);
        setConnectionInfo(response.data);
        // Save config
        await importApi.saveClockodoApiConfig({ apiEmail, apiKey });
        setApiConfigured(true);
      } else {
        setError(response.error || 'Verbindung fehlgeschlagen');
      }
    } catch (err: any) {
      setError(err.message || 'Verbindungstest fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const previewApiImport = async () => {
    if (!apiEmail || !apiKey) {
      setError('API-Zugangsdaten fehlen');
      return;
    }
    if (!timeSince || !timeUntil) {
      setError('Bitte Zeitraum auswählen');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await importApi.previewClockodoApi({
        apiEmail,
        apiKey,
        timeSince: `${timeSince} 00:00:00`,
        timeUntil: `${timeUntil} 23:59:59`,
      });
      if (response.success && response.data) {
        setPreviewData(response.data as PreviewData);
        setStep('preview');
      } else {
        setError('Fehler beim Abrufen der Daten');
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Abrufen der Daten');
    } finally {
      setLoading(false);
    }
  };

  const handleStartMapping = () => {
    // Initialize mapping with matched projects
    const initialMapping: Record<string, string> = {};
    previewData?.projects.forEach(p => {
      if (p.matchedId) {
        initialMapping[`${p.customerName}|${p.name}`] = p.matchedId;
      }
    });
    setProjectMapping(initialMapping);
    setStep('mapping');
  };

  const handleImport = async () => {
    setStep('importing');
    setError('');

    try {
      let response;

      if (importMode === 'csv') {
        response = await importApi.executeClockodo({
          csvContent,
          projectMapping,
          defaultProjectId: defaultProjectId || undefined,
          createMissingProjects,
          skipDuplicates,
        });
      } else {
        response = await importApi.executeClockodoApi({
          apiEmail,
          apiKey,
          timeSince: `${timeSince} 00:00:00`,
          timeUntil: `${timeUntil} 23:59:59`,
          projectMapping,
          defaultProjectId: defaultProjectId || undefined,
          createMissingProjects,
          skipDuplicates,
        });
      }

      if (response.success) {
        setImportResult(response.data);
        setStep('done');
        onImportComplete?.();
      } else {
        setError('Import fehlgeschlagen');
        setStep('mapping');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import fehlgeschlagen');
      setStep('mapping');
    }
  };

  const resetImport = () => {
    setStep('upload');
    setCsvContent('');
    setFileName('');
    setPreviewData(null);
    setImportResult(null);
    setError('');
    setProjectMapping({});
    setDefaultProjectId('');
    setConnectionTested(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold dark:text-white">Clockodo Import</h3>
        <Button
          onClick={() => setShowHelp(!showHelp)}
          variant="ghost"
          size="sm"
          icon={<HelpCircle size={18} />}
          iconPosition="left"
        >
          Hilfe
          {showHelp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </Button>
      </div>

      {/* Import Mode Tabs */}
      {step === 'upload' && (
        <div className="flex gap-2 mb-4">
          <Button
            onClick={() => setImportMode('api')}
            variant={importMode === 'api' ? 'primary' : 'secondary'}
            icon={<Cloud size={18} />}
          >
            API Import
          </Button>
          <Button
            onClick={() => setImportMode('csv')}
            variant={importMode === 'csv' ? 'primary' : 'secondary'}
            icon={<FileText size={18} />}
          >
            CSV Import
          </Button>
        </div>
      )}

      {/* Create Default Projects Section */}
      {step === 'upload' && (
        <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-1">
                Standard-Projekte erstellen
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Erstellt für jeden Kunden ein "Standard"-Projekt als Fallback für nicht zugeordnete Einträge.
              </p>
              {defaultProjectsResult && (
                <p className="text-sm text-green-600 dark:text-green-400 mt-2 flex items-center gap-1">
                  <CheckCircle size={14} />
                  {defaultProjectsResult.created} Projekte erstellt, {defaultProjectsResult.updated} Kunden aktualisiert
                </p>
              )}
            </div>
            <Button
              onClick={handleCreateDefaultProjects}
              disabled={creatingDefaultProjects}
              variant="warning"
              loading={creatingDefaultProjects}
              icon={!creatingDefaultProjects ? <ArrowRight size={16} /> : undefined}
            >
              {creatingDefaultProjects ? 'Erstelle...' : 'Jetzt erstellen'}
            </Button>
          </div>
        </div>
      )}

      {/* Sticky Help Panel */}
      {showHelp && (
        <div className="sticky top-0 z-10 mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-3 flex items-center gap-2">
            <HelpCircle size={18} />
            Import-Anleitung
          </h4>
          <div className="space-y-3 text-sm text-blue-700 dark:text-blue-400">
            {importMode === 'api' ? (
              <>
                <div>
                  <strong>API Import:</strong>
                  <p className="mt-1">Mit der Clockodo API können Sie Zeiteinträge direkt importieren - ohne CSV-Export. Geben Sie Ihre API-Zugangsdaten ein und wählen Sie den Zeitraum.</p>
                </div>
                <div>
                  <strong>API Key finden:</strong>
                  <p className="mt-1">Ihren API Key finden Sie unter <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">Clockodo → Einstellungen → API</code>.</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <strong>CSV-Format:</strong>
                  <p className="mt-1">Die Clockodo-CSV muss folgende Spalten enthalten: <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">Kunde</code>, <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">Kundennummer</code>, <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">Tag</code>, <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">Stunden (hh:mm)</code>, <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">Beschreibung</code>.</p>
                </div>
              </>
            )}
            <div>
              <strong>Kunden-Matching (Priorität):</strong>
              <ol className="mt-1 ml-4 list-decimal space-y-1">
                <li><strong>Kundennummer:</strong> Exakte Übereinstimmung der Kundennummer</li>
                <li><strong>Kundenname:</strong> Exakte Übereinstimmung des Namens (ohne Groß/Klein)</li>
                <li><strong>Import-Alias:</strong> Übereinstimmung mit einem konfigurierten Alias</li>
              </ol>
            </div>
            <div>
              <strong>Import-Aliase konfigurieren:</strong>
              <p className="mt-1">Sie können für jeden Kunden alternative Namen (Aliase) hinterlegen unter <em>Kunden → Bearbeiten → Import-Aliase</em>.</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Step 1: Upload / API Config */}
      {step === 'upload' && (
        <div>
          {importMode === 'api' ? (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400">
                Importieren Sie Zeiteinträge direkt über die Clockodo API.
                Schneller und einfacher als CSV-Export.
              </p>

              {/* API Credentials */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Clockodo E-Mail
                  </label>
                  <input
                    type="email"
                    name="clockodo_email"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                    value={apiEmail}
                    onChange={(e) => { setApiEmail(e.target.value); setConnectionTested(false); }}
                    placeholder="ihre-email@firma.de"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-200 bg-white dark:bg-dark-100 text-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    API Key
                  </label>
                  <div className="relative">
                    <Key size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="password"
                      name="clockodo_api_key"
                      autoComplete="new-password"
                      data-1p-ignore
                      data-lpignore="true"
                      data-form-type="other"
                      value={apiKey}
                      onChange={(e) => { setApiKey(e.target.value); setConnectionTested(false); }}
                      placeholder="Ihr Clockodo API Key"
                      className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-300 dark:border-dark-200 bg-white dark:bg-dark-100 text-gray-800 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Test Connection Button */}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={testApiConnection}
                  disabled={loading || !apiEmail || !apiKey}
                  variant="primary"
                  loading={loading}
                  icon={!loading ? <Cloud size={18} /> : undefined}
                >
                  Verbindung testen & speichern
                </Button>
                {connectionTested && connectionInfo && (
                  <span className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle size={18} />
                    Verbunden: {connectionInfo.companyName || connectionInfo.userName}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Die API-Zugangsdaten werden beim erfolgreichen Verbindungstest gespeichert.
              </p>

              {/* Date Range Selection */}
              {connectionTested && (
                <div className="mt-4 p-4 bg-gray-50 dark:bg-dark-200 rounded-lg">
                  <h4 className="font-medium text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                    <Calendar size={18} />
                    Zeitraum auswählen
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Von</label>
                      <input
                        type="date"
                        value={timeSince}
                        onChange={(e) => setTimeSince(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-100 text-gray-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Bis</label>
                      <input
                        type="date"
                        value={timeUntil}
                        onChange={(e) => setTimeUntil(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-100 text-gray-800 dark:text-white"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={previewApiImport}
                    disabled={loading || !timeSince || !timeUntil}
                    variant="primary"
                    fullWidth
                    loading={loading}
                    icon={!loading ? <ArrowRight size={18} /> : undefined}
                    className="mt-4 py-3"
                  >
                    {loading ? 'Lade Daten...' : 'Daten laden und Vorschau anzeigen'}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Exportieren Sie Ihre Zeiteinträge aus Clockodo als CSV und laden Sie die Datei hier hoch.
              </p>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-dark-200 rounded-lg p-8 text-center cursor-pointer hover:border-accent-primary transition-colors"
              >
                {loading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 size={32} className="animate-spin text-accent-primary" />
                    <span className="text-gray-600 dark:text-gray-400">Analysiere CSV...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload size={32} className="text-gray-400 dark:text-gray-500" />
                    <span className="text-gray-600 dark:text-gray-400">
                      Klicken zum Hochladen oder Datei hierher ziehen
                    </span>
                    <span className="text-sm text-gray-400 dark:text-gray-500">.csv Dateien</span>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          )}
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && previewData && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            {importMode === 'csv' ? (
              <>
                <FileText size={20} className="text-accent-primary" />
                <span className="font-medium dark:text-white">{fileName}</span>
              </>
            ) : (
              <>
                <Cloud size={20} className="text-accent-primary" />
                <span className="font-medium dark:text-white">
                  API Import: {previewData.dateRange?.from} - {previewData.dateRange?.to}
                </span>
              </>
            )}
            <IconButton
              onClick={resetImport}
              icon={<X size={18} />}
              variant="default"
              className="ml-auto"
              tooltip="Zurücksetzen"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
            <div className="bg-gray-50 dark:bg-dark-200 rounded-lg p-3">
              <div className="text-2xl font-bold text-accent-primary">{previewData.rowCount}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Gültige Einträge</div>
            </div>
            {previewData.skippedCount > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{previewData.skippedCount}</div>
                <div className="text-sm text-amber-700 dark:text-amber-300">Übersprungen</div>
              </div>
            )}
            <div className="bg-gray-50 dark:bg-dark-200 rounded-lg p-3">
              <div className="text-2xl font-bold text-accent-primary">{previewData.totalHours}h</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Stunden gesamt</div>
            </div>
            <div className="bg-gray-50 dark:bg-dark-200 rounded-lg p-3">
              <div className="text-2xl font-bold text-accent-primary">{previewData.customers.length}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Kunden</div>
            </div>
            <div className="bg-gray-50 dark:bg-dark-200 rounded-lg p-3">
              <div className="text-2xl font-bold text-accent-primary">{previewData.projects.length}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Projekte</div>
            </div>
          </div>

          {/* Customer Matching Status */}
          <div className="mb-4">
            <h4 className="font-medium mb-2 dark:text-white">Kunden-Zuordnung</h4>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {previewData.customers.map((customer, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  {customer.matchedId ? (
                    <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                  ) : (
                    <AlertCircle size={16} className="text-amber-500 flex-shrink-0" />
                  )}
                  <span className="dark:text-gray-300">{customer.name}</span>
                  {customer.nummer && (
                    <span className="text-gray-400 dark:text-gray-500 text-xs">(Nr. {customer.nummer})</span>
                  )}
                  {customer.matchedId ? (
                    <span className="text-green-600 dark:text-green-400 text-xs flex items-center gap-1">
                      <ArrowRight size={12} />
                      {customer.matchedName || 'gefunden'}
                      {customer.matchedBy && (
                        <span className="bg-green-100 dark:bg-green-900/50 px-1 rounded text-xs">
                          via {customer.matchedBy}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 text-xs">(wird erstellt)</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Sample Rows */}
          <div className="mb-6">
            <h4 className="font-medium mb-2 dark:text-white">
              Vorschau ({Math.min(previewData.sampleRows.length, 20)} von {previewData.rowCount} Zeilen)
            </h4>
            <div className="overflow-x-auto max-h-80 overflow-y-auto border dark:border-dark-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-dark-200">
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-dark-200">
                    <th className="py-2 px-2">#</th>
                    <th className="py-2 px-2">Datum</th>
                    <th className="py-2 px-2">Kunde</th>
                    <th className="py-2 px-2">Projekt</th>
                    <th className="py-2 px-2">Beschreibung</th>
                    <th className="py-2 px-2">Stunden</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.sampleRows.map((row, idx) => (
                    <tr key={idx} className="border-b dark:border-dark-200 hover:bg-gray-50 dark:hover:bg-dark-200">
                      <td className="py-2 px-2 text-gray-400 dark:text-gray-500 text-xs">{idx + 1}</td>
                      <td className="py-2 px-2 dark:text-gray-300">{row.tag}</td>
                      <td className="py-2 px-2 dark:text-gray-300">{row.kunde}</td>
                      <td className="py-2 px-2 dark:text-gray-300 text-gray-500">{row.projekt || '-'}</td>
                      <td className="py-2 px-2 dark:text-gray-300 truncate max-w-[200px]">{row.beschreibung}</td>
                      <td className="py-2 px-2 dark:text-gray-300">{row.stunden}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={resetImport}
              variant="secondary"
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleStartMapping}
              variant="primary"
              icon={<ArrowRight size={18} />}
              iconPosition="right"
              className="flex-1"
            >
              Weiter zur Zuordnung
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Mapping */}
      {step === 'mapping' && previewData && (
        <div>
          <h4 className="font-medium mb-4 dark:text-white">Projekt-Zuordnung</h4>

          <div className="space-y-4 mb-6">
            {/* Create missing projects option */}
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={createMissingProjects}
                onChange={(e) => setCreateMissingProjects(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-accent-primary focus:ring-accent-primary"
              />
              <span className="dark:text-gray-300">
                Fehlende Kunden und Projekte automatisch erstellen
              </span>
            </label>

            {/* Skip duplicates option */}
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-accent-primary focus:ring-accent-primary"
              />
              <span className="dark:text-gray-300">
                Duplikate überspringen (bereits importierte Einträge werden erkannt)
              </span>
            </label>

            {/* Manual project mapping for unmatched */}
            {previewData.projects.filter(p => !p.matchedId).length > 0 && !createMissingProjects && (
              <div>
                <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nicht zugeordnete Projekte manuell zuordnen:
                </h5>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {previewData.projects.filter(p => !p.matchedId).map((project, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-sm dark:text-gray-300 min-w-[200px]">
                        {project.customerName} - {project.name}
                      </span>
                      <ArrowRight size={16} className="text-gray-400" />
                      <select
                        value={projectMapping[`${project.customerName}|${project.name}`] || ''}
                        onChange={(e) => setProjectMapping({
                          ...projectMapping,
                          [`${project.customerName}|${project.name}`]: e.target.value
                        })}
                        className="flex-1 px-3 py-1 text-sm rounded-lg border border-gray-300 dark:border-dark-200 bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                      >
                        <option value="">-- Zuordnen --</option>
                        {previewData.existingProjects.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.customerName} - {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-6">
            <p className="text-sm text-blue-700 dark:text-blue-400">
              <strong>Hinweis:</strong> {importMode === 'csv'
                ? 'Alle Einträge werden mit Startzeit 08:00 Uhr importiert. Die Endzeit wird aus der Dauer berechnet.'
                : 'Die original Zeitstempel aus Clockodo werden übernommen.'}
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => setStep('preview')}
              variant="secondary"
            >
              Zurück
            </Button>
            <Button
              onClick={handleImport}
              disabled={!createMissingProjects && previewData.projects.filter(p => !p.matchedId).some(p => !projectMapping[`${p.customerName}|${p.name}`])}
              variant="primary"
              icon={<ArrowRight size={18} />}
              iconPosition="right"
              className="flex-1"
            >
              Import starten
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Importing */}
      {step === 'importing' && (
        <div className="text-center py-8">
          <Loader2 size={48} className="animate-spin text-accent-primary mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Importiere Zeiteinträge...</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
            Dies kann bei vielen Einträgen etwas dauern.
          </p>
        </div>
      )}

      {/* Step 5: Done */}
      {step === 'done' && importResult && (
        <div>
          <div className="text-center mb-6">
            <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
            <h4 className="text-xl font-semibold dark:text-white">Import abgeschlossen!</h4>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {importResult.importedCount}
              </div>
              <div className="text-sm text-green-700 dark:text-green-300">Importiert</div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {importResult.duplicateCount}
              </div>
              <div className="text-sm text-amber-700 dark:text-amber-300">Duplikate</div>
            </div>
            <div className="bg-gray-50 dark:bg-dark-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                {importResult.skippedCount}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Übersprungen</div>
            </div>
          </div>

          {(importResult.createdCustomers > 0 || importResult.createdProjects > 0) && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mb-6">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                {importResult.createdCustomers > 0 && `${importResult.createdCustomers} Kunde(n) erstellt. `}
                {importResult.createdProjects > 0 && `${importResult.createdProjects} Projekt(e) erstellt.`}
              </p>
            </div>
          )}

          {importResult.errors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 mb-6">
              <h5 className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">Fehler:</h5>
              <ul className="text-sm text-red-600 dark:text-red-300 list-disc list-inside max-h-32 overflow-y-auto">
                {importResult.errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <Button
            onClick={resetImport}
            variant="primary"
            fullWidth
          >
            Neuen Import starten
          </Button>
        </div>
      )}
    </div>
  );
};
