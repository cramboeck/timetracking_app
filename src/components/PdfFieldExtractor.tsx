import { useState } from 'react';
import { Target, X, Check, ExternalLink, Copy, ClipboardPaste } from 'lucide-react';
import { Button, IconButton } from './ui/Button';

export type ExtractableField =
  | 'supplierName'
  | 'invoiceNumber'
  | 'customerNumber'
  | 'invoiceDate'
  | 'dueDate'
  | 'netAmount'
  | 'vatAmount'
  | 'grossAmount'
  | 'iban'
  | 'bic'
  | 'taxId';

interface FieldConfig {
  label: string;
  type: 'text' | 'date' | 'amount';
  placeholder: string;
}

const FIELD_CONFIG: Record<ExtractableField, FieldConfig> = {
  supplierName: { label: 'Lieferant', type: 'text', placeholder: 'z.B. Microsoft GmbH' },
  invoiceNumber: { label: 'Rechnungsnr.', type: 'text', placeholder: 'z.B. RE-2024-001' },
  customerNumber: { label: 'Kundennr.', type: 'text', placeholder: 'z.B. K12345' },
  invoiceDate: { label: 'Rechnungsdatum', type: 'date', placeholder: 'TT.MM.JJJJ' },
  dueDate: { label: 'Fälligkeitsdatum', type: 'date', placeholder: 'TT.MM.JJJJ' },
  netAmount: { label: 'Nettobetrag', type: 'amount', placeholder: 'z.B. 100,00' },
  vatAmount: { label: 'MwSt.', type: 'amount', placeholder: 'z.B. 19,00' },
  grossAmount: { label: 'Bruttobetrag', type: 'amount', placeholder: 'z.B. 119,00' },
  iban: { label: 'IBAN', type: 'text', placeholder: 'z.B. DE89...' },
  bic: { label: 'BIC', type: 'text', placeholder: 'z.B. COBADEFFXXX' },
  taxId: { label: 'USt-IdNr.', type: 'text', placeholder: 'z.B. DE123456789' },
};

interface PdfFieldExtractorProps {
  pdfUrl: string;
  onExtract: (field: ExtractableField, value: string | number | null) => void;
  onClose: () => void;
  currentValues?: Partial<Record<ExtractableField, string | number | null>>;
}

export const PdfFieldExtractor = ({ pdfUrl, onExtract, onClose, currentValues }: PdfFieldExtractorProps) => {
  const [targetField, setTargetField] = useState<ExtractableField>('supplierName');
  const [inputValue, setInputValue] = useState('');

  // Parse value based on field type
  const parseValue = (text: string, field: ExtractableField): string | number | null => {
    const config = FIELD_CONFIG[field];
    const trimmed = text.trim();
    if (!trimmed) return null;

    if (config.type === 'amount') {
      // Parse German number format (1.234,56 or 1234,56)
      const cleaned = trimmed.replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.');
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    }

    if (config.type === 'date') {
      // Try to parse various date formats
      const datePatterns = [
        /(\d{1,2})\.(\d{1,2})\.(\d{4})/, // DD.MM.YYYY
        /(\d{1,2})\.(\d{1,2})\.(\d{2})/, // DD.MM.YY
        /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
      ];

      for (const pattern of datePatterns) {
        const match = trimmed.match(pattern);
        if (match) {
          if (pattern === datePatterns[0]) {
            const [, day, month, year] = match;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          } else if (pattern === datePatterns[1]) {
            const [, day, month, year] = match;
            const fullYear = parseInt(year) > 50 ? `19${year}` : `20${year}`;
            return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          } else {
            return match[0];
          }
        }
      }
      return trimmed;
    }

    return trimmed;
  };

  // Apply value to field
  const handleApply = () => {
    if (!inputValue.trim()) return;
    const parsedValue = parseValue(inputValue, targetField);
    onExtract(targetField, parsedValue);
    setInputValue('');
  };

  // Paste from clipboard
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputValue(text);
    } catch {
      // Clipboard access denied - user can paste manually
    }
  };

  // Open PDF in new tab for easier text selection
  const handleOpenInNewTab = () => {
    window.open(pdfUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-black/70">
      {/* PDF Viewer Panel - Native browser viewer */}
      <div className="flex-1 flex flex-col bg-gray-900 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-2 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <span>PDF-Vorschau</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenInNewTab}
            icon={<ExternalLink size={16} />}
            className="text-white hover:bg-gray-700"
          >
            In neuem Tab öffnen
          </Button>
        </div>

        {/* PDF Content - Native browser viewer */}
        <div className="flex-1 overflow-hidden">
          <iframe
            src={pdfUrl}
            className="w-full h-full border-0"
            title="PDF Vorschau"
          />
        </div>
      </div>

      {/* Extraction Panel */}
      <div className="w-80 bg-white dark:bg-dark-100 flex flex-col border-l border-gray-200 dark:border-dark-border">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2">
            <Target size={20} className="text-accent-primary" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Feldextraktion</h3>
          </div>
          <IconButton
            icon={<X size={20} />}
            onClick={onClose}
            tooltip="Schließen"
          />
        </div>

        {/* Instructions */}
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-900/30">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>So geht's:</strong>
          </p>
          <ol className="text-sm text-blue-700 dark:text-blue-300 mt-1 list-decimal list-inside space-y-1">
            <li>Markiere Text im PDF (links)</li>
            <li>Kopiere mit Strg+C</li>
            <li>Klicke "Einfügen" unten</li>
            <li>Wähle Zielfeld & "Übernehmen"</li>
          </ol>
        </div>

        {/* Field Selector */}
        <div className="p-4 border-b border-gray-200 dark:border-dark-border">
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
            Zielfeld
          </label>
          <select
            value={targetField}
            onChange={(e) => setTargetField(e.target.value as ExtractableField)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white text-sm"
          >
            {Object.entries(FIELD_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
              </option>
            ))}
          </select>

          {/* Show current value */}
          {currentValues?.[targetField] !== undefined && currentValues?.[targetField] !== null && (
            <div className="mt-2 text-xs text-gray-500 dark:text-dark-400">
              Aktuell: <span className="font-mono">{String(currentValues[targetField])}</span>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="flex-1 p-4 overflow-auto">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                Wert eingeben oder einfügen
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                  placeholder={FIELD_CONFIG[targetField].placeholder}
                  className="w-full px-3 py-2 pr-10 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white text-sm"
                />
                <button
                  onClick={handlePaste}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white"
                  title="Aus Zwischenablage einfügen"
                >
                  <ClipboardPaste size={18} />
                </button>
              </div>
            </div>

            {inputValue && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                  Wird übernommen als
                </label>
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-900 dark:text-green-200 font-mono text-sm">
                  {String(parseValue(inputValue, targetField) ?? '-')}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={handleApply}
                disabled={!inputValue.trim()}
                icon={<Check size={16} />}
                className="flex-1"
              >
                Übernehmen
              </Button>
              <Button
                variant="ghost"
                onClick={handlePaste}
                icon={<Copy size={16} />}
              >
                Einfügen
              </Button>
            </div>
          </div>
        </div>

        {/* Quick Field Buttons */}
        <div className="p-4 border-t border-gray-200 dark:border-dark-border">
          <div className="text-xs font-medium text-gray-500 dark:text-dark-400 mb-2">Schnellauswahl</div>
          <div className="flex flex-wrap gap-1">
            {(['grossAmount', 'netAmount', 'vatAmount', 'invoiceNumber', 'invoiceDate'] as ExtractableField[]).map(field => (
              <button
                key={field}
                onClick={() => setTargetField(field)}
                className={`px-2 py-1 text-xs rounded ${
                  targetField === field
                    ? 'bg-accent-primary text-white'
                    : 'bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-400 hover:bg-gray-200 dark:hover:bg-dark-300'
                }`}
              >
                {FIELD_CONFIG[field].label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
