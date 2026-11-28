import crypto from 'crypto';
import { z } from 'zod';

/**
 * Anrufliste (iPhone-Screenshot) → CRM-Interaktionen: reine Hilfsfunktionen
 * ohne DB, damit sie sich direkt testen lassen.
 *
 * Die iPhone-Liste „Zuletzt“ zeigt je Zeile: Name ODER Nummer, darunter die
 * Art („Mobil“, „FaceTime Audio“), rechts das Datum — heute als Uhrzeit,
 * gestern als „Gestern“, in der letzten Woche als Wochentag, älter als Datum.
 * Rote Zeilen = verpasst, ein kleines Hörer-Symbol = ausgehend.
 */

// ---------------------------------------------------------------------------
// Telefonnummern
// ---------------------------------------------------------------------------

/** Nummer in vergleichbare nationale Form: „+49 171 12-34“ → „0171 1234“ ohne Leerzeichen. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  const plus = s.startsWith('+');
  s = s.replace(/[^\d]/g, '');
  if (!s) return null;
  if (plus) s = s.startsWith('49') ? `0${s.slice(2)}` : `00${s}`;
  else if (s.startsWith('0049')) s = `0${s.slice(4)}`;
  return s.length >= 5 ? s : null;
}

/** Gleiche Nummer? Exakt oder (bei langen Nummern) gleiche letzte 8 Ziffern. */
export function samePhone(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 9 && b.length >= 9) return a.slice(-8) === b.slice(-8);
  return false;
}

/** Sieht der Text wie eine Telefonnummer aus (statt wie ein Name)? */
export function looksLikePhone(text: string | null | undefined): boolean {
  if (!text) return false;
  const digits = text.replace(/[^\d]/g, '');
  return digits.length >= 5 && /^[\d\s+()/.-]+$/.test(text.trim());
}

// ---------------------------------------------------------------------------
// Datum aus der Liste
// ---------------------------------------------------------------------------

const WEEKDAYS: Record<string, number> = {
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6,
  so: 0, mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

const ymd = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

/**
 * Datumsangabe der Liste auf ein Kalenderdatum (YYYY-MM-DD) + Uhrzeit (HH:MM)
 * abbilden. `today` ist der Kalendertag des Hochladenden (YYYY-MM-DD).
 * Wochentage meinen immer den zurückliegenden (nie heute, nie Zukunft).
 */
export function resolveCallWhen(when: string | null | undefined, today: string): { date: string | null; time: string | null } {
  const raw = (when || '').trim().toLowerCase().replace(/\.$/, '');
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return { date: null, time: null };
  const base = new Date(`${today}T12:00:00Z`);
  const shift = (days: number) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() - days); return ymd(d); };

  const timeMatch = raw.match(/(\d{1,2})[:.](\d{2})(?:\s*(am|pm))?/);
  let time: string | null = null;
  if (timeMatch && !/^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(raw)) {
    let h = Number(timeMatch[1]);
    const m = Number(timeMatch[2]);
    if (timeMatch[3] === 'pm' && h < 12) h += 12;
    if (timeMatch[3] === 'am' && h === 12) h = 0;
    if (h <= 23 && m <= 59) time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  if (/^(heute|today)/.test(raw) || (time && /^\d{1,2}[:.]\d{2}(\s*(am|pm))?$/.test(raw))) return { date: today, time };
  if (/^(gestern|yesterday)/.test(raw)) return { date: shift(1), time };
  if (/^(vorgestern)/.test(raw)) return { date: shift(2), time };

  const wd = raw.match(/^([a-zäöü]+)/);
  if (wd && WEEKDAYS[wd[1]] !== undefined) {
    const diff = (base.getUTCDay() - WEEKDAYS[wd[1]] + 7) % 7 || 7;
    return { date: shift(diff), time };
  }

  const dm = raw.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (dm) {
    const d = Number(dm[1]); const mo = Number(dm[2]);
    let y = Number(dm[3]); if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return { date: iso > today ? null : iso, time };
    }
  }
  const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return { date: isoMatch[0] > today ? null : isoMatch[0], time };
  return { date: null, time };
}

// ---------------------------------------------------------------------------
// KI-Antwort (tolerant)
// ---------------------------------------------------------------------------

const toDirection = z.preprocess(v => {
  const s = String(v ?? '').toLowerCase();
  if (/miss|verpasst|entgangen/.test(s)) return 'missed';
  if (/out|ausgehend|abgehend/.test(s)) return 'outbound';
  return 'inbound';
}, z.enum(['inbound', 'outbound', 'missed']));

const nullableText = z.preprocess(v => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim().slice(0, 200)), z.string().nullable());

export const aiCallSchema = z.object({
  name: nullableText,
  number: nullableText,
  label: nullableText,
  when: nullableText,
  direction: toDirection,
  count: z.preprocess(v => { const n = Number(v); return Number.isFinite(n) && n >= 1 ? Math.min(Math.round(n), 99) : 1; }, z.number()),
});
export type AiCall = z.infer<typeof aiCallSchema>;

/** KI-Text → Anrufe. Unbrauchbare Zeilen fallen einzeln raus, nie die ganze Antwort. */
export function parseAiCalls(text: string): { isCallList: boolean; calls: AiCall[] } {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { isCallList: false, calls: [] };
  let data: unknown;
  try { data = JSON.parse(m[0]); } catch { return { isCallList: false, calls: [] }; }
  const obj = (data ?? {}) as { calls?: unknown; isCallList?: unknown };
  const list = Array.isArray(obj.calls) ? obj.calls : [];
  const calls: AiCall[] = [];
  for (const row of list.slice(0, 100)) {
    const parsed = aiCallSchema.safeParse(row);
    if (!parsed.success) continue;
    const c = parsed.data;
    // Name, der eigentlich eine Nummer ist
    if (c.name && !c.number && looksLikePhone(c.name)) { c.number = c.name; c.name = null; }
    if (!c.name && !c.number) continue;
    calls.push(c);
  }
  return { isCallList: obj.isCallList !== false || calls.length > 0, calls };
}

// ---------------------------------------------------------------------------
// Zuordnung
// ---------------------------------------------------------------------------

export interface DirectoryContact {
  contactId: string;
  customerId: string;
  name: string;
  phones: string[]; // normalisiert
}
export interface DirectoryCustomer {
  customerId: string;
  name: string;
  displayName: string | null;
  phones: string[]; // normalisiert
}
export interface CallMatch {
  customerId: string | null;
  contactId: string | null;
  method: 'phone_contact' | 'phone_customer' | 'name_contact' | 'name_customer' | null;
  /** weitere passende Kunden (bei Mehrdeutigkeit wird NICHT automatisch gewählt) */
  candidates: string[];
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ß ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Anruf einem Kunden/Kontakt zuordnen — nur eindeutige Treffer werden gesetzt. */
export function matchCall(call: { name: string | null; number: string | null }, contacts: DirectoryContact[], customers: DirectoryCustomer[]): CallMatch {
  const phone = normalizePhone(call.number);
  const empty: CallMatch = { customerId: null, contactId: null, method: null, candidates: [] };
  const uniq = (ids: string[]) => [...new Set(ids)];

  if (phone) {
    const byContact = contacts.filter(c => c.phones.some(p => samePhone(p, phone)));
    const custIds = uniq(byContact.map(c => c.customerId));
    if (custIds.length === 1) return { customerId: custIds[0], contactId: byContact.length === 1 ? byContact[0].contactId : null, method: 'phone_contact', candidates: [] };
    if (custIds.length > 1) return { ...empty, candidates: custIds };
    const byCustomer = customers.filter(c => c.phones.some(p => samePhone(p, phone)));
    if (byCustomer.length === 1) return { customerId: byCustomer[0].customerId, contactId: null, method: 'phone_customer', candidates: [] };
    if (byCustomer.length > 1) return { ...empty, candidates: byCustomer.map(c => c.customerId) };
  }

  const name = call.name ? norm(call.name) : '';
  if (name.length >= 3) {
    const byContact = contacts.filter(c => { const n = norm(c.name); return n.length >= 3 && (n === name || name.includes(n) || n.includes(name)); });
    const custIds = uniq(byContact.map(c => c.customerId));
    if (custIds.length === 1) return { customerId: custIds[0], contactId: byContact.length === 1 ? byContact[0].contactId : null, method: 'name_contact', candidates: [] };
    if (custIds.length > 1) return { ...empty, candidates: custIds };
    const byCustomer = customers.filter(c => [c.name, c.displayName].filter(Boolean).some(x => {
      const n = norm(String(x));
      return n.length >= 3 && (n === name || name.includes(n) || n.includes(name));
    }));
    if (byCustomer.length === 1) return { customerId: byCustomer[0].customerId, contactId: null, method: 'name_customer', candidates: [] };
    if (byCustomer.length > 1) return { ...empty, candidates: byCustomer.map(c => c.customerId) };
  }
  return empty;
}

/** Schlüssel gegen doppeltes Übernehmen (gleicher Anruf aus überlappendem Screenshot). */
export function callExternalId(call: { name: string | null; number: string | null }, date: string | null, time: string | null): string {
  const who = normalizePhone(call.number) ?? norm(call.name ?? '');
  return crypto.createHash('sha256').update(`${who}|${date ?? '-'}|${time ?? '-'}`).digest('hex').slice(0, 32);
}
