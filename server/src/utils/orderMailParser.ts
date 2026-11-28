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

// ---------------------------------------------------------------------------
// v2 (28.11.2026): Weiterleitungen, mehrere Nummern, Lieferant, Werbung, Positionen
// ---------------------------------------------------------------------------

/** „AW: WG: Fwd: …“ vom Betreff entfernen. */
export function cleanSubject(subject: string): string {
  let s = (subject || '').trim();
  for (let i = 0; i < 5; i++) {
    const next = s.replace(/^\s*(?:re|aw|wg|fw|fwd|wtr|tr)\s*:\s*/i, '');
    if (next === s) break;
    s = next;
  }
  return s.trim();
}

export interface UnwrappedMail {
  forwarded: boolean;
  subject: string;
  fromName: string | null;
  fromEmail: string | null;
  text: string;
}

const EMAIL_RE = /[\w.+'-]+@[\w-]+(?:\.[\w-]+)+/;

/**
 * Weitergeleitete Mail auspacken: Wer Bestellmails an das Bestell-Postfach
 * WEITERLEITET, ist sonst selbst der „Lieferant“. Erkennt die Kopfblöcke von
 * Outlook (Von:/Gesendet:/An:/Betreff:, From:/Sent:/To:/Subject:), Gmail
 * („Forwarded message“) und Apple Mail („Anfang der weitergeleiteten Nachricht“).
 */
export function unwrapForwarded(subject: string, fromName: string | null, fromEmail: string | null, text: string): UnwrappedMail {
  const t = text || '';
  const plain: UnwrappedMail = { forwarded: false, subject: cleanSubject(subject), fromName, fromEmail, text: t };
  const looksForwarded = /^\s*(?:wg|fw|fwd|wtr|tr)\s*:/i.test(subject || '')
    || /(weitergeleitete nachricht|forwarded message|original message|urspr[üu]ngliche nachricht)/i.test(t.slice(0, 4000));
  if (!looksForwarded) return plain;

  const lines = t.split(/\r?\n/);
  for (let i = 0; i < Math.min(lines.length, 200); i++) {
    const m = lines[i].match(/^\s*\**\s*(?:von|from)\s*:\**\s*(.+)$/i);
    if (!m) continue;
    // Betreff-Zeile muss in den nächsten Zeilen folgen (sonst nur ein „Von:“ im Fließtext)
    let subj: string | null = null;
    let end = i;
    for (let j = i + 1; j < Math.min(lines.length, i + 9); j++) {
      const sm = lines[j].match(/^\s*\**\s*(?:betreff|subject)\s*:\**\s*(.*)$/i);
      if (sm) { subj = sm[1].trim(); end = j; break; }
    }
    if (subj === null) continue;
    // weitere Kopfzeilen (An/Cc/Datum) nach dem Betreff überspringen
    while (end + 1 < lines.length && /^\s*\**\s*(?:an|to|cc|bcc|datum|date|gesendet|sent)\s*:/i.test(lines[end + 1])) end++;
    const fromRaw = m[1].trim();
    const email = (fromRaw.match(EMAIL_RE) || [null])[0];
    const name = fromRaw.replace(/[<[(].*$/, '').replace(EMAIL_RE, '').replace(/["']/g, '').trim() || null;
    return {
      forwarded: true,
      subject: cleanSubject(subj || subject),
      fromName: name,
      fromEmail: email ? email.toLowerCase() : null,
      text: lines.slice(end + 1).join('\n').trim() || t,
    };
  }
  return plain;
}

/** Vergleichsschlüssel einer Bestellnummer: nur Buchstaben/Ziffern, groß. */
export function normalizeOrderNumber(n: string): string {
  return (n || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const ORDER_NUMBER_ALL = /(?:lieferschein-?(?:nr\.?|nummer)?|bestell(?:ung)?s?-?(?:nr\.?|nummer)|auftrags?-?(?:nr\.?|nummer)|beleg-?(?:nr\.?|nummer)|vorgangs-?(?:nr\.?|nummer)|kunden-?auftrags?-?(?:nr\.?|nummer)|order\s*(?:no\.?|number|nr\.?|#|id)|sales\s*order|bestellung\s*(?:nr\.?|#)?|auftrag\s*(?:nr\.?|#)?)\s*[:#.]?\s*([A-Z0-9][A-Z0-9\-\/_.]{3,40})/gi;

/** ALLE Bestell-/Auftragsnummern einer Mail (Lieferanten nennen oft mehrere). */
export function extractOrderNumbers(subject: string, text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const source of [subject || '', (text || '').slice(0, 12000)]) {
    for (const m of source.matchAll(new RegExp(ORDER_NUMBER_ALL.source, 'gi'))) {
      const c = m[1].replace(/[.\-_/]+$/, '');
      if (!/\d/.test(c) || /^TKT-?\d{6}$/i.test(c)) continue;
      const key = normalizeOrderNumber(c);
      if (key.length < 4 || seen.has(key)) continue;
      seen.add(key);
      out.push(c);
      if (out.length >= 6) return out;
    }
  }
  return out;
}

/** Registrierbare Domain des Absenders (Lieferanten-Schlüssel für das Zusammenführen). */
export function supplierKey(email: string | null | undefined): string | null {
  const domain = ((email || '').split('@')[1] || '').toLowerCase().trim();
  if (!domain) return null;
  const parts = domain.split('.');
  if (parts.length <= 2) return domain;
  const twoLevel = /^(co|com|org|net|ac|gv)\.[a-z]{2}$/.test(parts.slice(-2).join('.'));
  return parts.slice(twoLevel ? -3 : -2).join('.');
}

const GENERIC_SENDER = /^(?:no-?reply|noreply|do-?not-?reply|info|service|kundenservice|kundendienst|customer\s*service|support|team|shop|onlineshop|order|orders|order\s*desk|bestellung(?:en)?|bestellannahme|auftragsbearbeitung|auftragsabwicklung|versand|versandabteilung|logistik|vertrieb|verkauf|sales|buchhaltung|accounting|billing|rechnung(?:en)?|notifications?|benachrichtigung(?:en)?|newsletter|mailer|webshop|ihr\s+.*team)$/i;

/** Absendername bereinigen; generische Namen („Kundenservice“) zählen nicht. */
export function cleanSupplierName(name: string | null | undefined): string | null {
  let n = (name || '').replace(/["'“”]/g, '').trim();
  if (!n || EMAIL_RE.test(n)) return null;
  n = n.replace(/\s*(?:\||–|-|·)\s*(?:kundenservice|kundendienst|service|support|team|versand|bestellung(?:en)?|shop)\s*$/i, '').trim();
  n = n.replace(/^(?:kundenservice|kundendienst|service|team|ihr\s+team)\s+(?:von|der|des)?\s*/i, '').trim();
  n = n.replace(/\s+via\s+.*$/i, '').trim();
  if (!n || GENERIC_SENDER.test(n)) return null;
  return n.slice(0, 120);
}

/** Werbung/Newsletter/Bewertungsbitten — ohne Bestellnummer im Betreff nie ein Vorgang. */
export function isMarketingMail(subject: string, text: string): boolean {
  const s = subject || '';
  const t = (text || '').slice(0, 6000);
  if (/(bewerten sie|bewertung abgeben|wie zufrieden|umfrage|feedback zu ihrer|rate your|review your|newsletter|angebot der woche|deals? der woche|jetzt sparen|nur heute|black friday|cyber monday|gutscheincode|rabattcode|% rabatt|sale\b)/i.test(s)) return true;
  // Bestellbezug im Betreff oder eine Bestellnummer im Text: keine Werbung — auch
  // echte Bestätigungen haben fast immer einen Abmelde-Link in der Fußzeile
  if (/(bestell|auftrag|order|versand|liefer|sendung|paket|rechnung|invoice|shipment|delivery)/i.test(s)) return false;
  if (extractOrderNumbers(s, text || '').length > 0) return false;
  return /(abmelden|abbestellen|unsubscribe|newsletter|im browser (?:ansehen|anzeigen)|view (?:it )?in (?:your )?browser)/i.test(t);
}

/** Storno/Rückerstattung — darf keinen neuen Vorgang anlegen. */
export function isCancellationMail(subject: string): boolean {
  return /(storniert|stornierung|storno|cancell?ed|cancellation|r[üu]ckerstattung|erstattung|refund|widerruf)/i.test(subject || '');
}

export interface OrderLineInput {
  description: string;
  articleNumber?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  totalPrice?: number | null;
}

const NON_ITEM_LINE = /^(?:versand(?:kosten|pauschale)?|fracht(?:kosten)?|porto|verpackung|transport(?:kosten)?|liefer(?:ung|kosten|pauschale)|zuschlag|mindermengen\w*|maut\w*|energie\w*zuschlag|rabatt|nachlass|skonto|gutschein|coupon|discount|shipping|handling|freight|summe|zwischensumme|gesamt(?:summe|betrag)?|total|subtotal|netto|brutto|mwst\.?|ust\.?|umsatzsteuer|vat)\b/i;

/** KI-Positionen aufräumen: Versand/Rabatt/Summenzeilen raus, Mengen/Preise ergänzen, Dubletten zusammenfassen. */
export function cleanOrderLines(lines: OrderLineInput[]): OrderLineInput[] {
  const out: OrderLineInput[] = [];
  const seen = new Map<string, OrderLineInput>();
  for (const l of lines || []) {
    const description = (l.description || '').replace(/\s+/g, ' ').trim();
    if (description.length < 2 || NON_ITEM_LINE.test(description)) continue;
    let quantity = typeof l.quantity === 'number' && Number.isFinite(l.quantity) && l.quantity > 0 ? l.quantity : 1;
    if (quantity > 100000) quantity = 1;
    let unitPrice = typeof l.unitPrice === 'number' && Number.isFinite(l.unitPrice) ? l.unitPrice : null;
    let totalPrice = typeof l.totalPrice === 'number' && Number.isFinite(l.totalPrice) ? l.totalPrice : null;
    if (unitPrice === null && totalPrice !== null) unitPrice = Math.round((totalPrice / quantity) * 100) / 100;
    if (totalPrice === null && unitPrice !== null) totalPrice = Math.round(unitPrice * quantity * 100) / 100;
    if (totalPrice !== null && totalPrice < 0) continue; // Gutschrift-/Rabattzeile
    const articleNumber = l.articleNumber ? String(l.articleNumber).trim().slice(0, 80) || null : null;
    const key = `${(articleNumber || '').toUpperCase()}|${description.toLowerCase()}|${unitPrice ?? ''}`;
    const prev = seen.get(key);
    if (prev) {
      prev.quantity = (prev.quantity ?? 1) + quantity;
      if (prev.unitPrice != null) prev.totalPrice = Math.round(prev.unitPrice * (prev.quantity ?? 1) * 100) / 100;
      continue;
    }
    const line = { description: description.slice(0, 500), articleNumber, quantity, unitPrice, totalPrice };
    seen.set(key, line);
    out.push(line);
    if (out.length >= 60) break;
  }
  return out;
}
