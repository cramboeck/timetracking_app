import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { Modal } from '../Modal';
import { Button } from '../ui/Button';
import { useToast } from '../../contexts/UIContext';
import { assetToolsApi, type LabelCompany, type LabelData } from '../../services/api';
import { LABEL_FORMATS, buildLabelPdf, type LabelFormatId, type LabelOptions } from './labelPdf';
import { fieldClasses } from './assetUi';

/**
 * Etiketten drucken (AS-5): Format wählen, Vorschau, Drucken/Herunterladen.
 * Einzeln aus dem Geräte-Detail oder gesammelt aus der Liste.
 */
interface LabelPrintDialogProps {
  assetIds: string[];
  isOpen: boolean;
  onClose: () => void;
}

const PREFS_KEY = 'rbf_label_prefs';
type Prefs = { format: LabelFormatId } & Omit<LabelOptions, 'startPosition'>;
const DEFAULT_PREFS: Prefs = { format: 'brother-62x29', showCustomer: true, showBarcode: false, showSupport: true };

const loadPrefs = (): Prefs => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      ...DEFAULT_PREFS, ...p,
      format: LABEL_FORMATS.some(f => f.id === p.format) ? p.format as LabelFormatId : DEFAULT_PREFS.format,
    };
  } catch {
    return DEFAULT_PREFS;
  }
};

const Check = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-dark-500 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
      className="rounded border-gray-300 dark:border-dark-border text-accent-primary focus:ring-accent-primary" />
    {label}
  </label>
);

export const LabelPrintDialog = ({ assetIds, isOpen, onClose }: LabelPrintDialogProps) => {
  const showToast = useToast();
  const queryClient = useQueryClient();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [startPosition, setStartPosition] = useState(1);
  const [data, setData] = useState<{ labels: LabelData[]; company: LabelCompany } | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const format = LABEL_FORMATS.find(f => f.id === prefs.format) ?? LABEL_FORMATS[0];
  const perSheet = format.sheet ? format.sheet.cols * format.sheet.rows : 0;

  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  }, [prefs]);

  // Etiketten-Daten holen (vergibt fehlende Asset-IDs/Tokens serverseitig)
  const idsKey = assetIds.join(',');
  useEffect(() => {
    if (!isOpen || !idsKey) return;
    let cancelled = false;
    setData(null);
    setError(null);
    assetToolsApi.labels(idsKey.split(','))
      .then(r => {
        if (cancelled) return;
        setData(r.data);
        // Asset-IDs könnten gerade neu vergeben worden sein
        queryClient.invalidateQueries({ queryKey: ['assets'] });
      })
      .catch(() => { if (!cancelled) setError('Etiketten konnten nicht vorbereitet werden.'); });
    return () => { cancelled = true; };
  }, [isOpen, idsKey, queryClient]);

  // PDF bei jeder Änderung neu erzeugen
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    buildLabelPdf(data.labels, data.company, prefs.format, { ...prefs, startPosition })
      .then(doc => {
        if (cancelled) return;
        const url = URL.createObjectURL(doc.output('blob'));
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setPdfUrl(url);
      })
      .catch(() => { if (!cancelled) setError('PDF konnte nicht erzeugt werden.'); });
    return () => { cancelled = true; };
  }, [data, prefs, startPosition]);

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const fileName = data?.labels.length === 1 ? `Etikett-${data.labels[0].assetTag}.pdf` : `Etiketten-${data?.labels.length ?? 0}.pdf`;
  const print = () => {
    if (!pdfUrl) return;
    const w = window.open(pdfUrl, '_blank');
    if (!w) showToast('Pop-up blockiert – bitte „Herunterladen“ verwenden', 'warning');
  };

  const footer = (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="secondary" onClick={onClose}>Schließen</Button>
      {pdfUrl && (
        <a href={pdfUrl} download={fileName}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-500 hover:bg-gray-50 dark:hover:bg-dark-200">
          <Download size={16} /> Herunterladen
        </a>
      )}
      <Button variant="primary" onClick={print} disabled={!pdfUrl} icon={<Printer size={16} />}>Drucken</Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="3xl" footer={footer}
      title={assetIds.length === 1 ? 'Etikett drucken' : `${assetIds.length} Etiketten drucken`}>
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-5 text-left">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1.5">Format</label>
            <select className={fieldClasses} value={prefs.format}
              onChange={e => { setPrefs(p => ({ ...p, format: e.target.value as LabelFormatId })); setStartPosition(1); }}>
              {LABEL_FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">{format.hint}</p>
          </div>
          {format.sheet && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1.5">Erstes freies Etikett auf dem Bogen</label>
              <input type="number" min={1} max={perSheet} className={fieldClasses} value={startPosition}
                onChange={e => setStartPosition(Math.min(perSheet, Math.max(1, Number(e.target.value) || 1)))} />
              <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">Von links oben zeilenweise gezählt (1–{perSheet}) – so lassen sich angebrochene Bögen weiterverwenden.</p>
            </div>
          )}
          <div className="space-y-2">
            <Check checked={prefs.showCustomer} onChange={v => setPrefs(p => ({ ...p, showCustomer: v }))} label="Kundenname aufdrucken" />
            <Check checked={prefs.showSupport} onChange={v => setPrefs(p => ({ ...p, showSupport: v }))} label="Support-Kontakt aufdrucken" />
            <Check checked={prefs.showBarcode} onChange={v => setPrefs(p => ({ ...p, showBarcode: v }))} label="Strichcode (Code 128) für Handscanner" />
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-dark-200 p-3 text-xs text-gray-600 dark:text-dark-400 space-y-1">
            <p>Im Druckdialog <strong>„Tatsächliche Größe“ / Skalierung 100 %</strong> wählen.</p>
            {!format.sheet && <p>Jede PDF-Seite ist ein Etikett – im Druckertreiber das passende Etikettenformat einstellen.</p>}
            <p>Der QR-Code führt Techniker direkt zum Gerät, Kunden zu „Problem melden“.</p>
          </div>
        </div>
        <div className="min-h-[260px] rounded-xl border border-gray-200 dark:border-dark-border bg-gray-100 dark:bg-dark-200 overflow-hidden flex items-center justify-center">
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400 p-4">{error}</p>
          ) : pdfUrl ? (
            <iframe title="Etiketten-Vorschau" src={`${pdfUrl}#toolbar=0&view=FitH`} className="w-full h-[360px] bg-white" />
          ) : (
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-primary" />
          )}
        </div>
      </div>
    </Modal>
  );
};
