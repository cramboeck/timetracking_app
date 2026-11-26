import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Upload, Download } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Modal } from '../Modal';
import { Button } from '../ui/Button';
import { useToast } from '../../contexts/UIContext';
import { assetToolsApi, type ImportResult, type ImportRow } from '../../services/api';
import { fieldClasses } from './assetUi';
import { downloadText } from './assetExport';

/**
 * Geräte-Import (AS-7) aus CSV/Excel: Spalten werden über deutsche und
 * englische Überschriften automatisch zugeordnet, Probelauf zeigt jede
 * Zeile mit Ergebnis, erst dann wird angelegt. Typen/Status/Kunden/Datumsformate
 * übersetzt der Server; doppelte Seriennummern werden übersprungen.
 */
type Field = keyof ImportRow;

const FIELD_LABELS: Record<Field, string> = {
  name: 'Name', assetType: 'Typ', customer: 'Kunde', manufacturer: 'Hersteller', model: 'Modell',
  serialNumber: 'Seriennummer', inventoryNumber: 'Inventarnummer', status: 'Status', location: 'Standort',
  assignedTo: 'Nutzer', purchaseDate: 'Kaufdatum', warrantyUntil: 'Garantie bis', supplier: 'Lieferant',
  ipAddress: 'IP-Adresse', osName: 'Betriebssystem', notes: 'Notizen',
};

/** Spaltenüberschrift (klein, ohne Sonderzeichen) → Feld */
const SYNONYMS: Record<Field, string[]> = {
  name: ['name', 'gerat', 'geraet', 'geratename', 'geraetename', 'bezeichnung', 'hostname', 'device', 'devicename', 'computername'],
  assetType: ['typ', 'type', 'art', 'geratetyp', 'geraetetyp', 'kategorie', 'category', 'devicetype'],
  customer: ['kunde', 'customer', 'firma', 'company', 'kundenname', 'client', 'kundennummer', 'kundennr'],
  manufacturer: ['hersteller', 'manufacturer', 'vendor', 'marke', 'brand', 'make'],
  model: ['modell', 'model', 'typenbezeichnung', 'produkt', 'product'],
  serialNumber: ['seriennummer', 'seriennr', 'serial', 'serialnumber', 'sn', 'servicetag'],
  inventoryNumber: ['inventarnummer', 'inventarnr', 'inventory', 'inventorynumber', 'assettag', 'inventar'],
  status: ['status', 'zustand', 'state'],
  location: ['standort', 'location', 'raum', 'room', 'ort', 'site'],
  assignedTo: ['nutzer', 'benutzer', 'user', 'mitarbeiter', 'assignedto', 'zugewiesen', 'owner', 'besitzer'],
  purchaseDate: ['kaufdatum', 'purchasedate', 'gekauftam', 'anschaffung', 'anschaffungsdatum', 'purchased'],
  warrantyUntil: ['garantie', 'garantiebis', 'warranty', 'warrantyuntil', 'warrantyend', 'garantieende', 'gewahrleistung'],
  supplier: ['lieferant', 'supplier', 'handler', 'haendler', 'distributor'],
  ipAddress: ['ip', 'ipadresse', 'ipaddress'],
  osName: ['betriebssystem', 'os', 'osname', 'operatingsystem', 'system'],
  notes: ['notizen', 'notiz', 'notes', 'bemerkung', 'bemerkungen', 'kommentar', 'comment', 'beschreibung', 'description'],
};

const norm = (h: string) => h.toLowerCase()
  .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]/g, '');

const guessField = (header: string): Field | '' => {
  const n = norm(header);
  for (const f of Object.keys(SYNONYMS) as Field[]) {
    if (SYNONYMS[f].includes(n)) return f;
  }
  return '';
};

const STATUS_TONE: Record<ImportResult['status'], string> = {
  created: 'text-green-700 dark:text-green-400',
  ready: 'text-green-700 dark:text-green-400',
  skipped: 'text-amber-700 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
};
const STATUS_TEXT: Record<ImportResult['status'], string> = {
  created: 'angelegt', ready: 'bereit', skipped: 'übersprungen', error: 'Fehler',
};

interface AssetImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCustomerId?: string;
}

export const AssetImportDialog = ({ isOpen, onClose, defaultCustomerId }: AssetImportDialogProps) => {
  const showToast = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, Field | ''>>({});
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState(false);

  const reset = () => {
    setFileName(''); setHeaders([]); setRawRows([]); setMapping({}); setResults(null); setImported(false);
    if (fileRef.current) fileRef.current.value = '';
  };
  const close = () => { reset(); onClose(); };

  const takeRows = (rows: Record<string, unknown>[]) => {
    const clean = rows
      .map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), v == null ? '' : String(v).trim()])))
      .filter(r => Object.values(r).some(v => v !== ''));
    if (clean.length === 0) { showToast('Keine Datenzeilen gefunden', 'warning'); return; }
    if (clean.length > 2000) { showToast('Maximal 2000 Zeilen pro Import', 'warning'); return; }
    const hs = Object.keys(clean[0]);
    setHeaders(hs);
    setRawRows(clean);
    setMapping(Object.fromEntries(hs.map(h => [h, guessField(h)])));
    setResults(null);
    setImported(false);
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false, dateNF: 'dd.mm.yyyy' });
        takeRows(rows);
      } else {
        const text = await file.text();
        const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
        takeRows(parsed.data);
      }
    } catch {
      showToast('Datei konnte nicht gelesen werden', 'error');
    }
  };

  const buildRows = (): ImportRow[] => rawRows.map(r => {
    const out: ImportRow = {};
    for (const h of headers) {
      const f = mapping[h];
      if (f && r[h]) out[f] = (out[f] ? `${out[f]} ${r[h]}` : r[h]).slice(0, f === 'notes' ? 5000 : 200);
    }
    return out;
  });

  const run = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const r = await assetToolsApi.import(buildRows(), { dryRun, defaultCustomerId: defaultCustomerId ?? null });
      setResults(r.data.results);
      if (!dryRun) {
        setImported(true);
        queryClient.invalidateQueries({ queryKey: ['assets'] });
        showToast(`${r.data.created} ${r.data.created === 1 ? 'Gerät' : 'Geräte'} importiert`, 'success');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Import fehlgeschlagen', 'error');
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const cols = (Object.keys(FIELD_LABELS) as Field[]).filter(f => !(defaultCustomerId && f === 'customer'));
    const example: Record<Field, string> = {
      name: 'Empfang-PC', assetType: 'Arbeitsplatz-PC', customer: 'Musterfirma GmbH', manufacturer: 'Lenovo', model: 'ThinkCentre M70q',
      serialNumber: 'MJ0ABC12', inventoryNumber: '', status: 'Im Einsatz', location: 'Empfang', assignedTo: 'Frau Huber',
      purchaseDate: '15.03.2025', warrantyUntil: '15.03.2028', supplier: '', ipAddress: '', osName: 'Windows 11 Pro', notes: '',
    };
    const csv = Papa.unparse({ fields: cols.map(f => FIELD_LABELS[f]), data: [cols.map(f => example[f])] }, { delimiter: ';' });
    downloadText(`﻿${csv}`, 'Geraete-Vorlage.csv');
  };

  const okCount = results?.filter(r => r.status === 'ready' || r.status === 'created').length ?? 0;
  const mappedAny = Object.values(mapping).some(Boolean);
  const nameMapped = Object.values(mapping).some(f => f === 'name' || f === 'manufacturer' || f === 'model');

  const footer = (
    <div className="flex flex-wrap justify-between gap-2">
      <Button variant="ghost" onClick={downloadTemplate} icon={<Download size={16} />}>Vorlage</Button>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={close}>{imported ? 'Fertig' : 'Abbrechen'}</Button>
        {rawRows.length > 0 && !imported && (
          results && okCount > 0
            ? <Button variant="primary" onClick={() => run(false)} disabled={busy}>{okCount} {okCount === 1 ? 'Gerät' : 'Geräte'} importieren</Button>
            : <Button variant="primary" onClick={() => run(true)} disabled={busy || !mappedAny || !nameMapped}>Prüfen</Button>
        )}
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={close} title="Geräte importieren" maxWidth="3xl" footer={footer}>
      <div className="space-y-4 text-left">
        <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" aria-label="Importdatei"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        <button type="button" onClick={() => fileRef.current?.click()}
          className="w-full rounded-xl border-2 border-dashed border-gray-300 dark:border-dark-border hover:border-accent-primary p-5 flex flex-col items-center gap-2 text-sm text-gray-600 dark:text-dark-400">
          {fileName ? <FileSpreadsheet size={22} className="text-accent-primary" /> : <Upload size={22} />}
          {fileName ? <span><strong className="text-gray-900 dark:text-white">{fileName}</strong> · {rawRows.length} Zeilen – andere Datei wählen</span>
            : <span>CSV- oder Excel-Datei wählen (erste Zeile = Spaltenüberschriften)</span>}
        </button>

        {headers.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Spalten zuordnen</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {headers.map(h => (
                <div key={h} className="flex items-center gap-2 min-w-0">
                  <span className="w-2/5 truncate text-sm text-gray-700 dark:text-dark-500" title={h}>{h}</span>
                  <select className={`${fieldClasses} !py-1.5`} value={mapping[h] ?? ''}
                    onChange={e => { setMapping(m => ({ ...m, [h]: e.target.value as Field | '' })); setResults(null); }}>
                    <option value="">– ignorieren –</option>
                    {(Object.keys(FIELD_LABELS) as Field[])
                      .filter(f => !(defaultCustomerId && f === 'customer'))
                      .map(f => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {!nameMapped && <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">Mindestens „Name“ (oder Hersteller/Modell) zuordnen.</p>}
            <p className="text-xs text-gray-500 dark:text-dark-400 mt-2">
              Typen wie „Drucker“, „Laptop“, „Firewall“, Status wie „Im Einsatz“/„Lager“ und Datumsangaben TT.MM.JJJJ werden automatisch übersetzt.
              {!defaultCustomerId && ' Kunden werden über Name oder Kundennummer gefunden.'}
            </p>
          </div>
        )}

        {results && (
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
              {imported ? 'Ergebnis' : 'Probelauf'}: {okCount} ok
              {results.some(r => r.status === 'skipped') && ` · ${results.filter(r => r.status === 'skipped').length} übersprungen`}
              {results.some(r => r.status === 'error') && ` · ${results.filter(r => r.status === 'error').length} mit Fehler`}
            </p>
            <ul className="max-h-[35vh] overflow-y-auto divide-y divide-gray-100 dark:divide-dark-border rounded-xl border border-gray-200 dark:border-dark-border text-sm">
              {results.map(r => (
                <li key={r.row} className="flex items-start gap-3 px-3 py-1.5">
                  <span className="w-10 text-xs text-gray-400 pt-0.5">#{r.row}</span>
                  <span className="flex-1 min-w-0 truncate text-gray-900 dark:text-white">{r.name || '—'}{r.assetTag ? <span className="text-gray-500 dark:text-dark-400"> · {r.assetTag}</span> : null}</span>
                  <span className={`text-xs text-right ${STATUS_TONE[r.status]}`}>{STATUS_TEXT[r.status]}{r.message ? `: ${r.message}` : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
};

