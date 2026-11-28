import { describe, it, expect } from 'vitest';
import { normalizePhone, samePhone, resolveCallWhen, parseAiCalls, matchCall, callExternalId } from '../src/utils/callLog';

describe('normalizePhone', () => {
  it('bringt internationale und nationale Schreibweisen zusammen', () => {
    expect(normalizePhone('+49 171 1234567')).toBe('01711234567');
    expect(normalizePhone('0049 (171) 123-4567')).toBe('01711234567');
    expect(normalizePhone('0171/1234567')).toBe('01711234567');
    expect(normalizePhone('+43 664 1234567')).toBe('00436641234567');
  });
  it('verwirft Kurzes und Leeres', () => {
    expect(normalizePhone('112')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
  it('vergleicht lange Nummern über die letzten 8 Ziffern', () => {
    expect(samePhone('08031123456', '08031123456')).toBe(true);
    expect(samePhone('0049803112345678', '0803112345678')).toBe(true);
    expect(samePhone('01711234567', '01711234568')).toBe(false);
  });
});

describe('resolveCallWhen (Upload am Freitag, 27.11.2026)', () => {
  const today = '2026-11-27';
  it('Uhrzeit = heute', () => expect(resolveCallWhen('10:42', today)).toEqual({ date: today, time: '10:42' }));
  it('Gestern', () => expect(resolveCallWhen('Gestern', today)).toEqual({ date: '2026-11-26', time: null }));
  it('Wochentag = zurückliegender Tag', () => {
    expect(resolveCallWhen('Montag', today).date).toBe('2026-11-23');
    expect(resolveCallWhen('Freitag', today).date).toBe('2026-11-20'); // nie heute
    expect(resolveCallWhen('Sa.', today).date).toBe('2026-11-21');
  });
  it('Datum zweistellig/vierstellig, Zukunft wird verworfen', () => {
    expect(resolveCallWhen('21.11.26', today)).toEqual({ date: '2026-11-21', time: null });
    expect(resolveCallWhen('03.10.2026', today).date).toBe('2026-10-03');
    expect(resolveCallWhen('03.12.26', today).date).toBeNull();
  });
  it('englische Anzeige mit AM/PM', () => {
    expect(resolveCallWhen('3:05 PM', today)).toEqual({ date: today, time: '15:05' });
    expect(resolveCallWhen('Yesterday', today).date).toBe('2026-11-26');
  });
  it('Unbekanntes → kein Datum', () => expect(resolveCallWhen('irgendwann', today).date).toBeNull());
});

describe('parseAiCalls', () => {
  it('ist tolerant gegenüber Formaten und verwirft nur kaputte Zeilen', () => {
    const r = parseAiCalls('Hier: {"isCallList": true, "calls": [' +
      '{"name": "Hans Maier", "number": null, "when": "10:42", "direction": "Ausgehend", "count": "2"},' +
      '{"name": "+49 8031 12345", "when": "Gestern", "direction": "verpasst"},' +
      '{"name": "", "number": ""},' +
      '{"name": "Huber GmbH", "when": "Montag", "direction": "inbound", "count": 0}]}');
    expect(r.isCallList).toBe(true);
    expect(r.calls).toHaveLength(3);
    expect(r.calls[0]).toMatchObject({ name: 'Hans Maier', direction: 'outbound', count: 2 });
    expect(r.calls[1]).toMatchObject({ name: null, number: '+49 8031 12345', direction: 'missed' });
    expect(r.calls[2].count).toBe(1);
  });
  it('Keine Anrufliste / kein JSON', () => {
    expect(parseAiCalls('{"isCallList": false, "calls": []}').isCallList).toBe(false);
    expect(parseAiCalls('Das ist kein JSON').calls).toEqual([]);
  });
});

describe('matchCall', () => {
  const contacts = [
    { contactId: 'k1', customerId: 'huber', name: 'Hans Maier', phones: ['01711234567'] },
    { contactId: 'k2', customerId: 'mair', name: 'Eva Mair', phones: ['08031999000'] },
    { contactId: 'k3', customerId: 'huber', name: 'Eva Schmidt', phones: [] },
  ];
  const customers = [
    { customerId: 'huber', name: 'Huber Elektro GmbH', displayName: 'Huber', phones: ['0803112345'] },
    { customerId: 'mair', name: 'Mair Steuerkanzlei', displayName: null, phones: [] },
  ];
  it('Nummer → Kontakt', () => expect(matchCall({ name: null, number: '+49 171 1234567' }, contacts, customers)).toMatchObject({ customerId: 'huber', contactId: 'k1', method: 'phone_contact' }));
  it('Nummer → Firmennummer des Kunden', () => expect(matchCall({ name: null, number: '08031 12345' }, contacts, customers)).toMatchObject({ customerId: 'huber', contactId: null, method: 'phone_customer' }));
  it('Name → Kontakt', () => expect(matchCall({ name: 'Eva Mair', number: null }, contacts, customers)).toMatchObject({ customerId: 'mair', contactId: 'k2' }));
  it('Name → Kunde', () => expect(matchCall({ name: 'Huber Elektro', number: null }, contacts, customers)).toMatchObject({ customerId: 'huber', method: 'name_customer' }));
  it('Mehrdeutig → keine Auswahl, Kandidaten', () => {
    const m = matchCall({ name: 'Eva', number: null }, contacts, customers);
    expect(m.customerId).toBeNull();
    expect(m.candidates.sort()).toEqual(['huber', 'mair']);
  });
  it('Unbekannt → nichts', () => expect(matchCall({ name: 'Pizza Express', number: '0911 77777' }, contacts, customers).customerId).toBeNull());
});

describe('callExternalId', () => {
  it('gleicher Anruf aus zwei Screenshots → gleicher Schlüssel, egal wie die Nummer geschrieben ist', () => {
    expect(callExternalId({ name: null, number: '+49 171 1234567' }, '2026-11-26', null))
      .toBe(callExternalId({ name: 'Hans', number: '0171 1234567' }, '2026-11-26', null));
    expect(callExternalId({ name: null, number: '0171 1234567' }, '2026-11-26', null))
      .not.toBe(callExternalId({ name: null, number: '0171 1234567' }, '2026-11-25', null));
  });
});
