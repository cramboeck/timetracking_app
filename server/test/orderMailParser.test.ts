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

// --- v2 ---------------------------------------------------------------------
import {
  cleanSubject, unwrapForwarded, normalizeOrderNumber, extractOrderNumbers, supplierKey,
  cleanSupplierName, isMarketingMail, isCancellationMail, cleanOrderLines,
} from '../src/utils/orderMailParser';

describe('Weiterleitungen', () => {
  it('Outlook deutsch', () => {
    const r = unwrapForwarded('WG: Ihre Auftragsbestätigung 4711', 'Christoph', 'c@ramboeck.it',
      'Bitte ablegen\n\nVon: Bechtle Bestellannahme <orders@bechtle.com>\nGesendet: Freitag, 27. November 2026 10:12\nAn: Christoph <c@ramboeck.it>\nBetreff: Ihre Auftragsbestätigung 4711\n\nSehr geehrter Kunde,\nAuftragsnummer: 4711');
    expect(r).toMatchObject({ forwarded: true, fromEmail: 'orders@bechtle.com', fromName: 'Bechtle Bestellannahme', subject: 'Ihre Auftragsbestätigung 4711' });
    expect(r.text.startsWith('Sehr geehrter Kunde')).toBe(true);
  });
  it('Gmail englisch', () => {
    const r = unwrapForwarded('Fwd: Your order', 'X', 'x@ramboeck.it',
      '---------- Forwarded message ---------\nFrom: Amazon.de <bestellbestaetigung@amazon.de>\nDate: Fri, Nov 27, 2026\nSubject: Ihre Amazon.de Bestellung 302-1234567-1234567\nTo: <x@ramboeck.it>\n\nBestellnummer 302-1234567-1234567');
    expect(r).toMatchObject({ forwarded: true, fromEmail: 'bestellbestaetigung@amazon.de', subject: 'Ihre Amazon.de Bestellung 302-1234567-1234567' });
  });
  it('normale Mail bleibt unverändert, Betreff ohne Präfix', () => {
    const r = unwrapForwarded('AW: Bestellung 5', 'Shop', 'shop@x.de', 'Von: uns geliefert …');
    expect(r).toMatchObject({ forwarded: false, subject: 'Bestellung 5', fromEmail: 'shop@x.de' });
  });
  it('cleanSubject', () => expect(cleanSubject('AW: WG: Fwd: Test')).toBe('Test'));
});

describe('Nummern + Lieferant', () => {
  it('sammelt mehrere Nummern', () => {
    expect(extractOrderNumbers('Auftragsbestätigung 88123', 'Ihre Bestellnummer: PO-2026-11\nAuftragsnummer: 88123\nBelegnummer: AB-55501'))
      .toEqual(expect.arrayContaining(['88123', 'PO-2026-11', 'AB-55501']));
  });
  it('Lieferscheinnummer zählt mit', () => expect(extractOrderNumbers('Lieferschein LS-7001', '')).toEqual(['LS-7001']));
  it('normalisiert', () => expect(normalizeOrderNumber('302-1234567 1234567')).toBe('30212345671234567'));
  it('supplierKey', () => {
    expect(supplierKey('orders@mail.bechtle.com')).toBe('bechtle.com');
    expect(supplierKey('x@shop.example.co.uk')).toBe('example.co.uk');
  });
  it('generische Absendernamen zählen nicht', () => {
    expect(cleanSupplierName('Kundenservice')).toBeNull();
    expect(cleanSupplierName('Bechtle Bestellannahme')).toBe('Bechtle Bestellannahme');
    expect(cleanSupplierName('Reichelt | Kundenservice')).toBe('Reichelt');
    expect(cleanSupplierName('orders@x.de')).toBeNull();
  });
});

describe('Werbung, Storno, Positionen', () => {
  it('Newsletter ist Werbung, Bestätigung nicht', () => {
    expect(isMarketingMail('Black Friday: 20 % auf alles', 'Jetzt bestellen … Abmelden')).toBe(true);
    expect(isMarketingMail('Neu im Sortiment', 'Ihre Bestellung ganz einfach … Newsletter abbestellen')).toBe(true);
    expect(isMarketingMail('Ihre Bestellung 4711', 'Bestellbestätigung … Abmelden')).toBe(false);
    expect(isMarketingMail('Bewerten Sie Ihre Bestellung 302-1234567-1234567', '')).toBe(true);
    // echte Bestätigung mit Newsletter-Fußzeile ist KEINE Werbung
    expect(isMarketingMail('Danke für Ihren Einkauf', 'Bestellnummer: 4711-88\n… Newsletter abbestellen')).toBe(false);
    expect(isMarketingMail('Ihre Bestellung wurde bestätigt', 'Newsletter abbestellen')).toBe(false);
  });
  it('Storno', () => expect(isCancellationMail('Ihre Bestellung wurde storniert')).toBe(true));
  it('Positionen bereinigen', () => {
    const r = cleanOrderLines([
      { description: 'Lenovo ThinkPad T14', quantity: 2, unitPrice: 999 },
      { description: 'Versandkosten', quantity: 1, totalPrice: 9.9 },
      { description: 'Rabatt Aktion', totalPrice: -50 },
      { description: 'USB-C Kabel', quantity: null, totalPrice: 12 },
      { description: 'Lenovo ThinkPad T14', quantity: 1, unitPrice: 999 },
    ]);
    expect(r).toEqual([
      { description: 'Lenovo ThinkPad T14', articleNumber: null, quantity: 3, unitPrice: 999, totalPrice: 2997 },
      { description: 'USB-C Kabel', articleNumber: null, quantity: 1, unitPrice: 12, totalPrice: 12 },
    ]);
  });
});
