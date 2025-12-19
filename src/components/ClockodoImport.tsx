import { useState, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Loader2, X, ArrowRight } from 'lucide-react';
import { importApi } from '../services/api';
import { Modal } from './Modal';

interface PreviewData {
  rowCount: number;
  skippedCount: number;
  skippedRows: Array<{ line: number; reason: string; data: string }>;
  totalDuration: number;
  totalHours: string;
  customers: Array<{ name: string; nummer: string; matchedId?: string }>;
  projects: Array<{ name: string; customerName: string; matchedId?: string }>;
  sampleRows: Array<any>;
  existingCustomers: Array<{ id: string; name: string }>;
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

export const ClockodoImport = () => {
  const [step, setStep] = useState<'upload' | 'preview' | 'mapping' | 'importing' | 'done'>('upload');
  const [csvContent, setCsvContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Mapping states
  const [projectMapping, setProjectMapping] = useState<Record<string, string>>({});
  const [defaultProjectId, setDefaultProjectId] = useState<string>('');
  const [createMissingProjects, setCreateMissingProjects] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      setCsvContent(content);
      await previewImport(content);
    };
    reader.onerror = () => {
      setError('Fehler beim Lesen der Datei');
    };
    reader.readAsText(file, 'UTF-8');
  };

  const previewImport = async (content: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await importApi.previewClockodo(content);
      if (response.success && response.data) {
        setPreviewData(response.data);
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
      const response = await importApi.executeClockodo({
        csvContent,
        projectMapping,
        defaultProjectId: defaultProjectId || undefined,
        createMissingProjects,
        skipDuplicates,
      });

      if (response.success) {
        setImportResult(response.data);
        setStep('done');
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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}min`;
  };

  return (
    <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-6">
      <h3 className="text-lg font-semibold mb-4 dark:text-white">Clockodo Import</h3>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Exportieren Sie Ihre Zeiteinträge aus Clockodo als CSV und laden Sie die Datei hier hoch.
            Die CSV muss folgende Spalten enthalten: Kunde, Tag, Stunden, Beschreibung.
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

      {/* Step 2: Preview */}
      {step === 'preview' && previewData && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <FileText size={20} className="text-accent-primary" />
            <span className="font-medium dark:text-white">{fileName}</span>
            <button onClick={resetImport} className="ml-auto text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
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

          {/* Skipped Rows Warning */}
          {previewData.skippedRows && previewData.skippedRows.length > 0 && (
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-2">
                <AlertCircle size={18} />
                {previewData.skippedCount} Zeilen übersprungen
              </h4>
              <div className="space-y-1 max-h-32 overflow-y-auto text-sm">
                {previewData.skippedRows.map((row, idx) => (
                  <div key={idx} className="flex gap-2 text-amber-700 dark:text-amber-400">
                    <span className="font-mono text-xs bg-amber-100 dark:bg-amber-900/50 px-1 rounded">
                      Zeile {row.line}
                    </span>
                    <span>{row.reason}</span>
                    <span className="text-amber-600 dark:text-amber-500 truncate">({row.data})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Customer Matching Status */}
          <div className="mb-4">
            <h4 className="font-medium mb-2 dark:text-white">Kunden-Zuordnung</h4>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {previewData.customers.map((customer, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  {customer.matchedId ? (
                    <CheckCircle size={16} className="text-green-500" />
                  ) : (
                    <AlertCircle size={16} className="text-amber-500" />
                  )}
                  <span className="dark:text-gray-300">{customer.name}</span>
                  {customer.matchedId ? (
                    <span className="text-green-600 dark:text-green-400 text-xs">(gefunden)</span>
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
            <button
              onClick={resetImport}
              className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300 transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleStartMapping}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 btn-accent"
            >
              Weiter zur Zuordnung
              <ArrowRight size={18} />
            </button>
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
                Duplikate überspringen (gleicher Tag, Dauer, Beschreibung)
              </span>
            </label>

            {/* Default project fallback */}
            {!createMissingProjects && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Fallback-Projekt (für nicht zugeordnete Einträge)
                </label>
                <select
                  value={defaultProjectId}
                  onChange={(e) => setDefaultProjectId(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-dark-200 bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                >
                  <option value="">-- Projekt wählen --</option>
                  {previewData.existingProjects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.customerName} - {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

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
              <strong>Hinweis:</strong> Alle Einträge werden mit Startzeit 08:00 Uhr importiert.
              Die Endzeit wird aus der Dauer berechnet.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('preview')}
              className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300 transition-colors"
            >
              Zurück
            </button>
            <button
              onClick={handleImport}
              disabled={!createMissingProjects && !defaultProjectId}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 btn-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Import starten
              <ArrowRight size={18} />
            </button>
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
              <ul className="text-sm text-red-600 dark:text-red-300 list-disc list-inside">
                {importResult.errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={resetImport}
            className="w-full px-4 py-2 btn-accent"
          >
            Neuen Import starten
          </button>
        </div>
      )}
    </div>
  );
};
