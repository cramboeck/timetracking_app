/**
 * WE-1: Deterministische Auswertung von Bestell-Mails (ohne KI).
 * Funktioniert für jeden Shop/Distributor, solange die Mail die üblichen
 * Begriffe enthält. Die KI-Anreicherung (Positionen, Beträge) kommt im
 * purchaseOrderService obendrauf — diese Regeln bleiben die verlässliche Basis.
 */

export type OrderMailKind = 'order_confirmation' | 'shipping' | 'invoice' | 'other';

const SHIPPING = /(versand(?:best[äa]tigung|mitteilung|benachrichtigung)?|versendet|verschickt|ist unterwegs|auf dem weg|lieferavis|sendungsverfolgung|sendungsnummer|tracking|shipped|shipping confirmation|has shipped|out for delivery|zustellung)/i;
const INVOICE_SUBJECT = /(\brechnung\b|\brechnungs-?nr|\binvoice\b|\bgutschrift\b|credit note)/i;
const ORDER = /(bestellbest[äa]tigung|auftragsbest[äa]tigung|bestellung|bestelleingang|order confirmation|order received|your order|ihre bestellung|ihr auftrag|purchase order|\border\b)/i;

/** Art der Mail — der Betreff zählt mehr als der Text (dort steht oft „Rechnungsadresse“). */
export function classifyOrderMail(subject: string, text: string): OrderMailKind {
  const s = subject || '';
  if (SHIPPING.test(s)) return 'shipping';
  if (INVOICE_SUBJECT.test(s) && !/best[äa]tigung|confirmation/i.test(s)) return 'invoice';
  if (ORDER.test(s)) return 'order_confirmation';
  const t = (text || '').slice(0, 4000);
  if (/rechnungs-?nummer|invoice number/i.test(t) && /f[äa]llig|zahlbar|payment due|zahlungsziel/i.test(t)) return 'invoice';
  if (/sendungsnummer|tracking.?(?:nummer|number|link)|paketnummer/i.test(t)) return 'shipping';
  if (ORDER.test(t)) return 'order_confirmation';
  return 'other';
}

/** Ticketnummern (TKT-000123) aus Betreff + Text. */
export function extractTicketNumbers(...texts: string[]): string[] {
  const found = new Set<string>();
  for (const t of texts) {
    for (const m of (t || '').matchAll(/\bTKT-?(\d{6})\b/gi)) found.add(`TKT-${m[1]}`);
  }
  return [...found];
}

const REFERENCE_LABEL = /(?:ihre\s+referenz|bestell-?referenz|referenz|kommission|kostenstelle|po[- ]?(?:nummer|number|nr\.?)|your reference|customer reference|reference)\s*[:：#]\s*([^\n\r]{1,80})/i;

/** Freitext-Referenz/Kommission, wie beim Bestellen eingegeben. */
export function extractReference(text: string): string | null {
  const m = (text || '').match(REFERENCE_LABEL);
  return m ? m[1].trim().replace(/\s{2,}/g, ' ').slice(0, 80) : null;
}

/** Eigenbedarf: „INTERN“ als Referenz/Kommission oder im Betreff. */
export function isInternalReference(subject: string, reference: string | null): boolean {
  return /\bINTERN\b/.test(reference ?? '') || /\[INTERN\]|\bINTERN\b/.test(subject || '');
}

const ORDER_NUMBER = /(?:bestell(?:ung)?s?-?(?:nr\.?|nummer)|auftrags?-?(?:nr\.?|nummer)|order\s*(?:no\.?|number|nr\.?|#|id)|bestellung\s*(?:nr\.?|#)?|auftrag\s*(?:nr\.?|#)?)\s*[:#.]?\s*([A-Z0-9][A-Z0-9\-\/_.]{3,40})/i;

/** Bestellnummer — muss eine Ziffer enthalten und darf keine Ticketnummer sein. */
export function extractOrderNumber(subject: string, text: string): string | null {
  for (const source of [subject || '', (text || '').slice(0, 6000)]) {
    const re = new RegExp(ORDER_NUMBER.source, 'gi');
    for (const m of source.matchAll(re)) {
      const candidate = m[1].replace(/[.\-_/]+$/, '');
      if (!/\d/.test(candidate)) continue;
      if (/^TKT-?\d{6}$/i.test(candidate)) continue;
      return candidate;
    }
  }
  return null;
}

export interface TrackingInfo {
  carrier: string | null;
  number: string;
  url: string | null;
}

const CARRIER_HOSTS: [RegExp, string][] = [
  [/dhl\./i, 'DHL'], [/ups\.com/i, 'UPS'], [/dpd\./i, 'DPD'], [/gls-?(?:pakete|group)?\./i, 'GLS'],
  [/hermes(?:world|-?paket)?\./i, 'Hermes'], [/fedex\./i, 'FedEx'], [/tnt\./i, 'TNT'], [/amazon\./i, 'Amazon'],
];

const carrierFromText = (s: string): string | null => {
  for (const [re, name] of CARRIER_HOSTS) if (re.test(s)) return name;
  const m = s.match(/\b(DHL|UPS|DPD|GLS|Hermes|FedEx|TNT)\b/i);
  return m ? m[1].toUpperCase() === 'HERMES' ? 'Hermes' : m[1].toUpperCase() === 'FEDEX' ? 'FedEx' : m[1].toUpperCase() : null;
};

/** Sendungsnummern aus „Sendungsnummer: …“ und aus Tracking-Links. */
export function extractTracking(text: string): TrackingInfo[] {
  const t = text || '';
  const out = new Map<string, TrackingInfo>();
  for (const m of t.matchAll(/https?:\/\/[^\s<>"')]+/g)) {
    const url = m[0];
    const carrier = carrierFromText(url);
    if (!carrier) continue;
    const num = url.match(/(?:piececode|idc|tracknum|tracknumbers|trackingnumber|parcelno|parcelnumber|match|tracking_?id|tracking)=([A-Z0-9]{8,35})/i)
      || url.match(/\/(?:track|tracking|sendung|parcel)[^?]*\/([A-Z0-9]{8,35})(?:[/?#]|$)/i);
    if (num) out.set(num[1].toUpperCase(), { carrier, number: num[1].toUpperCase(), url });
  }
  for (const m of t.matchAll(/(?:sendungs-?nummer|tracking-?(?:nummer|number|nr\.?|id)|paket-?nummer|sendungs-?nr\.?)\s*[:#]?\s*([A-Z0-9]{8,35})/gi)) {
    const number = m[1].toUpperCase();
    if (!/\d/.test(number) || out.has(number)) continue;
    const around = t.slice(Math.max(0, (m.index ?? 0) - 120), (m.index ?? 0) + 120);
    out.set(number, { carrier: carrierFromText(around), number, url: null });
  }
  return [...out.values()].slice(0, 10);
}

/** Lieferanten-Name: Absendername, sonst die Domain ohne TLD. */
export function supplierFromSender(name: string | null | undefined, email: string | null | undefined): string | null {
  const n = (name || '').replace(/["']/g, '').trim();
  if (n && !/^(no-?reply|noreply|info|service|shop|order|orders|versand|bestellung)$/i.test(n)) return n.slice(0, 120);
  const domain = (email || '').split('@')[1] || '';
  const base = domain.replace(/^(mail|email|e|info|news|service|shop)\./i, '').split('.').slice(-2, -1)[0];
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : null;
}
