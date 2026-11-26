/**
 * Geräte-Etiketten als PDF (AS-5): QR-Code (Link /l/<token>), Asset-ID,
 * Gerätename, Kunde, optional Code128-Strichcode und Support-Zeile.
 *
 * Rollen-Drucker (Brother QL, Dymo): eine PDF-Seite = ein Etikett in exakt
 * Etikettengröße. A4: Bogen mit Raster, Startposition wählbar (angebrochene
 * Bögen weiterverwenden). Beim Drucken immer „Tatsächliche Größe / 100 %“.
 */
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import type { LabelCompany, LabelData } from '../../services/api';

export type LabelFormatId = 'brother-62x29' | 'dymo-99012' | 'dymo-11354' | 'a4-3657';

export interface LabelFormat {
  id: LabelFormatId;
  label: string;
  hint: string;
  width: number;   // mm
  height: number;  // mm
  /** Nur A4-Bögen */
  sheet?: { cols: number; rows: number; marginLeft: number; marginTop: number; gapX: number; gapY: number };
}

export const LABEL_FORMATS: LabelFormat[] = [
  { id: 'brother-62x29', label: 'Brother QL · 62 × 29 mm', hint: 'DK-11209 bzw. Endlosrolle DK-22205 (62 mm)', width: 62, height: 29 },
  { id: 'dymo-99012', label: 'Dymo LabelWriter · 89 × 36 mm', hint: 'Adressetiketten groß (99012 / S0722400)', width: 89, height: 36 },
  { id: 'dymo-11354', label: 'Dymo LabelWriter · 57 × 32 mm', hint: 'Mehrzwecketiketten (11354 / S0722540)', width: 57, height: 32 },
  {
    id: 'a4-3657', label: 'A4-Bogen · 48,5 × 25,4 mm (44 Stück)', hint: 'Avery Zweckform 3657 oder kompatibel, Laserdrucker',
    width: 48.5, height: 25.4,
    sheet: { cols: 4, rows: 11, marginLeft: 8, marginTop: 8.8, gapX: 0, gapY: 0 },
  },
];

export interface LabelOptions {
  showCustomer: boolean;
  showBarcode: boolean;
  showSupport: boolean;
  /** A4: erste freie Position (1-basiert) */
  startPosition: number;
}

/** Support-Zeile: Telefon + Mail, bei Platzmangel nur das Telefon. */
const supportLines = (c: LabelCompany): string[] => {
  const out: string[] = [];
  if (c.phone && c.email) out.push(`Support: ${c.phone} · ${c.email}`);
  if (c.phone) out.push(`Support: ${c.phone}`);
  if (c.email) out.push(`Support: ${c.email}`);
  return out;
};

const barcodeDataUrl = (text: string): string | null => {
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, text, { format: 'CODE128', displayValue: false, margin: 0, height: 40, width: 2 });
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
};

/** Text auf Breite kürzen (mit …). */
const fit = (doc: jsPDF, text: string, maxWidth: number): string => {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
};

const drawLabel = (
  doc: jsPDF, x: number, y: number, w: number, h: number,
  label: LabelData, company: LabelCompany, opts: LabelOptions,
  qr: string, barcode: string | null,
) => {
  const pad = Math.max(1.5, h * 0.07);
  const qrSize = h - 2 * pad;
  doc.addImage(qr, 'PNG', x + pad, y + pad, qrSize, qrSize);

  const tx = x + pad + qrSize + pad * 0.9;
  const tw = x + w - pad - tx;
  const scale = h / 29;
  let cy = y + pad;

  // Asset-ID groß
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11 * scale);
  cy += 11 * scale * 0.3528; // pt → mm (Grundlinie)
  doc.text(fit(doc, label.assetTag, tw), tx, cy);

  // Gerätename
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5 * scale);
  cy += 7.5 * scale * 0.3528 + 0.9;
  doc.text(fit(doc, label.name, tw), tx, cy);

  if (opts.showCustomer && label.customerName) {
    doc.setFontSize(6.5 * scale);
    doc.setTextColor(90);
    cy += 6.5 * scale * 0.3528 + 0.7;
    doc.text(fit(doc, label.customerName, tw), tx, cy);
    doc.setTextColor(0);
  }

  const bottom = y + h - pad;
  doc.setFontSize(5.5 * scale);
  const candidates = opts.showSupport ? supportLines(company) : [];
  const support = candidates.find(t => doc.getTextWidth(t) <= tw) ?? candidates[candidates.length - 1] ?? null;
  const supportHeight = support ? 5.5 * scale * 0.3528 + 0.6 : 0;

  // Strichcode (Asset-ID, für Handscanner) im verbleibenden Raum
  if (opts.showBarcode && barcode) {
    const bcHeight = Math.min(5.5 * scale, bottom - supportHeight - cy - 1.2);
    if (bcHeight >= 3) {
      doc.addImage(barcode, 'PNG', tx, bottom - supportHeight - bcHeight, Math.min(tw, 40 * scale), bcHeight);
    }
  }

  if (support) {
    doc.setFontSize(5.5 * scale);
    doc.setTextColor(90);
    doc.text(fit(doc, support, tw), tx, bottom - 0.3);
    doc.setTextColor(0);
  }
};

export async function buildLabelPdf(
  labels: LabelData[], company: LabelCompany, formatId: LabelFormatId, opts: LabelOptions,
): Promise<jsPDF> {
  const format = LABEL_FORMATS.find(f => f.id === formatId) ?? LABEL_FORMATS[0];
  const images = await Promise.all(labels.map(async l => ({
    qr: await QRCode.toDataURL(l.url, { errorCorrectionLevel: 'M', margin: 0, width: 300 }),
    barcode: opts.showBarcode ? barcodeDataUrl(l.assetTag) : null,
  })));

  if (format.sheet) {
    const s = format.sheet;
    const perSheet = s.cols * s.rows;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    let slot = Math.min(Math.max(opts.startPosition, 1), perSheet) - 1;
    labels.forEach((l, i) => {
      if (slot >= perSheet) { doc.addPage('a4', 'portrait'); slot = 0; }
      const col = slot % s.cols;
      const row = Math.floor(slot / s.cols);
      const x = s.marginLeft + col * (format.width + s.gapX);
      const y = s.marginTop + row * (format.height + s.gapY);
      drawLabel(doc, x, y, format.width, format.height, l, company, opts, images[i].qr, images[i].barcode);
      slot++;
    });
    return doc;
  }

  const doc = new jsPDF({ unit: 'mm', format: [format.width, format.height], orientation: 'landscape' });
  labels.forEach((l, i) => {
    if (i > 0) doc.addPage([format.width, format.height], 'landscape');
    drawLabel(doc, 0, 0, format.width, format.height, l, company, opts, images[i].qr, images[i].barcode);
  });
  return doc;
}
