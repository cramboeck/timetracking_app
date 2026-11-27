import { describe, expect, it } from 'vitest';
import {
  classifyOrderMail, extractTicketNumbers, extractReference, isInternalReference,
  extractOrderNumber, extractTracking, supplierFromSender,
} from '../src/utils/orderMailParser';

describe('classifyOrderMail', () => {
  it.each([
    ['Ihre Bestellbestätigung 302-1234567-8901234', '', 'order_confirmation'],
    ['Auftragsbestätigung AB-2026-4711', '', 'order_confirmation'],
    ['Your order #112-55 has been received', '', 'order_confirmation'],
    ['Ihre Sendung ist unterwegs', '', 'shipping'],
    ['Versandbestätigung zu Bestellung 4711', '', 'shipping'],
    ['Rechnung RE-2026-0815', '', 'invoice'],
    ['Invoice 99812', '', 'invoice'],
    ['Newsletter November', 'Tolle Angebote', 'other'],
  ])('%s → %s', (subject, text, kind) => {
    expect(classifyOrderMail(subject, text)).toBe(kind);
  });
  it('Rechnungsadresse in einer Bestätigung macht sie nicht zur Rechnung', () => {
    expect(classifyOrderMail('Ihre Bestellung bei Shop', 'Rechnungsadresse: Musterstr. 1')).toBe('order_confirmation');
  });
  it('Text-Fallback erkennt Versand an der Sendungsnummer', () => {
    expect(classifyOrderMail('Info zu Auftrag', 'Ihre Sendungsnummer: 00340434161094015902')).toBe('shipping');
  });
});

describe('Referenz, Ticket, Intern', () => {
  it('findet Ticketnummern in Betreff und Text (normalisiert)', () => {
    expect(extractTicketNumbers('Bestellung TKT-000123', 'Kommission: tkt000456 Huber')).toEqual(['TKT-000123', 'TKT-000456']);
  });
  it('liest die Referenz', () => {
    expect(extractReference('Lieferadresse …\nIhre Referenz: TKT-000123 Huber\nSumme')).toBe('TKT-000123 Huber');
    expect(extractReference('Kommission: INTERN')).toBe('INTERN');
  });
  it('erkennt Eigenbedarf', () => {
    expect(isInternalReference('Bestellung', 'INTERN')).toBe(true);
    expect(isInternalReference('Bestellung', 'Internet-Router für Huber')).toBe(false);
  });
});

describe('extractOrderNumber', () => {
  it.each([
    ['Bestellbestätigung', 'Bestellnummer: 302-1234567-8901234', '302-1234567-8901234'],
    ['Auftragsbestätigung Auftrags-Nr. AB2026-4711', '', 'AB2026-4711'],
    ['Your order', 'Order number: SO-99881', 'SO-99881'],
    ['Bestellung 77123 eingegangen', '', '77123'],
  ])('%s', (subject, text, expected) => {
    expect(extractOrderNumber(subject, text)).toBe(expected);
  });
  it('nimmt keine Ticketnummer und nichts ohne Ziffer', () => {
    expect(extractOrderNumber('Bestellung TKT-000123', 'Bestellung: ABCDEF')).toBeNull();
  });
});

describe('extractTracking', () => {
  it('liest DHL-Link und Sendungsnummer', () => {
    const r = extractTracking('Sendungsverfolgung: https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=00340434161094015902');
    expect(r[0]).toMatchObject({ carrier: 'DHL', number: '00340434161094015902' });
  });
  it('liest „Sendungsnummer:“ mit Carrier aus der Umgebung', () => {
    const r = extractTracking('Versand mit UPS. Sendungsnummer: 1Z999AA10123456784');
    expect(r[0]).toMatchObject({ carrier: 'UPS', number: '1Z999AA10123456784', url: null });
  });
  it('ignoriert Links ohne Carrier', () => {
    expect(extractTracking('https://example.com/track?tracking=ABCDEF123456')).toEqual([]);
  });
});

describe('supplierFromSender', () => {
  it('nimmt sprechende Absendernamen, sonst die Domain', () => {
    expect(supplierFromSender('Infinigate Deutschland', 'orders@infinigate.de')).toBe('Infinigate Deutschland');
    expect(supplierFromSender('noreply', 'noreply@mail.reichelt.de')).toBe('Reichelt');
    expect(supplierFromSender('', 'versand@amazon.de')).toBe('Amazon');
  });
});
