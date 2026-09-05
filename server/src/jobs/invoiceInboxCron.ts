import cron from 'node-cron';
import { pool } from '../config/database';
import { invoiceProcessorService } from '../services/invoiceProcessorService';
import { emailService } from '../services/emailService';
import { sendPushToUser } from '../services/pushNotifications';
import { logger } from '../utils/logger';

/**
 * Invoice Inbox Cron Job
 * Polls the invoice mailbox every 15 minutes for all organizations
 * that have Microsoft 365 configured with an invoice mailbox.
 *
 * Flow:
 * 1. Fetch unread emails from invoice mailbox
 * 2. Extract PDF attachments
 * 3. Run OCR/AI extraction
 * 4. Create draft entries in processed_invoices
 * 5. User reviews and confirms -> sevDesk voucher
 */
export function startInvoiceInboxJob() {
  // Run every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      await processAllInvoiceMailboxes();
    } catch (error: any) {
      logger.error(`Invoice inbox cron error: ${error.message}`);
    }
  });

  logger.info('✅ Invoice Inbox Cron gestartet (alle 15 Minuten)');
}

/**
 * Manual trigger for invoice mailbox processing
 */
export async function triggerInvoiceMailboxProcessing(organizationId: string): Promise<{
  success: boolean;
  processed: number;
  skipped: number;
  failed: number;
  message: string;
}> {
  try {
    const result = await invoiceProcessorService.processInvoiceMailbox(organizationId, {
      includeRead: false,
    });

    // Auto-extract data for new drafts
    if (result.processedCount > 0) {
      await autoExtractDraftData(organizationId);
    }

    return {
      success: result.success,
      processed: result.processedCount,
      skipped: result.skippedCount,
      failed: result.failedCount,
      message: `${result.processedCount} neue Belege, ${result.skippedCount} übersprungen, ${result.failedCount} fehlgeschlagen`,
    };
  } catch (error: any) {
    logger.error(`Manual invoice mailbox trigger failed: ${error.message}`);
    return {
      success: false,
      processed: 0,
      skipped: 0,
      failed: 0,
      message: error.message,
    };
  }
}

async function processAllInvoiceMailboxes() {
  // Find all organizations with Microsoft 365 invoice mailbox configured
  const result = await pool.query(`
    SELECT DISTINCT organization_id
    FROM microsoft365_config
    WHERE invoice_mailbox IS NOT NULL
      AND invoice_mailbox <> ''
      AND is_configured = true
  `);

  if (result.rows.length === 0) {
    return;
  }

  logger.info(`Invoice Inbox Cron: ${result.rows.length} Org(s) mit Rechnungs-Mailbox`);

  for (const row of result.rows) {
    try {
      const processResult = await invoiceProcessorService.processInvoiceMailbox(
        row.organization_id,
        { includeRead: false }
      );

      if (processResult.processedCount > 0) {
        logger.info(`Org ${row.organization_id}: ${processResult.processedCount} neue Belege verarbeitet`);

        // Auto-extract data for drafts
        await autoExtractDraftData(row.organization_id);

        // Admins benachrichtigen — vorher entstanden Entwuerfe still und
        // wurden erst beim naechsten manuellen Blick in die Inbox entdeckt
        await notifyAdminsAboutNewDrafts(row.organization_id, processResult.processedCount)
          .catch(err => logger.error(`Beleg-Benachrichtigung fehlgeschlagen: ${err.message}`));
      }
    } catch (err: any) {
      logger.error(`Org ${row.organization_id}: Invoice processing failed: ${err.message}`);
    }
  }
}

/**
 * Org-Admins/Owner ueber neue Beleg-Entwuerfe informieren (E-Mail + Push).
 * Wird nur bei processedCount > 0 aufgerufen — der 15-Minuten-Cron feuert
 * also nur, wenn wirklich neue Belege eingegangen sind (kein Spam).
 */
async function notifyAdminsAboutNewDrafts(organizationId: string, count: number) {
  const admins = await pool.query(
    `SELECT u.id, u.email, u.username
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     WHERE om.organization_id = $1 AND om.role IN ('owner', 'admin')
       AND u.email IS NOT NULL AND u.email <> ''`,
    [organizationId]
  );
  if (admins.rows.length === 0) return;

  const baseUrl = process.env.FRONTEND_URL || 'https://app.ramboeck.it';
  const link = `${baseUrl}/finanzen/invoices`;
  const label = count === 1 ? '1 neuer Beleg' : `${count} neue Belege`;

  for (const admin of admins.rows) {
    // Push (laeuft ins Leere, solange VAPID nicht konfiguriert ist — ok)
    await sendPushToUser(admin.id, {
      title: 'Rechnungseingang',
      body: `${label} zur Prüfung`,
      tag: 'invoice-inbox',
      data: { url: '/finanzen/invoices', type: 'invoice_inbox' },
    }).catch(() => { /* Push ist best effort */ });

    await emailService.sendEmail({
      to: admin.email,
      subject: `RamboFlow: ${label} im Rechnungseingang`,
      html: `<p>Hallo ${admin.username},</p>
        <p>im Rechnungspostfach ${count === 1 ? 'ist' : 'sind'} <strong>${label}</strong> eingegangen
        und ${count === 1 ? 'wartet' : 'warten'} als Entwurf auf deine Prüfung.</p>
        <p><a href="${link}" style="display:inline-block;background-color:#F27024;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:6px;font-weight:600;">Rechnungseingang öffnen</a></p>
        <p style="font-size:12px;color:#6b7280;">Nach der Bestätigung wird der Beleg automatisch in sevDesk angelegt.</p>`,
      text: `Hallo ${admin.username},\n\nim Rechnungspostfach ${count === 1 ? 'ist' : 'sind'} ${label} eingegangen und ${count === 1 ? 'wartet' : 'warten'} als Entwurf auf deine Prüfung.\n\n${link}`,
    }).catch(err => logger.error(`Beleg-Mail an ${admin.email} fehlgeschlagen: ${err.message}`));
  }

  logger.info(`Rechnungseingang: ${admins.rows.length} Admin(s) über ${label} benachrichtigt`);
}

/**
 * Auto-extract invoice data for all pending drafts
 */
async function autoExtractDraftData(organizationId: string) {
  // Get all drafts without extraction
  const drafts = await pool.query(`
    SELECT id FROM processed_invoices
    WHERE organization_id = $1
      AND status IN ('pending', 'draft')
      AND extracted_at IS NULL
    ORDER BY received_at DESC
    LIMIT 10
  `, [organizationId]);

  for (const draft of drafts.rows) {
    try {
      await invoiceProcessorService.extractInvoiceData(organizationId, draft.id);

      // Update status to draft after successful extraction
      await pool.query(
        `UPDATE processed_invoices SET status = 'draft' WHERE id = $1`,
        [draft.id]
      );
    } catch (err: any) {
      logger.error(`Auto-extract for invoice ${draft.id} failed: ${err.message}`);
    }
  }
}
