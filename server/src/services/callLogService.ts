import crypto from 'crypto';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import { invoiceProcessorService } from './invoiceProcessorService';
import { isRetroactive, logRetroChange } from '../routes/entries';
import {
  AiCall, CallMatch, DirectoryContact, DirectoryCustomer,
  callExternalId, matchCall, normalizePhone, parseAiCalls, resolveCallWhen,
} from '../utils/callLog';

/**
 * Anrufliste → CRM: Screenshots der iPhone-Anrufliste werden per KI gelesen,
 * die Anrufe Kunden/Kontakten zugeordnet und — erst nach Freigabe durch den
 * Menschen — als Interaktionen (Typ „call“) samt optionalem Zeiteintrag
 * angelegt. Der Screenshot selbst wird nirgends gespeichert.
 */

export const EXTERNAL_SOURCE = 'call_log';

export class CallLogError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const PROMPT = `Das Bild ist ein Screenshot einer Smartphone-Anrufliste (meist iPhone „Zuletzt“).
Lies JEDE sichtbare Zeile von oben nach unten aus. Antworte NUR mit JSON:
{"isCallList": true|false, "calls": [{"name": "...", "number": "...", "label": "...", "when": "...", "direction": "inbound|outbound|missed", "count": 1}]}

Regeln:
- name: angezeigter Kontaktname. Steht statt eines Namens nur eine Telefonnummer da → name null, number = diese Nummer.
- number: nur wenn eine Nummer sichtbar ist, sonst null. Nichts erfinden.
- label: Zusatzzeile unter dem Namen (z.B. „Mobil“, „Privat“, „FaceTime Audio“, Ort), sonst null.
- when: Datum/Uhrzeit GENAU wie angezeigt (z.B. „10:42“, „Gestern“, „Montag“, „21.11.26“).
- direction: rot dargestellter Name = "missed"; kleines Telefonhörer-/Pfeil-Symbol vor der Zeile = "outbound"; sonst "inbound".
- count: Zahl in Klammern hinter dem Namen, z.B. „Huber (3)“ → 3, sonst 1.
- Ist das Bild keine Anrufliste: {"isCallList": false, "calls": []}.`;

export interface ExtractedCall {
  key: string;
  name: string | null;
  number: string | null;
  label: string | null;
  when: string | null;
  date: string | null;
  time: string | null;
  direction: 'inbound' | 'outbound' | 'missed';
  count: number;
  match: CallMatch;
  alreadyImported: boolean;
  /** Name des zugeordneten Ansprechpartners (Anzeige) */
  contactName: string | null;
  /** Standard-Projekt des zugeordneten Kunden (für die Zeitbuchung) */
  defaultProjectId: string | null;
}

async function loadDirectory(organizationId: string): Promise<{ contacts: DirectoryContact[]; customers: DirectoryCustomer[] }> {
  const [cc, cu] = await Promise.all([
    query(
      `SELECT cc.id, cc.customer_id, cc.first_name, cc.last_name, cc.phone, cc.mobile
         FROM customer_contacts cc
         JOIN customers c ON c.id = cc.customer_id AND c.deleted_at IS NULL
        WHERE c.organization_id = $1`,
      [organizationId]
    ),
    query(
      `SELECT id, name, display_name, phone FROM customers
        WHERE organization_id = $1 AND deleted_at IS NULL`,
      [organizationId]
    ),
  ]);
  const phones = (...vals: unknown[]) => vals.map(v => normalizePhone(v as string | null)).filter((p): p is string => !!p);
  return {
    contacts: cc.rows.map(r => ({
      contactId: String(r.id),
      customerId: String(r.customer_id),
      name: [r.first_name, r.last_name].filter(Boolean).join(' '),
      phones: phones(r.phone, r.mobile),
    })),
    customers: cu.rows.map(r => ({
      customerId: String(r.id),
      name: String(r.name),
      displayName: (r.display_name as string) ?? null,
      phones: phones(r.phone),
    })),
  };
}

/** Screenshots lesen + zuordnen. Schreibt nichts. */
export async function extractCalls(
  organizationId: string,
  images: Array<{ data: Buffer; mime: string }>,
  today: string
): Promise<{ calls: ExtractedCall[]; notCallList: number }> {
  const config = await invoiceProcessorService.getOrgAiConfig(organizationId);
  if (!config) throw new CallLogError('Der KI-Assistent ist nicht eingerichtet (Einstellungen → KI-Assistent).');

  const raw: AiCall[] = [];
  let notCallList = 0;
  for (const img of images) {
    let text: string;
    try {
      text = await invoiceProcessorService.callAIWithImages(config, PROMPT, [img], 3000);
    } catch (err) {
      logger.error('Anrufliste: KI-Aufruf fehlgeschlagen', err);
      throw new CallLogError('Die KI konnte den Screenshot nicht lesen. Bitte später noch einmal versuchen.', 502);
    }
    const parsed = parseAiCalls(text);
    if (!parsed.isCallList || parsed.calls.length === 0) notCallList++;
    raw.push(...parsed.calls);
  }

  const dir = await loadDirectory(organizationId);
  const seen = new Set<string>();
  const calls: ExtractedCall[] = [];
  for (const c of raw) {
    const { date, time } = resolveCallWhen(c.when, today);
    const key = callExternalId(c, date, time);
    if (seen.has(key)) continue; // gleiche Zeile in zwei überlappenden Screenshots
    seen.add(key);
    const match = matchCall(c, dir.contacts, dir.customers);
    const contactName = match.contactId ? dir.contacts.find(x => x.contactId === match.contactId)?.name ?? null : null;
    calls.push({ key, ...c, date, time, match, alreadyImported: false, contactName, defaultProjectId: null });
  }

  if (calls.length > 0) {
    const imported = await query(
      `SELECT external_id FROM customer_interactions
        WHERE organization_id = $1 AND external_source = $2 AND external_id = ANY($3)`,
      [organizationId, EXTERNAL_SOURCE, calls.map(c => c.key)]
    );
    const done = new Set(imported.rows.map(r => String(r.external_id)));
    for (const c of calls) c.alreadyImported = done.has(c.key);

    const custIds = [...new Set(calls.map(c => c.match.customerId).filter((x): x is string => !!x))];
    if (custIds.length > 0) {
      const proj = await defaultProjects(organizationId, custIds);
      for (const c of calls) c.defaultProjectId = c.match.customerId ? proj.get(c.match.customerId) ?? null : null;
    }
  }
  return { calls, notCallList };
}

/** Standard-Projekt je Kunde, sonst erstes aktives Projekt des Kunden. */
async function defaultProjects(organizationId: string, customerIds: string[]): Promise<Map<string, string>> {
  const r = await query(
    `SELECT c.id AS customer_id,
            COALESCE(
              (SELECT p.id FROM projects p WHERE p.id = c.default_project_id AND p.deleted_at IS NULL AND p.is_active = true),
              (SELECT p.id FROM projects p WHERE p.customer_id = c.id AND p.organization_id = $1
                  AND p.deleted_at IS NULL AND p.is_active = true ORDER BY p.created_at LIMIT 1)
            ) AS project_id
       FROM customers c WHERE c.organization_id = $1 AND c.id = ANY($2)`,
    [organizationId, customerIds]
  );
  return new Map(r.rows.filter(x => x.project_id).map(x => [String(x.customer_id), String(x.project_id)]));
}

export interface CommitCallInput {
  key: string;
  customerId: string;
  contactId?: string | null;
  direction: 'inbound' | 'outbound' | 'missed';
  occurredAt: string; // ISO mit Zeitzone (vom Gerät des Nutzers)
  subject?: string | null;
  content?: string | null;
  durationMinutes?: number | null;
  followUp?: boolean;
  followUpDate?: string | null;
  ticketId?: string | null;
  time?: { projectId: string; isBillable: boolean; description?: string | null } | null;
}

export interface CommitResult {
  created: Array<{ key: string; interactionId: string; timeEntryId: string | null }>;
  skipped: Array<{ key: string; reason: string }>;
}

/** Freigegebene Anrufe anlegen: Interaktion (+ Zeiteintrag). Idempotent pro Anruf. */
export async function commitCalls(organizationId: string, userId: string, items: CommitCallInput[]): Promise<CommitResult> {
  const result: CommitResult = { created: [], skipped: [] };

  const custIds = [...new Set(items.map(i => i.customerId))];
  const cust = await query(`SELECT id FROM customers WHERE organization_id = $1 AND deleted_at IS NULL AND id = ANY($2)`, [organizationId, custIds]);
  const validCustomers = new Set(cust.rows.map(r => String(r.id)));

  const existing = await query(
    `SELECT external_id FROM customer_interactions WHERE organization_id = $1 AND external_source = $2 AND external_id = ANY($3)`,
    [organizationId, EXTERNAL_SOURCE, items.map(i => i.key)]
  );
  const done = new Set(existing.rows.map(r => String(r.external_id)));

  for (const item of items) {
    if (done.has(item.key)) { result.skipped.push({ key: item.key, reason: 'bereits übernommen' }); continue; }
    if (!validCustomers.has(item.customerId)) { result.skipped.push({ key: item.key, reason: 'Kunde nicht gefunden' }); continue; }
    const occurred = new Date(item.occurredAt);
    if (isNaN(occurred.getTime())) { result.skipped.push({ key: item.key, reason: 'ungültiger Zeitpunkt' }); continue; }
    if (occurred.getTime() > Date.now() + 5 * 60_000) { result.skipped.push({ key: item.key, reason: 'Zeitpunkt liegt in der Zukunft' }); continue; }

    // Kontakt + Ticket müssen zum Kunden bzw. zur Organisation gehören (sonst still weglassen)
    let contactId: string | null = null;
    if (item.contactId) {
      const c = await query(`SELECT id FROM customer_contacts WHERE id = $1 AND customer_id = $2`, [item.contactId, item.customerId]);
      contactId = c.rows[0]?.id ?? null;
    }
    let ticketId: string | null = null;
    if (item.ticketId) {
      const t = await query(`SELECT id FROM tickets WHERE id = $1 AND organization_id = $2`, [item.ticketId, organizationId]);
      ticketId = t.rows[0]?.id ?? null;
    }

    // Zeitbuchung vorab prüfen: Projekt muss zum Kunden gehören
    let projectId: string | null = null;
    // Verpasste Anrufe haben keine Gesprächsdauer → nie Zeit buchen
    const minutes = item.direction !== 'missed' && item.durationMinutes && item.durationMinutes > 0 ? Math.min(item.durationMinutes, 600) : null;
    if (item.time && minutes) {
      const p = await query(
        `SELECT id FROM projects WHERE id = $1 AND organization_id = $2 AND customer_id = $3 AND deleted_at IS NULL`,
        [item.time.projectId, organizationId, item.customerId]
      );
      if (!p.rows[0]) { result.skipped.push({ key: item.key, reason: 'Projekt gehört nicht zu diesem Kunden' }); continue; }
      projectId = String(p.rows[0].id);
    }

    const missed = item.direction === 'missed';
    const subject = (item.subject?.trim() || (missed ? 'Verpasster Anruf' : item.direction === 'outbound' ? 'Telefonat (ausgehend)' : 'Telefonat (eingehend)')).slice(0, 255);
    const followUp = missed || item.followUp === true;
    const followUpDate = followUp ? (item.followUpDate || new Date().toISOString().slice(0, 10)) : null;
    const interactionId = crypto.randomUUID();

    await query(
      `INSERT INTO customer_interactions (
         id, organization_id, customer_id, contact_id, user_id, type, direction, subject, content,
         ticket_id, duration_minutes, occurred_at, follow_up_required, follow_up_date, follow_up_assigned_to,
         follow_up_notes, outcome, tags, external_id, external_source
       ) VALUES ($1, $2, $3, $4, $5, 'call', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        interactionId, organizationId, item.customerId, contactId, userId,
        item.direction === 'outbound' ? 'outbound' : 'inbound',
        subject, item.content?.trim() || null, ticketId, minutes, occurred.toISOString(),
        followUp, followUpDate, followUp ? userId : null,
        missed ? 'Rückruf' : null, missed ? 'pending' : null,
        missed ? ['anrufliste', 'verpasst'] : ['anrufliste'],
        item.key, EXTERNAL_SOURCE,
      ]
    );

    let timeEntryId: string | null = null;
    if (projectId && minutes && item.time) {
      timeEntryId = crypto.randomUUID();
      const end = new Date(occurred.getTime() + minutes * 60_000);
      const description = (item.time.description?.trim() || item.subject?.trim() || item.content?.trim().split('\n')[0] || 'Telefonat').slice(0, 500);
      await query(
        `INSERT INTO time_entries (id, user_id, organization_id, project_id, ticket_id, start_time, end_time, duration,
                                   description, is_running, is_billable, created_at, entry_scope, customer_visibility)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10, NOW(), 'customer_project', 'hidden')`,
        [timeEntryId, userId, organizationId, projectId, ticketId, occurred.toISOString(), end.toISOString(),
          minutes * 60, description, item.time.isBillable]
      );
      // Nachtrag in abgeschlossenem Monat → Nachtrags-Protokoll wie bei jeder Erfassung
      if (isRetroactive(occurred)) {
        const actor = await query(`SELECT COALESCE(display_name, username) AS n FROM users WHERE id = $1`, [userId]).catch(() => ({ rows: [] as Record<string, unknown>[] }));
        void logRetroChange({
          organizationId, entryId: timeEntryId, actorId: userId,
          actorName: String(actor.rows[0]?.n ?? 'Unbekannt'), action: 'create', entryDate: occurred,
          before: null,
          after: { startTime: occurred.toISOString(), endTime: end.toISOString(), duration: minutes * 60, description, projectId, ticketId, isBillable: item.time.isBillable, entryScope: 'customer_project' },
        });
      }
    }

    await query(
      `UPDATE customer_metrics SET last_interaction_date = NOW(), interactions_count = interactions_count + 1
        WHERE customer_id = $1 AND period_end >= CURRENT_DATE`,
      [item.customerId]
    ).catch(() => undefined);

    done.add(item.key);
    result.created.push({ key: item.key, interactionId, timeEntryId });
  }
  return result;
}

/** Stichworte → kurze, sachliche Gesprächsnotiz (optional, auf Knopfdruck). */
export async function polishNote(organizationId: string, input: { notes: string; customerName?: string | null; direction?: string | null }): Promise<{ subject: string | null; note: string }> {
  const config = await invoiceProcessorService.getOrgAiConfig(organizationId);
  if (!config) throw new CallLogError('Der KI-Assistent ist nicht eingerichtet (Einstellungen → KI-Assistent).');
  const prompt = `Formuliere aus den Stichworten eine kurze, sachliche Gesprächsnotiz für das CRM eines IT-Dienstleisters.
Deutsch, Stichpunkte oder 1–3 Sätze, keine Anrede, nichts dazuerfinden, Zusagen und nächste Schritte klar benennen.
Antworte NUR mit JSON: {"subject": "Betreff in max. 8 Wörtern", "note": "Notiz"}
${input.customerName ? `Kunde: ${input.customerName}\n` : ''}${input.direction ? `Richtung: ${input.direction}\n` : ''}
<<STICHWORTE (vom Nutzer)>>
${input.notes.slice(0, 4000)}
<<ENDE>>`;
  const text = await invoiceProcessorService.callAI(config, prompt, 600);
  const m = text.match(/\{[\s\S]*\}/);
  const fallback = { subject: null, note: input.notes };
  if (!m) return fallback;
  try {
    const parsed = JSON.parse(m[0]) as { subject?: unknown; note?: unknown };
    return {
      subject: typeof parsed.subject === 'string' ? parsed.subject.slice(0, 120) : null,
      note: typeof parsed.note === 'string' && parsed.note.trim() ? parsed.note.slice(0, 4000) : input.notes,
    };
  } catch {
    return fallback;
  }
}
