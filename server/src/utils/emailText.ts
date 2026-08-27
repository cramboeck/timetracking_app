/**
 * E-Mail-Text-Aufbereitung für Tickets.
 *
 * Zwei Aufgaben:
 * 1. htmlToText(): HTML-Mails sauber in Klartext wandeln — Block-Elemente
 *    werden zu Zeilenumbrüchen, HTML-Entities (&nbsp;, &auml;, &#123;)
 *    werden dekodiert. Der alte Ansatz (nur Tags strippen) ließ die
 *    Entities als Klartext stehen und presste alles in eine Zeile.
 * 2. stripEmailSignature(): Signatur/Footer ab der Grußformel abschneiden
 *    (nur für die Ticket-BESCHREIBUNG — der E-Mail-Verlauf behält immer
 *    die vollständige Mail, es geht nichts verloren).
 */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  auml: 'ä', ouml: 'ö', uuml: 'ü',
  Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü',
  szlig: 'ß',
  eacute: 'é', egrave: 'è', agrave: 'à',
  euro: '€', copy: '©', reg: '®', trade: '™',
  hellip: '…', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => {
      const n = parseInt(code, 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
      const n = parseInt(code, 16);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    })
    .replace(/&([a-zA-Z]+);/g, (match, name) => NAMED_ENTITIES[name] ?? match);
}

/** HTML-Mail → Klartext mit erhaltener Zeilenstruktur. */
export function htmlToText(html: string): string {
  let text = html
    // Unsichtbare Blöcke komplett entfernen
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Block-Enden und <br> → Zeilenumbruch, damit die Struktur erhalten bleibt
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table)>/gi, '\n')
    // Restliche Tags strippen
    .replace(/<[^>]*>/g, ' ');

  text = decodeEntities(text);

  // Whitespace normalisieren: Spaces pro Zeile zusammenfassen,
  // Leerzeilen auf maximal eine reduzieren
  return text
    .split('\n')
    .map(line => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Grußformeln — ab hier beginnt in aller Regel die Signatur
const SIGNATURE_LINE_MARKERS: RegExp[] = [
  /^--\s*$/, // RFC-3676-Trenner
  /^mit\s+(freundlichen|besten|freundlichem|kollegialen)\s+gr(ü|ue)(ß|ss)/i,
  /^freundliche\s+gr(ü|ue)(ß|ss)e/i,
  /^(viele|beste|liebe|sch(ö|oe)ne|herzliche|sonnige)\s+gr(ü|ue)(ß|ss)e/i,
  /^gru(ß|ss)\s*[,!]?\s*$/i,
  /^(kind|best|warm)\s+regards/i,
  /^regards\s*[,!]?\s*$/i,
  /^(mfg|vg|lg|bg)\s*[.,!]?\s*$/i,
];

// Firmen-Footer-Muster — Fallback, falls keine Grußformel gefunden wird
// (z.B. Weiterleitungen, bei denen nur der Rechtsblock übrig ist)
const FOOTER_LINE_MARKERS: RegExp[] = [
  /^(rechtsform|registergericht|zust(ä|ae)ndiges\s+registergericht|handelsregister(nummer)?|amtsgericht|sitz\s+der\s+gesellschaft|gesch(ä|ae)ftsf(ü|ue)hrer(in)?|ust[.\s-]?id)\s*[:\s]/i,
  /^diese\s+e-?mail\s+(enth(ä|ae)lt|und\s+alle\s+anh(ä|ae)nge)/i,
  /^this\s+e-?mail\s+(contains|and\s+any\s+attachments)/i,
];

// Unterhalb dieser Position wird nie geschnitten — verhindert, dass Mails,
// die praktisch nur aus einer Grußformel bestehen, leer werden
const MIN_KEEP_CHARS = 40;

/**
 * Schneidet Signatur/Footer ab der ersten erkannten Grußformel ab.
 * Liefert den ungekürzten Text zurück, wenn kein Marker gefunden wird
 * oder der Schnitt zu früh läge.
 */
export function stripEmailSignature(text: string): string {
  const lines = text.split('\n');
  let offset = 0;
  let cutAt = -1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (offset >= MIN_KEEP_CHARS && trimmed.length > 0) {
      if (SIGNATURE_LINE_MARKERS.some(re => re.test(trimmed))) {
        cutAt = offset;
        break;
      }
      if (cutAt === -1 && FOOTER_LINE_MARKERS.some(re => re.test(trimmed))) {
        cutAt = offset;
        break;
      }
    }
    offset += line.length + 1; // + Zeilenumbruch
  }

  // Fallback für Fließtext ohne Zeilenumbrüche (z.B. alte Plaintext-Mails):
  // nach der starken Grußformel inline suchen
  if (cutAt === -1 && !text.includes('\n')) {
    const inline = text.search(/\bmit\s+(freundlichen|besten|freundlichem)\s+gr(ü|ue)(ß|ss)/i);
    if (inline >= MIN_KEEP_CHARS) cutAt = inline;
  }

  if (cutAt === -1) return text;
  return text.slice(0, cutAt).trim();
}

/** Kombi-Helfer: E-Mail-Body → Ticket-Beschreibung (Klartext, ohne Signatur). */
export function emailBodyToTicketDescription(content: string, contentType: string): string {
  const text = contentType === 'html' ? htmlToText(content) : content.trim();
  return stripEmailSignature(text);
}
