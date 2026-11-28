import jsPDF from 'jspdf';

/**
 * Dienstleistungsnachweis als PDF (A4 hoch) — EINE Quelle für den Export im
 * Report-Assistenten UND den Download gespeicherter Reports (vorher zwei
 * verschiedene Generatoren mit unterschiedlichem Aussehen).
 *
 * Aufbau: Kopf mit Firma/Logo → Titelblock (Kunde, Leistungszeitraum, ggf.
 * Projekt/Rechnungsbezug) → Kennzahlen → Projektverteilung (nur ab 2 Projekten)
 * → Tabelle nach Kalenderwochen mit Wochensummen → Gesamtsumme → Unterschriften
 * → Fußzeile mit Firmendaten und „Seite x von y“ auf jeder Seite.
 * Leere Spalten (Tätigkeit, Projekt bei nur einem Projekt) entfallen automatisch.
 *
 * Bewusst ohne DOM-Abhängigkeit: das Logo kommt fertig skaliert herein,
 * dadurch lässt sich das PDF auch in Node erzeugen (Tests/Probedruck).
 */

export interface ServiceReportEntry {
  date: Date;
  projectName: string;
  activityName?: string | null;
  description: string;
  hours: number;
  memberName?: string | null;
}

export interface ServiceReportCompany {
  name?: string | null;
  address?: string | null;
  zipCode?: string | null;
  city?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  taxId?: string | null;
}

export interface ServiceReportInput {
  title: string;
  customerName: string;
  periodStart: Date;
  periodEnd: Date;
  entries: ServiceReportEntry[];
  company?: ServiceReportCompany | null;
  /** fertig skaliertes Logo (PNG/JPEG Data-URL) mit Pixelmaßen */
  logo?: { data: string; width: number; height: number } | null;
  /** optionaler Bezug „Anlage zu Rechnung …“ */
  invoiceNumber?: string | null;
  columns?: {
    member?: boolean;
    times?: boolean;
    project?: boolean;
    activity?: boolean;
    description?: boolean;
  };
  includeSummary?: boolean;
  includeTable?: boolean;
  includeSignatures?: boolean;
  createdAt?: Date;
}

// ---------------------------------------------------------------------------
// Helfer (exportiert für Tests)
// ---------------------------------------------------------------------------

/** 1.5 → „1:30 h“ (über Minuten gerundet — vorher konnte „1:60 h“ entstehen) */
export const formatHM = (hours: number): string => {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')} h`;
};

/** 90.5 → „90,50“ */
export const formatDecimalHours = (hours: number): string =>
  (Math.round(hours * 100) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Leerzeichen bündeln, Satzzeichen am Ende („…Administration,“) entfernen */
export const cleanDescription = (text: string | null | undefined): string =>
  (text ?? '').replace(/\s+/g, ' ').trim().replace(/[\s,;:–-]+$/u, '').trim();

/** ISO-Kalenderwoche */
export const isoWeek = (d: Date): { year: number; week: number } => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return { year: date.getUTCFullYear(), week: Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7) };
};

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dmy = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dm = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// ---------------------------------------------------------------------------

export function buildServiceReportPdf(input: ServiceReportInput): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const W = 210;
  const H = 297;
  const M = 18;
  const CW = W - 2 * M;
  const FOOTER_SPACE = 22;

  const dark: [number, number, number] = [17, 24, 39];
  const gray: [number, number, number] = [107, 114, 128];
  const light: [number, number, number] = [243, 244, 246];
  const line: [number, number, number] = [229, 231, 235];
  const accent: [number, number, number] = [249, 115, 22];

  const setText = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const font = (style: 'normal' | 'bold', size: number) => { doc.setFont('helvetica', style); doc.setFontSize(size); };

  const entries = [...input.entries]
    .map(e => ({ ...e, description: cleanDescription(e.description) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const totalHours = entries.reduce((s, e) => s + e.hours, 0);
  const projects = new Map<string, number>();
  entries.forEach(e => projects.set(e.projectName, (projects.get(e.projectName) || 0) + e.hours));
  const projectList = [...projects.entries()].sort((a, b) => b[1] - a[1]);
  const singleProject = projectList.length === 1 ? projectList[0][0] : null;

  const cfg = input.columns ?? {};
  const show = {
    member: !!cfg.member && entries.some(e => e.memberName),
    times: !!cfg.times,
    // Projekt-Spalte nur, wenn es mehrere Projekte gibt (sonst steht es im Kopf)
    project: (cfg.project ?? true) && !singleProject,
    // Tätigkeit nur, wenn mindestens ein Eintrag eine hat
    activity: (cfg.activity ?? true) && entries.some(e => e.activityName && e.activityName !== '-'),
    description: cfg.description ?? true,
  };
  const includeSummary = input.includeSummary ?? true;
  const includeTable = input.includeTable ?? true;
  const includeSignatures = input.includeSignatures ?? true;
  const periodText = `${dmy(input.periodStart)} – ${dmy(input.periodEnd)}`;

  // --- Logo ----------------------------------------------------------------
  const drawLogo = (x: number, y: number, maxW: number, maxH: number) => {
    if (!input.logo) return;
    try {
      const ratio = input.logo.width / input.logo.height;
      let w = maxW;
      let h = maxW / ratio;
      if (h > maxH) { h = maxH; w = maxH * ratio; }
      const fmt = input.logo.data.startsWith('data:image/jpeg') || input.logo.data.startsWith('data:image/jpg') ? 'JPEG' : 'PNG';
      doc.addImage(input.logo.data, fmt, x + maxW - w, y, w, h);
    } catch {
      /* Logo ist optional */
    }
  };

  // --- Kopf ----------------------------------------------------------------
  const companyLine = [
    input.company?.address,
    [input.company?.zipCode, input.company?.city].filter(Boolean).join(' '),
  ].filter(s => s && String(s).trim()).join(' · ');

  const drawFirstHeader = (): number => {
    doc.setFillColor(...accent);
    doc.rect(0, 0, W, 2.5, 'F');
    drawLogo(W - M - 42, 10, 42, 16);
    if (input.company?.name) {
      font('bold', 10); setText(dark);
      doc.text(input.company.name, M, 16);
      if (companyLine) { font('normal', 8); setText(gray); doc.text(companyLine, M, 21); }
    }
    return 34;
  };

  const drawFollowHeader = (): number => {
    doc.setFillColor(...accent);
    doc.rect(0, 0, W, 2.5, 'F');
    drawLogo(W - M - 30, 8, 30, 11);
    font('bold', 11); setText(dark);
    doc.text(input.customerName, M, 14);
    font('normal', 8.5); setText(gray);
    doc.text(`${input.title} · ${periodText}`, M, 19.5);
    return 30;
  };

  // --- Seite 1: Titel + Kennzahlen -----------------------------------------
  let y = drawFirstHeader();

  doc.setFillColor(...accent);
  const metaLines: string[] = [`Leistungszeitraum: ${periodText}`];
  if (singleProject) metaLines.push(`Projekt: ${singleProject}`);
  if (input.invoiceNumber) metaLines.push(`Anlage zu Rechnung ${input.invoiceNumber}`);
  // Kennzahlen bewusst schlank: nur die Gesamtzeit im Titelblock (User:
  // Arbeitstage/Durchschnitt sind für den Kunden zu viel)
  if (includeSummary) metaLines.push(`Gesamtzeit: ${formatHM(totalHours)} (${formatDecimalHours(totalHours)} Std.)`);
  const titleBlockH = 13 + metaLines.length * 4.4;
  doc.rect(M, y, 1.2, titleBlockH, 'F');
  font('normal', 8.5); setText(gray);
  doc.text(input.title, M + 5, y + 3.6);
  font('bold', 15); setText(dark);
  const nameLines = doc.splitTextToSize(input.customerName, CW - 10) as string[];
  doc.text(nameLines[0], M + 5, y + 10);
  font('normal', 8.5); setText(gray);
  metaLines.forEach((t, i) => doc.text(t, M + 5, y + 15.2 + i * 4.4));
  y += titleBlockH + 6;

  if (includeSummary) {
    // Projektverteilung nur bei mehreren Projekten (eine 100-%-Torte sagt nichts)
    if (projectList.length > 1) {
      font('bold', 9.5); setText(dark);
      doc.text('Verteilung nach Projekten', M, y);
      y += 5;
      const barX = M + 70;
      const barW = CW - 70 - 28;
      projectList.slice(0, 6).forEach(([name, hrs]) => {
        font('normal', 8.5); setText(dark);
        const label = (doc.splitTextToSize(name, 66) as string[])[0];
        doc.text(label, M, y + 3);
        doc.setFillColor(...light);
        doc.roundedRect(barX, y, barW, 3.6, 1.2, 1.2, 'F');
        doc.setFillColor(...accent);
        doc.roundedRect(barX, y, Math.max(1.5, barW * (hrs / totalHours)), 3.6, 1.2, 1.2, 'F');
        setText(gray);
        doc.text(`${formatHM(hrs)}  ${Math.round((hrs / totalHours) * 100)} %`, W - M, y + 3, { align: 'right' });
        y += 6.5;
      });
      if (projectList.length > 6) {
        font('normal', 8); setText(gray);
        doc.text(`+ ${projectList.length - 6} weitere Projekte`, M, y + 2);
        y += 5;
      }
      y += 4;
    }
  }

  // --- Tabelle ---------------------------------------------------------------
  if (includeTable && entries.length > 0) {
    const widths: Record<string, number> = { date: 20, member: 28, times: 22, project: 36, activity: 28, hours: 18 };
    const order = ['date', ...(show.member ? ['member'] : []), ...(show.times ? ['times'] : []),
      ...(show.project ? ['project'] : []), ...(show.activity ? ['activity'] : []),
      ...(show.description ? ['description'] : []), 'hours'];
    const fixed = order.filter(k => k !== 'description').reduce((s, k) => s + widths[k], 0);
    widths.description = Math.max(40, CW - fixed);
    const colX: Record<string, number> = {};
    let cx = M;
    order.forEach(k => { colX[k] = cx; cx += widths[k]; });
    const headers: Record<string, string> = {
      date: 'Datum', member: 'Mitarbeiter', times: 'Uhrzeit', project: 'Projekt',
      activity: 'Tätigkeit', description: 'Beschreibung', hours: 'Zeit',
    };

    const drawTableHeader = () => {
      doc.setFillColor(...light);
      doc.rect(M, y, CW, 7, 'F');
      font('bold', 8); setText(gray);
      order.forEach(k => {
        if (k === 'hours') doc.text(headers[k], M + CW - 2, y + 4.8, { align: 'right' });
        else doc.text(headers[k], colX[k] + 2, y + 4.8);
      });
      y += 9;
    };

    const newPage = (withTableHeader = true) => {
      doc.addPage();
      y = drawFollowHeader();
      if (withTableHeader) drawTableHeader();
    };

    const fit = (text: string, width: number) => {
      let t = text;
      while (t.length > 3 && doc.getTextWidth(t) > width) t = t.slice(0, -2);
      return t === text ? t : `${t.trimEnd()}…`;
    };

    // Wochen gruppieren
    const weeks = new Map<string, { label: string; hours: number; rows: typeof entries }>();
    for (const e of entries) {
      const { year, week } = isoWeek(e.date);
      const key = `${year}-${String(week).padStart(2, '0')}`;
      if (!weeks.has(key)) weeks.set(key, { label: `KW ${week}`, hours: 0, rows: [] });
      const w = weeks.get(key)!;
      w.hours += e.hours;
      w.rows.push(e);
    }

    if (y > H - FOOTER_SPACE - 30) newPage(); else drawTableHeader();

    const LINE = 3.9;
    const rowHeightOf = (e: (typeof entries)[number]) => {
      font('normal', 8.5);
      const lines = show.description ? (doc.splitTextToSize(e.description || '–', widths.description - 4) as string[]).length : 1;
      return Math.max(6, lines * LINE + 2.2);
    };
    for (const week of weeks.values()) {
      const first = week.rows[0].date;
      const last = week.rows[week.rows.length - 1].date;
      // Wochenkopf nie allein am Seitenende: mit dem ersten Eintrag zusammen umbrechen
      if (y + 8 + rowHeightOf(week.rows[0]) > H - FOOTER_SPACE) newPage();
      // Wochenkopf mit Wochensumme
      font('bold', 8.5); setText(dark);
      doc.text(`${week.label}`, M + 2, y + 3.5);
      font('normal', 8); setText(gray);
      doc.text(first.getTime() === last.getTime() ? dm(first) : `${dm(first)} – ${dm(last)}`, M + 18, y + 3.5);
      font('bold', 8.5); setText(dark);
      doc.text(formatHM(week.hours), M + CW - 2, y + 3.5, { align: 'right' });
      doc.setDrawColor(...line); doc.setLineWidth(0.3);
      doc.line(M, y + 5.5, M + CW, y + 5.5);
      y += 8;

      let prevDay = '';
      for (const e of week.rows) {
        font('normal', 8.5);
        const descLines = show.description
          ? (doc.splitTextToSize(e.description || '–', widths.description - 4) as string[])
          : [''];
        const rowH = Math.max(6, descLines.length * LINE + 2.2);
        if (y + rowH > H - FOOTER_SPACE) { newPage(); prevDay = ''; }

        const day = dayKey(e.date);
        setText(dark);
        // Datum nur in der ersten Zeile eines Tages — mehrere Einträge am Tag wirken ruhiger
        if (day !== prevDay) {
          font('bold', 8.5);
          doc.text(`${WEEKDAYS[e.date.getDay()]} ${dm(e.date)}`, colX.date + 2, y + 3);
          font('normal', 8.5);
        }
        prevDay = day;
        if (show.member) doc.text(fit(e.memberName || '–', widths.member - 4), colX.member + 2, y + 3);
        if (show.times) {
          const end = new Date(e.date.getTime() + e.hours * 3600000);
          setText(gray);
          doc.text(`${e.date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}–${end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`, colX.times + 2, y + 3);
          setText(dark);
        }
        if (show.project) doc.text(fit(e.projectName, widths.project - 4), colX.project + 2, y + 3);
        if (show.activity) { setText(gray); doc.text(fit(e.activityName && e.activityName !== '-' ? e.activityName : '–', widths.activity - 4), colX.activity + 2, y + 3); setText(dark); }
        if (show.description) doc.text(descLines, colX.description + 2, y + 3, { lineHeightFactor: 1.3 });
        font('bold', 8.5);
        doc.text(formatHM(e.hours), M + CW - 2, y + 3, { align: 'right' });

        y += rowH;
        doc.setDrawColor(...line); doc.setLineWidth(0.15);
        doc.line(M + 2, y - 1.2, M + CW, y - 1.2);
      }
      y += 2.5;
    }

    // Gesamtsumme
    const memberTotals = new Map<string, number>();
    if (show.member) entries.forEach(e => memberTotals.set(e.memberName || '–', (memberTotals.get(e.memberName || '–') || 0) + e.hours));
    const extra = memberTotals.size > 1 ? memberTotals.size * 5 : 0;
    if (y + 13 + extra > H - FOOTER_SPACE) newPage(false);
    doc.setFillColor(...light);
    doc.roundedRect(M, y, CW, 8.5, 1.8, 1.8, 'F');
    doc.setFillColor(...accent);
    doc.rect(M, y, 1.2, 8.5, 'F');
    font('bold', 9.5); setText(dark);
    doc.text('Gesamt', M + 5, y + 5.7);
    font('normal', 8); setText(gray);
    doc.text(`${formatDecimalHours(totalHours)} Std.`, M + CW - 24, y + 5.7, { align: 'right' });
    font('bold', 10.5); setText(dark);
    doc.text(formatHM(totalHours), M + CW - 2, y + 5.8, { align: 'right' });
    y += 12.5;
    if (memberTotals.size > 1) {
      font('normal', 8.5); setText(gray);
      [...memberTotals.entries()].sort((a, b) => b[1] - a[1]).forEach(([name, hrs]) => {
        doc.text(`davon ${name}`, M + 6, y);
        doc.text(formatHM(hrs), M + CW - 2, y, { align: 'right' });
        y += 5;
      });
      y += 2;
    }
  }

  // --- Unterschriften (ans Ende, unter die Summe) ----------------------------
  if (includeSignatures) {
    if (y + 24 > H - FOOTER_SPACE) { doc.addPage(); y = drawFollowHeader() + 4; }
    y += 4;
    font('normal', 8); setText(gray);
    doc.text('Die aufgeführten Leistungen wurden erbracht und werden bestätigt.', M, y);
    y += 13;
    doc.setDrawColor(160, 160, 160); doc.setLineWidth(0.3);
    const sw = (CW - 16) / 2;
    doc.line(M, y, M + sw, y);
    doc.line(M + sw + 16, y, M + CW, y);
    font('normal', 8); setText(gray);
    doc.text('Ort, Datum, Unterschrift Auftragnehmer', M, y + 4.5);
    doc.text('Ort, Datum, Unterschrift Auftraggeber', M + sw + 16, y + 4.5);
  }

  // --- Fußzeile auf allen Seiten ---------------------------------------------
  const pages = doc.getNumberOfPages();
  const created = input.createdAt ?? new Date();
  const footerParts = [
    input.company?.name,
    companyLine,
    input.company?.taxId ? `USt-IdNr. ${input.company.taxId}` : null,
    input.company?.email,
  ].filter(Boolean) as string[];
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...line); doc.setLineWidth(0.3);
    doc.line(M, H - 14, W - M, H - 14);
    font('normal', 7); setText(gray);
    const footer = footerParts.join(' · ');
    doc.text(doc.splitTextToSize(footer, CW - 30) as string[], M, H - 10);
    doc.text(`Seite ${p} von ${pages}`, W - M, H - 10, { align: 'right' });
    doc.text(`Erstellt am ${dmy(created)}`, W - M, H - 6.5, { align: 'right' });
  }
  doc.setPage(pages);

  return doc;
}
