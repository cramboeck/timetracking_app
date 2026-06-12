import cron from 'node-cron';
import { pool } from '../config/database';
import { invoiceProcessorService } from '../services/invoiceProcessorService';
import { logger } from '../utils/logger';

/**
 * sevDesk-Voucher-Sync Background Job.
 * Spiegelt alle eingehenden Vouchers (creditDebit='D') aus sevDesk
 * in processed_invoices (mit source='sevdesk_import'), damit Belege
 * die direkt in sevDesk oder am System vorbei angelegt wurden
 * trotzdem in der Inbox, der globalen Suche und im Finanzen-Belege-
 * Tab erscheinen. Laeuft alle 30 Minuten ueber alle Orgs, die eine
 * gueltige sevdesk_config haben.
 */
export function startSevdeskVoucherSyncJob() {
  cron.schedule('*/30 * * * *', async () => {
    try {
      await runVoucherSync();
    } catch (error: any) {
      logger.error(`sevDesk-Voucher-Sync-Job error: ${error.message}`);
    }
  });

  logger.info('✅ sevDesk-Voucher-Sync-Job gestartet (alle 30 Minuten)');
}

async function runVoucherSync() {
  // sevdesk_config ist per-user (legacy). Holt die distincten Org-IDs aller
  // User mit konfiguriertem Token, damit wir die Sync-Methode pro Org einmal
  // aufrufen.
  const result = await pool.query(`
    SELECT DISTINCT u.organization_id
    FROM sevdesk_config sc
    JOIN users u ON sc.user_id = u.id
    WHERE sc.api_token IS NOT NULL AND sc.api_token <> ''
      AND u.organization_id IS NOT NULL
  `);

  if (result.rows.length === 0) {
    return;
  }

  logger.info(`sevDesk-Voucher-Sync: ${result.rows.length} Org(s) zu syncen`);

  for (const row of result.rows) {
    try {
      await invoiceProcessorService.syncSevdeskVouchers(row.organization_id);
    } catch (err: any) {
      logger.error(`Org ${row.organization_id}: sync fehlgeschlagen: ${err.message}`);
    }
  }
}
