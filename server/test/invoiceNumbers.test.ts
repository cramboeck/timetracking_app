import { describe, it, expect } from 'vitest';
import { parseInvoiceNumber, checkInvoiceNumber } from '../src/utils/invoiceNumbers';

const inv = (id: string, invoiceNumber: string | null) => ({ id, invoiceNumber });

describe('parseInvoiceNumber', () => {
  it('erkennt Präfix, Zahl und Stellen', () => {
    expect(parseInvoiceNumber('RE-1042')).toEqual({ prefix: 'RE-', num: 1042, width: 4 });
    expect(parseInvoiceNumber('2026-007')).toEqual({ prefix: '2026-', num: 7, width: 3 });
  });
  it('ignoriert Einträge ohne Nummer', () => {
    expect(parseInvoiceNumber('')).toBeNull();
    expect(parseInvoiceNumber(null)).toBeNull();
    expect(parseInvoiceNumber('Entwurf')).toBeNull();
  });
});

describe('checkInvoiceNumber', () => {
  const existing = [inv('1', 'RE-1040'), inv('2', 'RE-1041'), inv('3', null), inv('4', 'AN-9000')];

  it('nächste Nummer → ok', () => {
    expect(checkInvoiceNumber('RE-1042', 'neu', existing)).toMatchObject({ status: 'ok', previous: 'RE-1041' });
  });
  it('Lücke mit fehlenden Nummern', () => {
    expect(checkInvoiceNumber('RE-1044', 'neu', existing)).toMatchObject({
      status: 'gap', previous: 'RE-1041', missing: ['RE-1042', 'RE-1043'], missingCount: 2,
    });
  });
  it('doppelte Nummer', () => {
    expect(checkInvoiceNumber('RE-1041', 'neu', existing).status).toBe('duplicate');
  });
  it('kleiner als die bisher höchste → out_of_order', () => {
    expect(checkInvoiceNumber('RE-1039', 'neu', existing)).toMatchObject({ status: 'out_of_order', previous: 'RE-1041' });
  });
  it('die neue Rechnung selbst zählt nicht als Duplikat', () => {
    expect(checkInvoiceNumber('RE-1042', 'x', [...existing, inv('x', 'RE-1042')]).status).toBe('ok');
  });
  it('neue Nummernserie (anderes Präfix) → first', () => {
    expect(checkInvoiceNumber('RE2027-001', 'neu', existing).status).toBe('first');
  });
  it('führende Nullen bleiben in den fehlenden Nummern erhalten', () => {
    expect(checkInvoiceNumber('2026-010', 'n', [inv('a', '2026-007')]).missing).toEqual(['2026-008', '2026-009']);
  });
  it('lange Lücke: höchstens 10 aufgelistet, Anzahl stimmt', () => {
    const r = checkInvoiceNumber('RE-1100', 'n', existing);
    expect(r.missing).toHaveLength(10);
    expect(r.missingCount).toBe(58);
  });
});
