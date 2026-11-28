import { describe, it, expect } from 'vitest';
import { formatHM, formatDecimalHours, cleanDescription, isoWeek, buildServiceReportPdf } from './serviceReportPdf';

describe('serviceReportPdf Helfer', () => {
  it('formatHM rundet über Minuten (kein „1:60 h“)', () => {
    expect(formatHM(1.5)).toBe('1:30 h');
    expect(formatHM(0.9999)).toBe('1:00 h');
    expect(formatHM(90.5)).toBe('90:30 h');
    expect(formatHM(0)).toBe('0:00 h');
  });

  it('formatDecimalHours mit deutschem Komma', () => {
    expect(formatDecimalHours(90.5)).toBe('90,50');
  });

  it('cleanDescription entfernt Satzzeichen am Ende und doppelte Leerzeichen', () => {
    expect(cleanDescription('Citrix WEM Administration,')).toBe('Citrix WEM Administration');
    expect(cleanDescription('  updates   installiert, ')).toBe('updates installiert');
    expect(cleanDescription('Netscaler Wartung - ')).toBe('Netscaler Wartung');
    expect(cleanDescription(null)).toBe('');
  });

  it('isoWeek nach ISO 8601', () => {
    expect(isoWeek(new Date(2026, 10, 9))).toEqual({ year: 2026, week: 46 });
    expect(isoWeek(new Date(2026, 0, 1))).toEqual({ year: 2026, week: 1 });
    expect(isoWeek(new Date(2027, 0, 1))).toEqual({ year: 2026, week: 53 });
  });
});

describe('buildServiceReportPdf', () => {
  const base = {
    title: 'Dienstleistungsnachweis',
    customerName: 'COC AG',
    periodStart: new Date(2026, 10, 1),
    periodEnd: new Date(2026, 10, 30),
  };
  const entry = (day: number, hours: number) => ({
    date: new Date(2026, 10, day, 8), projectName: 'Citrix', description: 'Wartung', hours,
  });

  it('wenige Einträge passen auf eine Seite (vorher immer Deckblatt + Tabelle)', () => {
    const doc = buildServiceReportPdf({ ...base, entries: [entry(3, 1), entry(4, 2)] });
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('viele Einträge brechen auf weitere Seiten um', () => {
    const many = Array.from({ length: 60 }, (_, i) => entry((i % 28) + 1, 1));
    expect(buildServiceReportPdf({ ...base, entries: many }).getNumberOfPages()).toBeGreaterThan(1);
  });

  it('ohne Einträge entsteht trotzdem ein gültiges Dokument', () => {
    expect(buildServiceReportPdf({ ...base, entries: [] }).getNumberOfPages()).toBe(1);
  });
});
