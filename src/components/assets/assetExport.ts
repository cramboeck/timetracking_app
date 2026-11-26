import Papa from 'papaparse';
import { ASSET_STATUS_LABELS, ASSET_TYPE_LABELS, type Asset } from '../../services/api';

/** CSV-Download (eigene Datei, damit die Liste nicht den Import-Dialog samt xlsx lädt). */
export const downloadText = (text: string, fileName: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const deDate = (d: string | null) => {
  if (!d) return '';
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : d;
};

/** Aktuelle Liste als CSV (Excel-tauglich: ; + BOM) — gleiche Spalten wie der Import. */
export const exportAssetsCsv = (assets: Asset[]) => {
  const rows = assets.map(a => [
    a.assetTag ?? '', a.name, ASSET_TYPE_LABELS[a.assetType] ?? a.assetType, a.customerName ?? '',
    a.manufacturer ?? '', a.model ?? '', a.serialNumber ?? '', a.inventoryNumber ?? '',
    ASSET_STATUS_LABELS[a.status] ?? a.status, a.location ?? '', a.assignedTo ?? '',
    deDate(a.purchaseDate), deDate(a.warrantyUntil), a.supplier ?? '', a.ipAddress ?? '', a.osName ?? '',
    a.ninjaDeviceRef ? 'ja' : '', deDate(a.lastSeenAt), a.notes ?? '',
  ]);
  const csv = Papa.unparse({
    fields: ['Asset-ID', 'Name', 'Typ', 'Kunde', 'Hersteller', 'Modell', 'Seriennummer', 'Inventarnummer', 'Status',
      'Standort', 'Nutzer', 'Kaufdatum', 'Garantie bis', 'Lieferant', 'IP-Adresse', 'Betriebssystem', 'NinjaOne',
      'Zuletzt gesehen', 'Notizen'],
    data: rows,
  }, { delimiter: ';' });
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(`﻿${csv}`, `Geraete-${stamp}.csv`);
};
