import cron from 'node-cron';
import { pool } from '../config/database';
import { mailboxMonitorService } from '../services/mailboxMonitorService';
import { logger } from '../utils/logger';

/**
 * Support Inbox Cron Job
 *
 * Pollt das Support-Postfach alle 2 Minuten für alle Organisationen mit
 * konfigurierter Support-Mailbox und aktiviertem Inbox-Monitoring
 * (Settings → Microsoft 365 → "Inbox-Monitoring").
 *
 * Ziel: Kundenantworten dürfen nicht davon abhängen, dass jemand die
 * SupportInbox öffnet und klickt. Jede ungelesene Mail wird gegen die
 * Zuordnungs-Kaskade geprüft (Ticket-Nummer im Betreff → conversationId →
 * In-Reply-To/References). Bei Treffer wird sie automatisch ans Ticket
 * gehängt (inkl. Anhänge, Statuswechsel waiting→open, Aktivitätslog,
 * Push an den Bearbeiter) und als gelesen markiert.
 *
 * Ohne Treffer bleibt die Mail ungelesen — sie erscheint weiter in der
 * SupportInbox als Triage-Fall für einen Menschen. Bei Tickets, die seit
 * mehr als REOPEN_WINDOW_DAYS geschlossen sind, wird bewusst NICHT
 * automatisch wiedereröffnet — auch das bleibt Triage.
 */

const REOPEN_WINDOW_DAYS = 14;
const MAX_EMAILS_PER_RUN = 25;

let running = false;

export function startSupportInboxJob() {
  cron.schedule('*/2 * * * *', async () => {
    if (running) return; // Überlappende Läufe vermeiden
    running = true;
    try {
      await processAllSupportMailboxes();
    } catch (error: any) {
      logger.error(`Support inbox cron error: ${error.message}`);
    } finally {
      running = false;
    }
  });

  logger.info('✅ Support Inbox Cron gestartet (alle 2 Minuten, nur Orgs mit aktiviertem Inbox-Monitoring)');
}

async function processAllSupportMailboxes() {
  const result = await pool.query(`
    SELECT organization_id, support_mailbox, mail_from
    FROM microsoft365_config
    WHERE support_mailbox IS NOT NULL
      AND support_mailbox <> ''
      AND is_configured = true
      AND COALESCE(features_enabled->>'inboxMonitoring', 'false') = 'true'
  `);

  for (const row of result.rows) {
    try {
      await processSupportMailbox(row.organization_id, row.support_mailbox, row.mail_from);
    } catch (error: any) {
      logger.error(`Support inbox cron failed for org ${row.organization_id}: ${error.message}`);
    }
  }
}

/**
 * Verarbeitet das Support-Postfach einer Organisation.
 * Exportiert für den manuellen Trigger aus den Settings.
 */
export async function processSupportMailbox(
  organizationId: string,
  supportMailbox: string,
  mailFrom: string | null
): Promise<{ attached: number; skipped: number }> {
  // Import hier statt oben: microsoft365.ts importiert seinerseits aus
  // tickets.ts — so bleibt der Modul-Graph beim Serverstart schlank
  const { findTicketForEmail, applyInboundEmailSideEffects, saveEmailToTicket } = await import('../routes/microsoft365');

  const inbox = await mailboxMonitorService.getUnreadEmails(organizationId, {
    mailboxType: 'support',
    includeRead: false,
    maxResults: MAX_EMAILS_PER_RUN,
  });

  if (!inbox.success || !inbox.emails || inbox.emails.length === 0) {
    return { attached: 0, skipped: 0 };
  }

  const ownAddresses = [supportMailbox, mailFrom]
    .filter((a): a is string => !!a)
    .map(a => a.toLowerCase());

  let attached = 0;
  let skipped = 0;

  for (const email of inbox.emails) {
    try {
      // Loop-Schutz: eigene Absender (Support-Postfach, Versandadresse)
      // niemals automatisch verarbeiten
      if (ownAddresses.includes((email.from.email || '').toLowerCase())) {
        skipped++;
        continue;
      }

      const match = await findTicketForEmail(organizationId, email, email.id, { fetchHeaders: true });
      if (!match) {
        skipped++; // bleibt ungelesen → Triage in der SupportInbox
        continue;
      }

      // Lange geschlossene Tickets nicht automatisch wiedereröffnen —
      // solche Mails soll ein Mensch triagieren (neues Ticket mit Bezug)
      if (match.status === 'closed' && match.closedAt) {
        const ageDays = (Date.now() - new Date(match.closedAt).getTime()) / 86_400_000;
        if (ageDays > REOPEN_WINDOW_DAYS) {
          skipped++;
          continue;
        }
      }
      if (match.status === 'archived') {
        skipped++;
        continue;
      }

      await saveEmailToTicket(organizationId, match.id, email, email.id, 'inbound');
      await applyInboundEmailSideEffects(organizationId, match.id, email, null, match.matchedBy);
      await mailboxMonitorService.markAsRead(organizationId, email.id, 'support');
      attached++;

      logger.info(`📧 Support inbox: Mail von ${email.from.email} automatisch an ${match.ticketNumber} gehängt (${match.matchedBy})`);
    } catch (error: any) {
      logger.error(`Support inbox: Fehler bei Mail ${email.id}: ${error.message}`);
      skipped++;
    }
  }

  if (attached > 0) {
    logger.info(`📧 Support inbox org ${organizationId}: ${attached} Mail(s) automatisch zugeordnet, ${skipped} in Triage belassen`);
  }

  return { attached, skipped };
}
