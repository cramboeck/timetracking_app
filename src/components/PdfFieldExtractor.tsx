import { useState, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Target, X, Check, Loader2, MousePointer2 } from 'lucide-react';
import { Button, IconButton } from './ui/Button';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure pdf.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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
}

const FIELD_CONFIG: Record<ExtractableField, FieldConfig> = {
  supplierName: { label: 'Lieferant', type: 'text' },
  invoiceNumber: { label: 'Rechnungsnr.', type: 'text' },
  customerNumber: { label: 'Kundennr.', type: 'text' },
  invoiceDate: { label: 'Rechnungsdatum', type: 'date' },
  dueDate: { label: 'Fälligkeitsdatum', type: 'date' },
  netAmount: { label: 'Nettobetrag', type: 'amount' },
  vatAmount: { label: 'MwSt.', type: 'amount' },
  grossAmount: { label: 'Bruttobetrag', type: 'amount' },
  iban: { label: 'IBAN', type: 'text' },
  bic: { label: 'BIC', type: 'text' },
  taxId: { label: 'USt-IdNr.', type: 'text' },
};

interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface PdfFieldExtractorProps {
  pdfUrl: string;
  onExtract: (field: ExtractableField, value: string | number | null) => void;
  onClose: () => void;
  currentValues?: Partial<Record<ExtractableField, string | number | null>>;
}

export const PdfFieldExtractor = ({ pdfUrl, onExtract, onClose, currentValues }: PdfFieldExtractorProps) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [selectedText, setSelectedText] = useState<string>('');
  const [targetField, setTargetField] = useState<ExtractableField>('supplierName');
  const [extracting, setExtracting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  };

  const onDocumentLoadError = (err: Error) => {
    setError(`PDF konnte nicht geladen werden: ${err.message}`);
    setLoading(false);
  };

  // Handle mouse down to start selection
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!pageRef.current) return;

    const rect = pageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsSelecting(true);
    setSelectionBox({ startX: x, startY: y, endX: x, endY: y });
    setSelectedText('');
  }, []);

  // Handle mouse move during selection
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isSelecting || !pageRef.current || !selectionBox) return;

    const rect = pageRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    setSelectionBox(prev => prev ? { ...prev, endX: x, endY: y } : null);
  }, [isSelecting, selectionBox]);

  // Handle mouse up to finish selection and extract text
  const handleMouseUp = useCallback(async () => {
    if (!isSelecting || !selectionBox || !pageRef.current) {
      setIsSelecting(false);
      return;
    }

    setIsSelecting(false);

    // Normalize selection box (handle dragging in any direction)
    const box = {
      left: Math.min(selectionBox.startX, selectionBox.endX),
      top: Math.min(selectionBox.startY, selectionBox.endY),
      right: Math.max(selectionBox.startX, selectionBox.endX),
      bottom: Math.max(selectionBox.startY, selectionBox.endY),
    };

    // Only process if selection is at least 10x10 pixels
    if (box.right - box.left < 10 || box.bottom - box.top < 10) {
      setSelectionBox(null);
      return;
    }

    setExtracting(true);

    try {
      // Find text layer and extract text from selected region
      const textLayer = pageRef.current.querySelector('.react-pdf__Page__textContent');
      if (!textLayer) {
        setSelectedText('(Kein Text in diesem Bereich gefunden)');
        setExtracting(false);
        return;
      }

      const textSpans = textLayer.querySelectorAll('span');
      const selectedTexts: string[] = [];

      textSpans.forEach((span) => {
        const spanRect = span.getBoundingClientRect();
        const pageRect = pageRef.current!.getBoundingClientRect();

        // Convert to page-relative coordinates
        const spanBox = {
          left: spanRect.left - pageRect.left,
          top: spanRect.top - pageRect.top,
          right: spanRect.right - pageRect.left,
          bottom: spanRect.bottom - pageRect.top,
        };

        // Check if span overlaps with selection
        const overlaps = !(
          spanBox.right < box.left ||
          spanBox.left > box.right ||
          spanBox.bottom < box.top ||
          spanBox.top > box.bottom
        );

        if (overlaps) {
          const text = span.textContent?.trim();
          if (text) {
            selectedTexts.push(text);
          }
        }
      });

      const extractedText = selectedTexts.join(' ').trim();
      setSelectedText(extractedText || '(Kein Text in diesem Bereich gefunden)');
    } catch (err) {
      console.error('Text extraction error:', err);
      setSelectedText('(Fehler bei Textextraktion)');
    }

    setExtracting(false);
  }, [isSelecting, selectionBox]);

  // Parse extracted value based on field type
  const parseValue = (text: string, field: ExtractableField): string | number | null => {
    const config = FIELD_CONFIG[field];

    if (config.type === 'amount') {
      // Parse German number format (1.234,56 or 1234,56)
      const cleaned = text.replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.');
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
        const match = text.match(pattern);
        if (match) {
          if (pattern === datePatterns[0]) {
            // DD.MM.YYYY
            const [, day, month, year] = match;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          } else if (pattern === datePatterns[1]) {
            // DD.MM.YY
            const [, day, month, year] = match;
            const fullYear = parseInt(year) > 50 ? `19${year}` : `20${year}`;
            return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          } else {
            // YYYY-MM-DD
            return match[0];
          }
        }
      }
      return text; // Return as-is if no pattern matches
    }

    return text.trim();
  };

  // Apply selected text to field
  const handleApply = () => {
    if (!selectedText || selectedText.startsWith('(')) return;

    const parsedValue = parseValue(selectedText, targetField);
    onExtract(targetField, parsedValue);
    setSelectionBox(null);
    setSelectedText('');
  };

  // Clear selection
  const handleClearSelection = () => {
    setSelectionBox(null);
    setSelectedText('');
  };

  // Zoom controls
  const zoomIn = () => setScale(s => Math.min(s + 0.25, 3));
  const zoomOut = () => setScale(s => Math.max(s - 0.25, 0.5));

  // Page navigation
  const prevPage = () => setPageNumber(p => Math.max(p - 1, 1));
  const nextPage = () => setPageNumber(p => Math.min(p + 1, numPages));

  // Calculate selection box style
  const getSelectionStyle = (): React.CSSProperties | undefined => {
    if (!selectionBox) return undefined;

    const left = Math.min(selectionBox.startX, selectionBox.endX);
    const top = Math.min(selectionBox.startY, selectionBox.endY);
    const width = Math.abs(selectionBox.endX - selectionBox.startX);
    const height = Math.abs(selectionBox.endY - selectionBox.startY);

    return {
      position: 'absolute',
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      border: '2px dashed #f97316',
      backgroundColor: 'rgba(249, 115, 22, 0.1)',
      pointerEvents: 'none',
      zIndex: 10,
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-black/70">
      {/* PDF Viewer Panel */}
      <div className="flex-1 flex flex-col bg-gray-900 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-2 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <IconButton
              icon={<ZoomOut size={18} />}
              onClick={zoomOut}
              disabled={scale <= 0.5}
              tooltip="Verkleinern"
              className="text-white hover:bg-gray-700"
            />
            <span className="text-sm text-gray-300 w-12 text-center">{Math.round(scale * 100)}%</span>
            <IconButton
              icon={<ZoomIn size={18} />}
              onClick={zoomIn}
              disabled={scale >= 3}
              tooltip="Vergrößern"
              className="text-white hover:bg-gray-700"
            />
          </div>

          {numPages > 1 && (
            <div className="flex items-center gap-2">
              <IconButton
                icon={<ChevronLeft size={18} />}
                onClick={prevPage}
                disabled={pageNumber <= 1}
                tooltip="Vorherige Seite"
                className="text-white hover:bg-gray-700"
              />
              <span className="text-sm text-gray-300">
                {pageNumber} / {numPages}
              </span>
              <IconButton
                icon={<ChevronRight size={18} />}
                onClick={nextPage}
                disabled={pageNumber >= numPages}
                tooltip="Nächste Seite"
                className="text-white hover:bg-gray-700"
              />
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-gray-400">
            <MousePointer2 size={16} />
            <span>Ziehen Sie ein Rechteck um den gewünschten Text</span>
          </div>
        </div>

        {/* PDF Content */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto p-4 flex justify-center"
        >
          {loading && (
            <div className="flex items-center justify-center h-full text-gray-400">
              <Loader2 size={32} className="animate-spin mr-2" />
              PDF wird geladen...
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full text-red-400">
              {error}
            </div>
          )}

          <div
            ref={pageRef}
            className="relative select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => isSelecting && handleMouseUp()}
            style={{ cursor: isSelecting ? 'crosshair' : 'crosshair' }}
          >
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={null}
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </Document>

            {/* Selection overlay */}
            {selectionBox && (
              <div style={getSelectionStyle()} />
            )}
          </div>
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

        {/* Field Selector */}
        <div className="p-4 border-b border-gray-200 dark:border-dark-border">
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
            Zielfeld auswählen
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

        {/* Extracted Text */}
        <div className="flex-1 p-4 overflow-auto">
          {extracting ? (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 size={20} className="animate-spin mr-2" />
              Extrahiere Text...
            </div>
          ) : selectedText ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                  Extrahierter Text
                </label>
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-900 dark:text-amber-200 font-mono text-sm break-all">
                  {selectedText}
                </div>
              </div>

              {!selectedText.startsWith('(') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                    Wird übernommen als
                  </label>
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-900 dark:text-green-200 font-mono text-sm">
                    {String(parseValue(selectedText, targetField) ?? '-')}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={handleApply}
                  disabled={!selectedText || selectedText.startsWith('(')}
                  icon={<Check size={16} />}
                  className="flex-1"
                >
                  Übernehmen
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleClearSelection}
                  icon={<X size={16} />}
                >
                  Verwerfen
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-dark-400 text-sm">
              <MousePointer2 size={32} className="mx-auto mb-3 opacity-50" />
              <p>Ziehen Sie ein Rechteck um den Text im PDF, den Sie extrahieren möchten.</p>
              <p className="mt-2 text-xs">Der Text wird automatisch erkannt und kann dann in das ausgewählte Feld übernommen werden.</p>
            </div>
          )}
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
